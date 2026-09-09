import { z } from 'zod';
import type { ZodRawShape, ZodTypeAny } from 'zod';

/**
 * Converts the JSON Schema subset used by plugin MCP manifests (`mcp.yaml`) into
 * zod schemas, so a plugin-provided tool validates its arguments exactly like a
 * hand-written core tool does.
 *
 * The subset is deliberately small and is documented in docs/plugin-tools-spec.md.
 * Anything outside it throws, naming the JSON path of the offending keyword, so a
 * bad manifest produces a readable warning instead of a half-working tool.
 */

export type JsonSchemaType = 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object';

export interface JsonSchemaNode {
  type?: JsonSchemaType;
  description?: string;
  default?: unknown;
  enum?: Array<string | number>;
  nullable?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  items?: JsonSchemaNode;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaNode;
  [key: string]: unknown;
}

const SUPPORTED_KEYWORDS = new Set([
  'type',
  'description',
  'default',
  'enum',
  'nullable',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'items',
  'properties',
  'required',
  'additionalProperties',
]);

const SUPPORTED_TYPES = new Set<string>(['string', 'integer', 'number', 'boolean', 'array', 'object']);

const SUPPORTED_FORMATS = new Set<string>(['date', 'date-time', 'email', 'uri']);

/** Error thrown for anything the subset does not cover. `path` is the JSON path. */
export class JsonSchemaSubsetError extends Error {
  constructor(message: string, public readonly path: string) {
    super(message);
    this.name = 'JsonSchemaSubsetError';
  }
}

function label(path: string): string {
  return path || 'input';
}

function fail(message: string, path: string): never {
  throw new JsonSchemaSubsetError(`${message} at ${label(path)}`, label(path));
}

function assertKeywords(node: JsonSchemaNode, path: string): void {
  for (const key of Object.keys(node)) {
    if (!SUPPORTED_KEYWORDS.has(key)) {
      fail(`Unsupported schema keyword '${key}'`, path);
    }
  }
}

function isPlainObject(value: unknown): value is JsonSchemaNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Converts a top-level `type: object` schema into a zod raw shape, ready to hand
 * to `McpServer.registerTool({ inputSchema })`. A missing or empty schema yields
 * an empty shape (a tool with no arguments).
 */
export function jsonSchemaToZodShape(schema?: JsonSchemaNode | null): ZodRawShape {
  if (schema === undefined || schema === null) return {};
  if (!isPlainObject(schema)) fail('Schema must be an object', '');

  assertKeywords(schema, '');

  if (schema.type !== undefined && schema.type !== 'object') {
    fail(`Top-level schema must be type 'object', got '${String(schema.type)}'`, '');
  }

  return objectShape(schema, '');
}

/**
 * Converts a top-level `type: object` schema into the zod object to hand to
 * `McpServer.registerTool({ inputSchema })`. The root's `additionalProperties`
 * is honoured exactly the way a nested object's is: `true` passes undeclared
 * arguments through, `false` rejects them, unset strips them (zod's default).
 * The result is always a `ZodObject`, even with no properties, because that is
 * what the SDK advertises as the tool's JSON Schema.
 */
export function jsonSchemaToZodObject(schema?: JsonSchemaNode | null): z.ZodObject<any> {
  const object = z.object(jsonSchemaToZodShape(schema));
  const additional = schema?.additionalProperties;

  if (additional === undefined) return object;
  if (additional === false) return object.strict();
  if (additional === true) return object.passthrough();
  if (isPlainObject(additional)) {
    return object.catchall(convertProperty(additional, 'additionalProperties', true));
  }

  fail("'additionalProperties' must be a boolean or a schema", '');
}

function objectShape(node: JsonSchemaNode, path: string): ZodRawShape {
  const properties = node.properties ?? {};
  if (!isPlainObject(properties)) fail("'properties' must be an object", path);

  const required = new Set(requiredList(node, path));
  const shape: ZodRawShape = {};

  for (const [name, propSchema] of Object.entries(properties)) {
    const propPath = path ? `${path}.properties.${name}` : `properties.${name}`;
    if (!isPlainObject(propSchema)) fail('Property schema must be an object', propPath);
    shape[name] = convertProperty(propSchema, propPath, required.has(name));
  }

  return shape;
}

function requiredList(node: JsonSchemaNode, path: string): string[] {
  if (node.required === undefined) return [];
  if (!Array.isArray(node.required) || node.required.some((n) => typeof n !== 'string')) {
    fail("'required' must be an array of property names", path);
  }
  return node.required;
}

function convertProperty(node: JsonSchemaNode, path: string, isRequired: boolean): ZodTypeAny {
  let schema = convertNode(node, path);

  if (node.nullable === true) {
    schema = schema.nullable();
  } else if (node.nullable !== undefined && node.nullable !== false) {
    fail("'nullable' must be a boolean", path);
  }

  if (node.default !== undefined) {
    return schema.default(node.default);
  }

  return isRequired ? schema : schema.optional();
}

/** Converts one schema node into a zod type, without optional/nullable/default wrapping. */
function convertNode(node: JsonSchemaNode, path: string): ZodTypeAny {
  assertKeywords(node, path);

  const type = resolveType(node, path);
  const description = buildDescription(node, path);

  let schema: ZodTypeAny;

  if (node.enum !== undefined) {
    schema = convertEnum(node.enum, path);
  } else {
    switch (type) {
      case 'string':
        schema = convertString(node, path);
        break;
      case 'integer':
      case 'number':
        schema = convertNumber(node, type === 'integer');
        break;
      case 'boolean':
        schema = z.boolean();
        break;
      case 'array':
        schema = convertArray(node, path);
        break;
      case 'object':
        schema = convertObject(node, path);
        break;
    }
  }

  return description ? schema.describe(description) : schema;
}

function resolveType(node: JsonSchemaNode, path: string): JsonSchemaType {
  if (node.type === undefined) {
    if (node.enum !== undefined) return 'string';
    fail("Missing 'type'", path);
  }
  if (typeof node.type !== 'string' || !SUPPORTED_TYPES.has(node.type)) {
    fail(`Unsupported type '${String(node.type)}'`, path);
  }
  return node.type;
}

function buildDescription(node: JsonSchemaNode, path: string): string | undefined {
  const parts: string[] = [];

  if (node.description !== undefined) {
    if (typeof node.description !== 'string') fail("'description' must be a string", path);
    if (node.description.trim() !== '') parts.push(node.description.trim());
  }

  if (node.format !== undefined) {
    if (typeof node.format !== 'string' || !SUPPORTED_FORMATS.has(node.format)) {
      fail(`Unsupported 'format' value '${String(node.format)}'`, path);
    }
    parts.push(`(format: ${node.format})`);
  }

  return parts.length ? parts.join(' ') : undefined;
}

function convertEnum(values: unknown, path: string): ZodTypeAny {
  if (!Array.isArray(values) || values.length === 0) {
    fail("'enum' must be a non-empty array", path);
  }

  const allStrings = values.every((v) => typeof v === 'string');
  const allNumbers = values.every((v) => typeof v === 'number');

  if (allStrings) {
    return z.enum(values as [string, ...string[]]);
  }

  if (allNumbers) {
    const literals: ZodTypeAny[] = (values as number[]).map((v) => z.literal(v));
    if (literals.length === 1) return literals[0];
    return z.union(literals as unknown as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]);
  }

  fail("'enum' values must be all strings or all numbers", path);
}

function convertString(node: JsonSchemaNode, path: string): ZodTypeAny {
  let schema = z.string();
  if (typeof node.minLength === 'number') schema = schema.min(node.minLength);
  if (typeof node.maxLength === 'number') schema = schema.max(node.maxLength);
  if (node.pattern !== undefined) {
    if (typeof node.pattern !== 'string') fail("'pattern' must be a string", path);
    try {
      schema = schema.regex(new RegExp(node.pattern));
    } catch {
      fail(`Invalid 'pattern' regular expression '${node.pattern}'`, path);
    }
  }
  return schema;
}

function convertNumber(node: JsonSchemaNode, isInteger: boolean): ZodTypeAny {
  let schema = isInteger ? z.number().int() : z.number();
  if (typeof node.minimum === 'number') schema = schema.min(node.minimum);
  if (typeof node.maximum === 'number') schema = schema.max(node.maximum);
  return schema;
}

function convertArray(node: JsonSchemaNode, path: string): ZodTypeAny {
  if (node.items === undefined) return z.array(z.unknown());
  if (Array.isArray(node.items)) {
    fail("Tuple 'items' is not supported", `${path}.items`);
  }
  if (!isPlainObject(node.items)) fail("'items' must be an object", `${path}.items`);

  return z.array(convertProperty(node.items, `${path}.items`, true));
}

function convertObject(node: JsonSchemaNode, path: string): ZodTypeAny {
  const hasProperties = node.properties !== undefined && Object.keys(node.properties).length > 0;
  const additional = node.additionalProperties;

  // An object with no properties is a free-form map; `additionalProperties`
  // defaults to true in that case.
  if (!hasProperties) {
    if (additional === false) return z.object({}).strict();
    if (isPlainObject(additional)) {
      return z.record(convertProperty(additional, `${path}.additionalProperties`, true));
    }
    if (additional !== undefined && additional !== true) {
      fail("'additionalProperties' must be a boolean or a schema", path);
    }
    return z.record(z.unknown());
  }

  const shape = objectShape(node, path);
  const object = z.object(shape);

  // Unset means "no opinion": zod's default is to strip unknown keys rather
  // than reject the call, which is the friendlier behavior for a model.
  if (additional === undefined) return object;
  if (additional === false) return object.strict();
  if (additional === true) return object.passthrough();
  if (isPlainObject(additional)) {
    return object.catchall(convertProperty(additional, `${path}.additionalProperties`, true));
  }

  fail("'additionalProperties' must be a boolean or a schema", path);
}
