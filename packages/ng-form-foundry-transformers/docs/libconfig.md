# The libconfig transformer — format, parser, and round-trip design

`libconfigTransformer` (**beta** — it logs a one-time console warning on first
use) edits [libconfig](https://hyperrealm.github.io/libconfig/) documents: the
`.cfg`/`.conf` files consumed by C/C++ software such as srsRAN and
OpenAirInterface. This document describes the format, how the parser is
implemented, and how the transformer's output flows into and back out of
`ng-form-foundry`.

Everything lives in `src/transformers/libconfig/` with no dependencies:

| File | Role |
| --- | --- |
| `parser.ts` | source text → positioned, metadata-carrying AST |
| `schema.ts` | AST → `NodeGroup` schema + plain `initialValue` |
| `revert.ts` | edited value + AST → new source text (span splicing) |
| `libconfig-transformer.ts` | the `Transformer` shell: options, beta warning |

## The libconfig format

libconfig is a structured, **statically typed** configuration format. A
document is a sequence of *settings*; each setting is a name, an assignment
mark, a value, and an optional terminator:

```
name = value;      # '=' or ':' assign; the terminator is ';', ',', or nothing
```

Setting names start with a letter or `*` and may contain letters, digits,
`-`, `_`, `*`, and `.`. Within one group, names must be unique.

**Values** are one of:

- **Group `{ … }`** — named sub-settings, like a JSON object with fixed keys.
- **Array `[ … ]`** — zero or more **scalars of one type**, comma-separated.
- **List `( … )`** — zero or more values of **any** type, including groups
  and nested lists. In practice (srsRAN `cell_list`, OAI `RUs`) lists hold
  homogeneous groups; the heterogeneous capability is rarely used.
- **Scalars**:
  - *int* — decimal (`42`, `-7`), hex (`0x1A`), and the newer binary/octal
    forms (`0b1010`, `0o17`);
  - *int64* — an `L` or `LL` suffix (`9223372036854775807L`); large literals
    without a suffix auto-promote in libconfig ≥ 1.7;
  - *float* — `3.14`, `.5`, `5.`, `1.5e-3`;
  - *bool* — `true`/`false`, case-insensitive (`TRUE`, `False`);
  - *string* — double-quoted with `\\ \" \n \r \t \f \v \xHH` escapes.
    **Adjacent literals concatenate**: `"cell" "-a"` (even across lines) is
    the single string `cell-a`.

Comments come in three forms — `# …`, `// …`, `/* … */` — and real-world
files are dense with them (srsRAN examples are roughly 40 % comments,
including commented-out optional settings that serve as documentation).
`@include "file"` splices another file at parse time in the C library.

The static typing is the property that shapes this transformer: the consuming
program reads settings through **typed lookups** (`config_lookup_int`,
`config_lookup_float`, `config_lookup_int64`, …). Writing `21` where `21.0`
stood does not produce a slightly different file — it produces a setting the
program can no longer read. Every write-back decision below follows from
that.

## The parser

`parser.ts` is a hand-rolled, single-pass recursive-descent parser
(~370 lines). It is implemented independently from the published libconfig
manual — not from the C library's `grammar.y`/`scanner.l` — which keeps this
Apache-2.0 package clear of the C library's LGPL. There is no separate token
stream; the parser scans the source directly with anchored regular
expressions (`NAME_RE`, `INT_RE`, `FLOAT_RE`, `BOOL_RE`) and a `skipTrivia()`
that consumes whitespace and all three comment forms.

Two properties make it "lossless" for our purposes without modeling trivia:

1. **Every node carries its span.** `CfgSetting`, `CfgGroup`, `CfgArray`,
   `CfgList`, and `CfgScalar` each record their `[start, end)` range in the
   source; groups and collections also record an `innerSpan` (the region
   between the delimiters — the insertion window). Comments are *skipped*,
   not stored: since the revert only ever replaces edited value spans, every
   unedited byte — comments, indentation, `=` vs `:`, terminator style,
   delimiter choice — survives verbatim by construction.
2. **Every scalar carries emission metadata.** An integer records its
   `IntMeta { radix, suffix, digits }` (radix 2/8/10/16, the verbatim
   `L`/`LL` suffix, and the digit count for width-preserving hex edits). A
   float is typed `float` even when its value is integral. This is what lets
   an edit re-emit in the source's own style.

Scalar disambiguation runs bool → string → **float → int** (float first, so
`1.5` does not lex as int `1` followed by junk). Integer literals are parsed
through `BigInt` so precision is never lost: a value inside the IEEE-754 safe
range becomes a JS number; anything beyond ±2^53 is carried as its exact
decimal-digit **string** — the same strategy the YAML/JSON transformers use
(`core/bigint.ts`).

The parser enforces what libconfig itself enforces, with positioned
`LibconfigParseError`s (line and column): duplicate setting names in one
group, non-scalar or mixed-type array elements, unterminated strings and
block comments. `@include` is **rejected by default** — a parsed form would
silently show less than the C reader sees; with `{ includes: 'opaque' }` the
directive line is skipped (it survives verbatim in the source, and the
included settings stay invisible to the form).

## Forward: how ng-form-foundry consumes the output

`toSchema(source, options?)` returns the standard transformer triple:

```
{ schema: NodeGroup, binding: { source, root: CfgGroup }, initialValue }
```

The host keeps `binding` server-side and hands `schema` + `initialValue` to
the Angular library:

```ts
const form = buildFormFromSchema(schema, initialValue);
```

rendered by `<nff-dynamic-recursive-form>` or `<nff-config-editor>` like any
other schema.

**Inferred mode** (no JSON Schema) builds the schema from the AST rather than
from plain data, because the typed literals carry more information than the
values alone:

| libconfig construct | schema node |
| --- | --- |
| group `{ }` | `nodeGroup` |
| int / hex / binary / octal | number leaf, `integer: true` |
| float | number leaf (no integer flag — a float slot) |
| bool / string | boolean / string leaf |
| int64 beyond ±2^53 | **string** leaf with an integer-digits `pattern` |
| array `[ ]`, list `( )` of same-family scalars | `leafList` |
| list `( )` of groups | `nodeGroupList` |
| empty `[ ]` / `( )`, heterogeneous list | **read-only** string leaf carrying the verbatim source text |
| `@include` (opaque mode) | not represented |

A list of groups infers its item type as the **union of keys observed across
entries**, and any key missing from at least one entry is marked
`presence: true`. Without that rule, building an entry that lacks the key
would materialize a null control, and the write-back would *insert* settings
into entries the user never touched.

Empty and heterogeneous collections have no honest element type — libconfig's
static typing means guessing (say, string) could write `"5"` where the C
program reads an int — so inference surfaces them read-only, round-tripping
byte-identically.

**Schema-driven mode** (`{ schema, schemaOptions? }`) replaces inference with
`jsonSchemaToNodeGroup`, exactly as in the YAML/JSON transformers: presence
toggles for optional properties, enums, ranges, `mandatory` choices — and
typed **empty collections become editable**, because the JSON Schema's
`items` supplies the element type the file cannot. Extraction differs in one
spot to match: an empty collection extracts as a real `[]` (the schema types
it) instead of the read-only raw string.

Extraction builds all records with `Object.create(null)`, so no setting name
can collide with `Object.prototype` (`__proto__` is additionally illegal as a
libconfig name — it starts with `_`).

If the JSON Schema contains `anyOf`/`oneOf` (choices), read the edited form
with the library's `serializeForm(schema, form)` before calling `toSource`,
as with YAML/JSON — the inferred mode never produces choices, so
`getRawValue()` suffices there.

## Backward: `toSource` by span splicing

`toSource(value, binding)` compares the edited value against the AST **node
by node** and collects text edits `{ start, end, text }`, applied in
descending position order. Nothing is regenerated wholesale; the original
text is the substrate.

Per shape:

- **Scalar** — if the value differs, splice a replacement literal formatted
  by the node's own metadata:
  - a *float* slot always emits a float: `21` → `21.0`;
  - an *int* slot re-emits in its source radix, hex zero-padded to the
    original digit width (`0x0A` edited to 11 → `0x0B`), suffix appended;
  - the *int64 string carry* validates the incoming digits (junk throws —
    silent corruption is never an option) and re-appends the source suffix;
  - *bool* edits emit lowercase (readers are case-insensitive);
  - *string* edits re-quote with canonical escapes. Editing a concatenated
    string (`"cell" "-a"`) collapses the split literals into one —
    value-preserving, formatting-lossy for that one setting.
- **Group** — recurse per key. A key deleted from the value removes the whole
  setting line when the setting owns the line: leading indent, the setting,
  trailing spaces, a trailing `#`/`//` comment, and the newline. A key added
  to the value inserts `name = value;` on a fresh line at the group's own
  indent, *after the last setting's line* (so an inline comment stays with
  its setting) — or before the closing brace / at end of file when the group
  is empty.
- **Arrays and lists** — patched element-wise **inside their existing
  delimiters**: edits splice element spans, growth inserts after the last
  element, shrinkage deletes trailing element spans. The `[ ]`-vs-`( )`
  question never arises for existing collections, because the AST node the
  patch is anchored to *is* a `CfgArray` or a `CfgList` — the delimiters are
  simply never part of any edit.
- **Read-only carries** (empty/heterogeneous collections in inferred mode)
  round-trip verbatim: the extracted value equals the raw source slice, so
  the comparison finds nothing to change.

Only two situations synthesize text with no source anchor, via
`serialize()`: a **newly added setting** and a **shape change** (the value's
kind no longer matches the AST node's). There the typing is value-driven —
integral numbers emit as ints, fractional as floats, arrays emit `( … )` when
any element is a group or nested collection (libconfig arrays hold scalars
only) and `[ … ]` otherwise — and any comments inside a regenerated subtree
are lost, the same policy the YAML transformer applies when it must create
fresh nodes.

## Guarantees and beta limitations

Guaranteed (and pinned in `test/libconfig.test.ts`):

- An untouched form round-trips **byte-identically**, comments and all.
- A single scalar edit changes exactly one literal in the output.
- Types survive edits: float slots stay floats, hex stays hex at width,
  `L`/`LL` suffixes stay, int64 precision is exact end to end.

Known beta limitations:

- New settings are value-typed: a fresh integral number becomes an int even
  where the consumer expects a float (route such additions through a slot
  that exists in the source, or accept the typing).
- Heterogeneous lists are read-only; empty collections are read-only without
  a JSON Schema.
- In `'opaque'` include mode the form edits only the parent file; included
  settings are invisible.
- `minItems`/`maxItems`-style cardinality is not enforced on inferred lists.

Until the feature exits beta, diff every `toSource` output against the
original file before deploying it — that is what the one-time startup warning
is asking of you.
