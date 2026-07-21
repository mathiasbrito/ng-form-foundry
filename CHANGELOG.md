# Changelog

Notable changes to `ng-form-foundry` (the Angular library) and
`ng-form-foundry-transformers`. Both packages release together at the same
version. The format follows [Keep a Changelog](https://keepachangelog.com/).

## [0.5.2] — 2026-07-21

### Fixed
- **A container-shape mismatch between document and schema now throws
  instead of silently erasing the section** (YAML, JSON, libconfig). A
  schema declaring a section an array while the document holds an object
  (or a scalar where it holds a collection) used to produce an empty,
  valid-looking form whose save deleted the section's contents. `toSchema`
  now throws a `SchemaShapeError` naming the offending path, so consumers
  can catch it and fall back to inferred editing. Scalar-vs-scalar
  differences remain editable, not errors.
- **A type-changing integral edit writes an integer literal** (libconfig).
  Editing a quoted string slot (wild configs carry `"0xe00"`-style quoted
  ints) to a number under an `integer` schema previously emitted a float
  literal (`3585.0`); it now emits `3585`. Float form is reserved for
  genuinely fractional values and float-typed slots.
- Schema-driven forms now display hex/octal/binary values in the base the
  document wrote them in, in every `unknownKeys` mode (YAML and libconfig).
  Previously only inferred forms and `'edit'` mode carried the `radix`
  display hint; a schema-covered `pci = 0x1A` rendered as decimal `26` even
  though saves always kept the hex spelling.

## [0.5.1] — 2026-07-21

### Fixed
- **A partial JSON Schema no longer deletes uncovered keys on save** — in
  the libconfig, YAML, and JSON transformers alike. In schema-driven mode
  the edited value is now authoritative only for schema-covered paths: keys
  the schema does not mention — top-level or nested inside covered groups
  and list entries — survive verbatim (comments included where the format
  has them), so a config can be edited through a schema that covers just the
  fields of interest. Removing a schema-covered optional still deletes it.
  The new `unknownKeys` option makes the behavior explicit: `'preserve'` is
  the default, `'drop'` opts an intentionally complete schema back into
  deleting uncovered keys (sanitizing a config, enforcing a strict
  template).

### Added
- **`unknownKeys: 'edit'`** (YAML, JSON, libconfig): surface the keys a
  partial JSON Schema does not cover instead of hiding them — they render as
  editable fields typed by the document's own values (in document order,
  hex/octal display hints included), while covered keys keep their typed,
  validated schema nodes. Nothing in the file is invisible, and the whole
  document is editable through one form.

### Changed
- The YAML transformer's binding is now an object (`{ doc, schema? }`)
  instead of the bare parsed document, and the JSON transformer's binding
  gained optional fields. Bindings are opaque — build them with `toSchema`
  and hand them back to `toSource` — so code doing exactly that is
  unaffected.

## [0.5.0] — 2026-07-20

### Changed
- **The libconfig transformer is stable.** The beta flag is gone: no more
  one-time console warning, and the format's guarantees and known limitations
  are documented in the transformers guide. (The beta-only
  `resetLibconfigBetaWarning` helper is removed with it.)

### Added
- **Hexadecimal, octal, and binary fields.** A value written as `0x1A`,
  `0o17`, or `0b101` in the source document now displays and edits in that
  base — with the prefix, normalized as you leave the field — and is written
  back in the same base. Set `radix: 16 | 8 | 2` on a number leaf (the
  libconfig and YAML transformers set it for you), or use the exported
  `RadixInputDirective` in your own components. The form value remains a plain
  number, so `min`/`max` and the other numeric constraints keep working, and
  text that isn't a valid number in the field's base marks the field invalid
  instead of ever reaching your data.
- **Complete-form preview.** Set `showAbsentOptionals` on
  `nff-dynamic-recursive-form` to display optional fields that are not part of
  the value yet: they appear dimmed and read-only, showing their default as a
  placeholder, each with a **(+)** button that adds the field to the form.
  Until added, they contribute nothing to the form value and cannot make the
  form invalid.

## [0.4.1] — 2026-07-20

### Fixed
- **libconfig editing is considerably more robust.** All integer notations the
  format supports are now accepted, including `0q` octal. Files mixing very
  large (64-bit) and ordinary integers in one collection are preserved exactly
  on save. A negative number entered into a hex/octal/binary field is written
  in a notation the consuming program can read. `@include` directives are
  accepted everywhere the format allows them. Malformed documents — bad
  escape sequences, invalid literals, extreme nesting — now fail with a clear
  parse error and line/column position instead of an unhandled exception, and
  read-only collections can no longer be corrupted by an edited value.

## [0.4.0] — 2026-07-19

### Added
- **Declarative field layout.** An `appearance` option on any group arranges
  its fields on a CSS grid (`grid: { rows, cols }`), packs as many
  equal-width fields per row as fit (`minFieldWidth`), gathers checkboxes
  into a compact row (`booleanFields: 'beginning' | 'end'`), and bounds
  text/number field widths. Declared once, the options cascade to nested
  groups, list items, map entries, and choice cases — any node can override.

### Fixed
- Add/remove buttons name their target field in tooltip and screen-reader
  label.
- The config editor shows your schema's title on the root row.

## [0.3.5] — 2026-07-18

### Added
- **Thesaurus.** Pass a plain `identifier → { label, description }` catalog to
  any transformer or to `jsonSchemaToNodeGroup` and the generated form gets
  human-readable labels and help texts. An identifier that means different
  things in different places can carry per-context variants (`under`).

### Fixed
- Choice selectors always show distinct option labels, even when two cases
  would otherwise be titled identically.

## [0.3.4] — 2026-07-18

### Added
- **libconfig transformer (beta).** Edit srsRAN/OAI-style `.cfg`/`.conf`
  files as forms: comments, formatting, and value types are preserved on save
  (a float stays a float, a hex value stays hex, 64-bit integers keep their
  suffix and exact precision).
- `minPresent`/`maxPresent` let a group require how many of its optional
  fields are filled in (JSON Schema `minProperties`/`maxProperties`).
- Config editor improvements: edit and expand-all toggles on the root row,
  delete controls next to each section heading, add buttons following their
  items, and a tree pane that stays visible while a long detail page scrolls.

### Fixed
- The library's button styling is fully self-contained — no global stylesheet
  import required.

## [0.3.3] — 2026-07-18

### Added
- Optional properties of a JSON Schema become **presence** fields: absent
  until enabled, so an untouched form round-trips without inventing keys. A
  valid form now always serializes to a value the schema itself accepts.

### Fixed
- Loading initial data selects the right choice case when several look
  similar.
- Lists start empty instead of seeding a blank first entry.

## [0.3.2] — 2026-07-18

### Added
- `serializeForm(schema, form)` returns the clean wire value of a form
  containing choices, and `buildFormFromSchema` accepts that value back as
  initial data.

## [0.3.1] — 2026-07-18

### Added
- The config editor's detail pane shows the **whole selected subtree** as one
  flat, breadcrumb-sectioned page — the tree picks the scope, the detail
  edits everything under it.

### Fixed
- A broad reliability and accessibility release: map keys containing dots
  (such as IP addresses) are handled safely; optional fields behave correctly
  at any depth, including inside list items, map entries, and choice cases;
  an explicit `null` counts as a value; read-only fields can never leak edits
  into the form value; switching a choice case updates the value atomically;
  renaming a map entry keeps its position and its expanded state; the config
  editor tree is fully keyboard-operable and every icon-only button has an
  accessible name.

## [0.3.0] — 2026-07-17

Baseline for this changelog: the tree/detail config editor covering the full
node model (choices, maps, optional-field menus), and the
`ng-form-foundry-transformers` package with YANG, YAML, and JSON transformers.

[0.5.2]: https://github.com/mathiasbrito/ng-form-foundry/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/mathiasbrito/ng-form-foundry/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/mathiasbrito/ng-form-foundry/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/mathiasbrito/ng-form-foundry/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/mathiasbrito/ng-form-foundry/compare/v0.3.5...v0.4.0
[0.3.5]: https://github.com/mathiasbrito/ng-form-foundry/compare/v0.3.4...v0.3.5
[0.3.4]: https://github.com/mathiasbrito/ng-form-foundry/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/mathiasbrito/ng-form-foundry/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/mathiasbrito/ng-form-foundry/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/mathiasbrito/ng-form-foundry/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/mathiasbrito/ng-form-foundry/releases/tag/v0.3.0
