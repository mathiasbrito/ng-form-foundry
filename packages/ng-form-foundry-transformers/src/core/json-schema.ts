import type {
  Choice,
  ChoiceCase,
  Leaf,
  LeafList,
  LeafType,
  NodeGroup,
  NodeGroupList,
  NodeMap,
  NodeType,
} from './schema';

/**
 * The subset of JSON Schema (draft 2020-12, back-compatible with draft-07) this
 * transformer maps to a form. Only the keywords that shape a form are read;
 * anything else is ignored. The mapping drives *structure, types, and
 * constraints*; the library turns the constraints into validators, but no
 * validation happens here.
 */
export interface JsonSchema {
  $schema?: string;
  $id?: string;
  $ref?: string;
  /** Draft 2020-12 reusable subschemas (draft-07 used `definitions`). */
  $defs?: Record<string, JsonSchema>;
  definitions?: Record<string, JsonSchema>;
  type?: JsonSchemaType | JsonSchemaType[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  patternProperties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  enum?: unknown[];
  const?: unknown;
  title?: string;
  description?: string;
  default?: unknown;
  // string constraints
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  format?: string;
  // number constraints
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
  // cardinality
  minProperties?: number;
  maxProperties?: number;
  minItems?: number;
  maxItems?: number;
}

/** Options for {@link jsonSchemaToNodeGroup}. */
export interface JsonSchemaOptions {
  /**
   * Other schema documents a `$ref` may point at, matched by their `$id`. A
   * cross-file ref like `/jsonschemas/common#/$defs/UeId` resolves into the
   * document whose `$id` ends with `/jsonschemas/common`; refs *within* that
   * document then resolve against it.
   */
  refDocuments?: JsonSchema[];
}

type JsonSchemaType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';

const ROOT = '__root__';

/**
 * Map a JSON Schema whose top level is an object into a root {@link NodeGroup}.
 *
 * Supports draft 2020-12: local and cross-document `$ref` (see
 * {@link JsonSchemaOptions.refDocuments}) are inline-resolved; `object` →
 * nodeGroup (or a {@link NodeMap} when the keys are open via
 * `additionalProperties`/`patternProperties`); `anyOf`/`oneOf` → a {@link Choice}
 * (or a nullable leaf for the `[T, null]` shape); `array` → nodeGroupList or
 * leafList; a scalar (with `enum`, `const`, `type: [T, 'null']`, and the string /
 * number constraints) → a typed leaf. `required` marks child leaves, `title`
 * becomes the label, `default`/`const` carry a scalar value.
 */
export function jsonSchemaToNodeGroup(schema: JsonSchema, name: string = ROOT, options?: JsonSchemaOptions): NodeGroup {
  const documents = [schema, ...(options?.refDocuments ?? [])];
  const resolver = new RefResolver(schema, documents);
  const { schema: root, scope } = resolver.resolve(schema);
  const group = objectToNodeGroup(root, name, scope, root.title);
  group.root = true;
  return group;
}

// --- $ref resolution ----------------------------------------------------------

/** The resolved schema plus the resolver bound to the document it lives in. */
interface Resolved {
  schema: JsonSchema;
  scope: RefResolver;
}

/**
 * Resolves `$ref` chains, following them across documents. A resolver is bound to
 * one document (for `#/…` local refs); crossing into another document via a
 * `<path>#/…` ref yields a resolver bound to *that* document, so the resolved
 * schema's own local refs resolve correctly.
 */
class RefResolver {
  constructor(
    private readonly doc: JsonSchema,
    private readonly documents: JsonSchema[],
  ) {}

  resolve(schema: JsonSchema): Resolved {
    let current = schema;
    let doc = this.doc;
    const seen = new Set<string>();
    while (current && typeof current.$ref === 'string') {
      const key = `${current.$ref}@${doc.$id ?? ''}`;
      if (seen.has(key)) break; // cycle guard
      seen.add(key);
      const [docPath, fragment] = splitRef(current.$ref);
      const targetDoc = docPath ? findDocument(this.documents, docPath) ?? doc : doc;
      const target = resolveFragment(targetDoc, fragment);
      if (!target) break;
      current = target;
      doc = targetDoc;
    }
    return { schema: current, scope: doc === this.doc ? this : new RefResolver(doc, this.documents) };
  }
}

/** Split a `$ref` into its document part (URI without fragment) and its fragment. */
function splitRef(ref: string): [docPath: string | undefined, fragment: string] {
  const hash = ref.indexOf('#');
  if (hash === -1) return [ref || undefined, ''];
  return [ref.slice(0, hash) || undefined, ref.slice(hash + 1)];
}

/** The document whose `$id` equals or ends with the ref's document path. */
function findDocument(documents: JsonSchema[], docPath: string): JsonSchema | undefined {
  return documents.find((d) => typeof d.$id === 'string' && (d.$id === docPath || d.$id.endsWith(docPath)));
}

/** Walk a JSON Pointer fragment (`/$defs/UeId`) within a document. */
function resolveFragment(doc: JsonSchema, fragment: string): JsonSchema | undefined {
  if (!fragment || fragment === '/') return doc;
  let node: unknown = doc;
  for (const raw of fragment.split('/')) {
    if (raw === '') continue;
    const segment = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node as JsonSchema | undefined;
}

// --- objects / maps -----------------------------------------------------------

function objectToNodeGroup(schema: JsonSchema, name: string, resolver: RefResolver, label?: string): NodeGroup {
  const required = new Set(schema.required ?? []);
  const children: Record<string, NodeType> = {};
  for (const [key, propSchema] of Object.entries(schema.properties ?? {})) {
    children[key] = schemaToNode(key, propSchema, required.has(key), resolver);
  }
  const group: NodeGroup = { kind: 'nodeGroup', name, children };
  if (label) group.label = label;
  return group;
}

/** An `object` with open keys — `additionalProperties: <schema>` or `patternProperties`, and no fixed `properties`. */
function isOpenMap(schema: JsonSchema): boolean {
  if (schema.properties && Object.keys(schema.properties).length) return false;
  const ap = schema.additionalProperties;
  const additionalIsSchema = ap != null && typeof ap === 'object';
  const hasPattern = !!schema.patternProperties && Object.keys(schema.patternProperties).length > 0;
  return additionalIsSchema || hasPattern;
}

function objectToMap(name: string, schema: JsonSchema, resolver: RefResolver): NodeMap {
  let valueSchema: JsonSchema = {};
  let keyPattern: string | undefined;
  const pattern = schema.patternProperties && Object.entries(schema.patternProperties)[0];
  if (pattern) {
    [keyPattern, valueSchema] = pattern;
  } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    valueSchema = schema.additionalProperties;
  }
  const node: NodeMap = { kind: 'map', name, value: schemaToNode('value', valueSchema, false, resolver) };
  if (schema.title) node.label = schema.title;
  if (keyPattern) node.keyPattern = keyPattern;
  if (typeof schema.minProperties === 'number') node.minEntries = schema.minProperties;
  if (typeof schema.maxProperties === 'number') node.maxEntries = schema.maxProperties;
  return node;
}

// --- anyOf / oneOf → choice ---------------------------------------------------

/** The `anyOf`/`oneOf` `[T, null]` shape collapses to a nullable leaf; anything else is a choice. */
function branchesToNode(name: string, schema: JsonSchema, rawBranches: JsonSchema[], required: boolean, resolver: RefResolver): NodeType {
  const branches = rawBranches.map((b) => resolver.resolve(b));
  const nonNull = branches.filter((b) => b.schema.type !== 'null');
  const sole = nonNull.length === 1 ? nonNull[0] : undefined;
  if (sole && nonNull.length < branches.length && isScalarSchema(sole.schema)) {
    const leaf = scalarLeaf(name, sole.schema, required);
    leaf.nullable = true;
    return leaf;
  }

  const cases: Record<string, ChoiceCase> = {};
  const caseLabels: Record<string, string> = {};
  branches.forEach(({ schema: branch, scope }, index) => {
    const caseName = `case${index}`;
    cases[caseName] = branchToCase(branch, scope);
    if (branch.title) caseLabels[caseName] = branch.title;
  });
  const choice: Choice = { kind: 'choice', name, cases };
  if (schema.title) choice.label = schema.title;
  if (Object.keys(caseLabels).length) choice.caseLabels = caseLabels;
  return choice;
}

/** A resolved branch → a case body: a field record for an object branch, else a single node. */
function branchToCase(branch: JsonSchema, scope: RefResolver): ChoiceCase {
  if (primaryType(branch) === 'object' && branch.properties) {
    const required = new Set(branch.required ?? []);
    const fields: Record<string, NodeType> = {};
    for (const [key, propSchema] of Object.entries(branch.properties)) {
      fields[key] = schemaToNode(key, propSchema, required.has(key), scope);
    }
    return fields;
  }
  return schemaToNode('value', branch, false, scope);
}

// --- dispatch -----------------------------------------------------------------

function schemaToNode(name: string, rawSchema: JsonSchema, required: boolean, resolver: RefResolver): NodeType {
  const { schema, scope } = resolver.resolve(rawSchema);

  const branches = schema.anyOf ?? schema.oneOf;
  if (branches && branches.length) {
    return branchesToNode(name, schema, branches, required, scope);
  }

  const type = primaryType(schema);

  if (type === 'object' || (type === undefined && (schema.properties || isOpenMap(schema)))) {
    if (isOpenMap(schema)) return objectToMap(name, schema, scope);
    return objectToNodeGroup(schema, name, scope, schema.title);
  }

  if (type === 'array') {
    const { schema: items, scope: itemScope } = scope.resolve(schema.items ?? {});
    if (primaryType(items) === 'object' && items.properties) {
      const node: NodeGroupList = {
        kind: 'nodeGroupList',
        name,
        type: objectToNodeGroup(items, name, itemScope, items.title),
      };
      if (schema.title) node.label = schema.title;
      if (typeof schema.minItems === 'number') node.minItems = schema.minItems;
      if (typeof schema.maxItems === 'number') node.maxItems = schema.maxItems;
      return node;
    }
    const list: LeafList = { kind: 'leafList', name, type: scalarType(items) };
    if (schema.title) list.label = schema.title;
    if (typeof schema.minItems === 'number') list.minItems = schema.minItems;
    if (typeof schema.maxItems === 'number') list.maxItems = schema.maxItems;
    return list;
  }

  return scalarLeaf(name, schema, required);
}

// --- scalar leaves ------------------------------------------------------------

function scalarLeaf(name: string, schema: JsonSchema, required: boolean): Leaf {
  const leaf: Leaf = { kind: 'leaf', name, type: scalarType(schema) };

  if (schema.enum && schema.enum.length) {
    leaf.type = 'enum';
    leaf.enum = schema.enum.filter(isEnumMember);
  }
  // `const` — a fixed, read-only value.
  if ('const' in schema && isScalar(schema.const)) {
    leaf.default = schema.const;
    leaf.readOnly = true;
  }
  if (required) leaf.required = true;
  if (isScalar(schema.default)) leaf.default = schema.default;
  if (schema.title) leaf.label = schema.title;
  if (schema.description) leaf.description = schema.description;
  if (isNullable(schema)) leaf.nullable = true;

  if (leaf.type === 'string') {
    if (typeof schema.pattern === 'string') leaf.pattern = schema.pattern;
    if (typeof schema.minLength === 'number') leaf.minLength = schema.minLength;
    if (typeof schema.maxLength === 'number') leaf.maxLength = schema.maxLength;
    const format = mapFormat(schema.format);
    if (format) leaf.format = format;
  } else if (leaf.type === 'number') {
    if (primaryType(schema) === 'integer') leaf.integer = true;
    if (typeof schema.minimum === 'number') leaf.min = schema.minimum;
    if (typeof schema.maximum === 'number') leaf.max = schema.maximum;
    if (typeof schema.multipleOf === 'number') leaf.multipleOf = schema.multipleOf;
  }
  return leaf;
}

// --- helpers ------------------------------------------------------------------

/** The first declared type, ignoring a `null` companion in a `[T, 'null']` union. */
function primaryType(schema: JsonSchema): JsonSchemaType | undefined {
  const t = schema.type;
  if (Array.isArray(t)) return t.find((x) => x !== 'null');
  if (t === undefined && schema.const !== undefined) return constType(schema.const);
  return t;
}

/** Map a JSON Schema scalar type to a form {@link LeafType} (default `string`). */
function scalarType(schema: JsonSchema): LeafType {
  if (schema.enum && schema.enum.length) return 'enum';
  switch (primaryType(schema)) {
    case 'boolean':
      return 'boolean';
    case 'number':
    case 'integer':
      return 'number';
    default:
      return 'string';
  }
}

function isScalarSchema(schema: JsonSchema): boolean {
  const t = primaryType(schema);
  return t === 'string' || t === 'number' || t === 'integer' || t === 'boolean' || (t === undefined && schema.enum != null);
}

function isNullable(schema: JsonSchema): boolean {
  return Array.isArray(schema.type) && schema.type.includes('null');
}

function constType(value: unknown): JsonSchemaType | undefined {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'string';
  return undefined;
}

/** Map a JSON Schema `format` to the leaf formats the library validates. */
function mapFormat(format: string | undefined): 'email' | 'uri' | 'url' | undefined {
  if (format === 'email' || format === 'idn-email') return 'email';
  if (format === 'uri' || format === 'iri' || format === 'url') return 'uri';
  return undefined;
}

function isEnumMember(v: unknown): v is string | number {
  return typeof v === 'string' || typeof v === 'number';
}

function isScalar(v: unknown): v is string | number | boolean {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}
