import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  jsonSchemaToZodShape,
  jsonSchemaToZodObject,
  JsonSchemaSubsetError,
} from '../../../src/client/json-schema.js';

function shapeOf(properties: Record<string, unknown>, required?: string[]) {
  return jsonSchemaToZodShape({
    type: 'object',
    properties: properties as never,
    ...(required ? { required } : {}),
  });
}

function parse(properties: Record<string, unknown>, value: unknown, required?: string[]) {
  return z.object(shapeOf(properties, required)).safeParse(value);
}

describe('jsonSchemaToZodShape', () => {
  describe('empty and missing schemas', () => {
    it('returns an empty shape for undefined', () => {
      expect(jsonSchemaToZodShape(undefined)).toEqual({});
    });

    it('returns an empty shape for null', () => {
      expect(jsonSchemaToZodShape(null)).toEqual({});
    });

    it('returns an empty shape for a schema with no properties', () => {
      expect(jsonSchemaToZodShape({ type: 'object', properties: {} })).toEqual({});
    });
  });

  describe('types', () => {
    it('converts string', () => {
      expect(parse({ q: { type: 'string' } }, { q: 'hello' }).success).toBe(true);
      expect(parse({ q: { type: 'string' } }, { q: 5 }).success).toBe(false);
    });

    it('converts integer and rejects fractions', () => {
      expect(parse({ n: { type: 'integer' } }, { n: 3 }).success).toBe(true);
      expect(parse({ n: { type: 'integer' } }, { n: 3.5 }).success).toBe(false);
    });

    it('converts number and accepts fractions', () => {
      expect(parse({ n: { type: 'number' } }, { n: 3.5 }).success).toBe(true);
    });

    it('converts boolean', () => {
      expect(parse({ b: { type: 'boolean' } }, { b: true }).success).toBe(true);
      expect(parse({ b: { type: 'boolean' } }, { b: 'yes' }).success).toBe(false);
    });

    it('converts array with items', () => {
      const schema = { tags: { type: 'array', items: { type: 'string' } } };
      expect(parse(schema, { tags: ['a', 'b'] }).success).toBe(true);
      expect(parse(schema, { tags: [1] }).success).toBe(false);
    });

    it('converts an array without items to an array of anything', () => {
      expect(parse({ tags: { type: 'array' } }, { tags: [1, 'a', null] }).success).toBe(true);
    });

    it('converts a nested object with properties and required', () => {
      const schema = {
        seo: {
          type: 'object',
          properties: { title: { type: 'string' }, index: { type: 'boolean' } },
          required: ['title'],
        },
      };
      expect(parse(schema, { seo: { title: 'T' } }).success).toBe(true);
      expect(parse(schema, { seo: { index: true } }).success).toBe(false);
    });

    it('treats an object with no properties as a free-form map', () => {
      const schema = { attributes: { type: 'object', additionalProperties: true } };
      const result = parse(schema, { attributes: { color: 'red', size: null } });
      expect(result.success).toBe(true);
      expect(result.success && result.data.attributes).toEqual({ color: 'red', size: null });
    });

    it('keeps declared extra properties when additionalProperties is true', () => {
      const schema = {
        meta: { type: 'object', properties: { a: { type: 'string' } }, additionalProperties: true },
      };
      const result = parse(schema, { meta: { a: 'x', b: 2 } });
      expect(result.success && result.data.meta).toEqual({ a: 'x', b: 2 });
    });

    it('rejects extra properties when additionalProperties is false', () => {
      const schema = {
        meta: { type: 'object', properties: { a: { type: 'string' } }, additionalProperties: false },
      };
      expect(parse(schema, { meta: { a: 'x', b: 2 } }).success).toBe(false);
    });

    it('types the values of a free-form map when additionalProperties is a schema', () => {
      const schema = { counts: { type: 'object', additionalProperties: { type: 'integer' } } };
      expect(parse(schema, { counts: { a: 1 } }).success).toBe(true);
      expect(parse(schema, { counts: { a: 'one' } }).success).toBe(false);
    });
  });

  describe('keywords', () => {
    it('applies description', () => {
      const shape = shapeOf({ q: { type: 'string', description: 'Search query' } });
      expect(shape.q.description).toBe('Search query');
    });

    it('folds format into the description', () => {
      const shape = shapeOf({ due: { type: 'string', description: 'Due date', format: 'date' } });
      expect(shape.due.description).toBe('Due date (format: date)');
    });

    it('uses format alone as the description when there is none', () => {
      const shape = shapeOf({ email: { type: 'string', format: 'email' } });
      expect(shape.email.description).toBe('(format: email)');
    });

    it('applies default and makes the property optional', () => {
      const result = parse({ per_page: { type: 'integer', default: 20 } }, {});
      expect(result.success && result.data.per_page).toBe(20);
    });

    it('applies a string enum', () => {
      const schema = { status: { type: 'string', enum: ['draft', 'published'] } };
      expect(parse(schema, { status: 'draft' }).success).toBe(true);
      expect(parse(schema, { status: 'archived' }).success).toBe(false);
    });

    it('applies a numeric enum', () => {
      const schema = { level: { type: 'integer', enum: [1, 2, 3] } };
      expect(parse(schema, { level: 2 }).success).toBe(true);
      expect(parse(schema, { level: 9 }).success).toBe(false);
    });

    it('applies a single-value enum', () => {
      const schema = { level: { type: 'integer', enum: [1] } };
      expect(parse(schema, { level: 1 }).success).toBe(true);
      expect(parse(schema, { level: 2 }).success).toBe(false);
    });

    it('applies nullable', () => {
      expect(parse({ note: { type: 'string', nullable: true } }, { note: null }).success).toBe(true);
      expect(parse({ note: { type: 'string' } }, { note: null }).success).toBe(false);
    });

    it('applies minimum and maximum', () => {
      const schema = { page: { type: 'integer', minimum: 1, maximum: 100 } };
      expect(parse(schema, { page: 1 }).success).toBe(true);
      expect(parse(schema, { page: 0 }).success).toBe(false);
      expect(parse(schema, { page: 101 }).success).toBe(false);
    });

    it('applies minLength and maxLength', () => {
      const schema = { slug: { type: 'string', minLength: 2, maxLength: 4 } };
      expect(parse(schema, { slug: 'abc' }).success).toBe(true);
      expect(parse(schema, { slug: 'a' }).success).toBe(false);
      expect(parse(schema, { slug: 'abcde' }).success).toBe(false);
    });

    it('applies pattern', () => {
      const schema = { sku: { type: 'string', pattern: '^[A-Z]{3}-\\d+$' } };
      expect(parse(schema, { sku: 'ABC-12' }).success).toBe(true);
      expect(parse(schema, { sku: 'abc-12' }).success).toBe(false);
    });

    it('makes properties optional unless listed in required', () => {
      const schema = { id: { type: 'integer' }, title: { type: 'string' } };
      expect(parse(schema, { id: 1 }, ['id']).success).toBe(true);
      expect(parse(schema, { title: 'x' }, ['id']).success).toBe(false);
    });
  });

  describe('rejections', () => {
    const cases: Array<[string, unknown, string]> = [
      ['$ref', { file: { $ref: '#/definitions/file' } }, 'properties.file'],
      ['oneOf', { file: { oneOf: [{ type: 'string' }] } }, 'properties.file'],
      ['anyOf', { file: { anyOf: [{ type: 'string' }] } }, 'properties.file'],
      ['allOf', { file: { allOf: [{ type: 'string' }] } }, 'properties.file'],
      ['not', { file: { not: { type: 'string' } } }, 'properties.file'],
      ['if', { file: { if: { type: 'string' } } }, 'properties.file'],
      ['then', { file: { then: { type: 'string' } } }, 'properties.file'],
      ['patternProperties', { file: { patternProperties: {} } }, 'properties.file'],
      ['const', { file: { const: 'x' } }, 'properties.file'],
      ['dependencies', { file: { dependencies: {} } }, 'properties.file'],
    ];

    for (const [keyword, properties, path] of cases) {
      it(`rejects ${keyword} and names the path`, () => {
        expect(() => shapeOf(properties as Record<string, unknown>)).toThrow(JsonSchemaSubsetError);
        expect(() => shapeOf(properties as Record<string, unknown>)).toThrow(
          new RegExp(`'${keyword.replace('$', '\\$')}'.*${path.replace('.', '\\.')}`),
        );
      });
    }

    it('rejects tuple items', () => {
      expect(() => shapeOf({ pair: { type: 'array', items: [{ type: 'string' }] } })).toThrow(
        /Tuple 'items'.*properties\.pair\.items/,
      );
    });

    it('rejects an unsupported type', () => {
      expect(() => shapeOf({ q: { type: 'null' } })).toThrow(
        /Unsupported type 'null' at properties\.q/,
      );
    });

    it('rejects an unsupported format', () => {
      expect(() => shapeOf({ q: { type: 'string', format: 'uuid' } })).toThrow(
        /Unsupported 'format' value 'uuid' at properties\.q/,
      );
    });

    it('rejects a property with no type', () => {
      expect(() => shapeOf({ q: { description: 'no type' } })).toThrow(
        /Missing 'type' at properties\.q/,
      );
    });

    it('rejects a mixed enum', () => {
      expect(() => shapeOf({ q: { type: 'string', enum: ['a', 1] } })).toThrow(
        /'enum' values must be all strings or all numbers at properties\.q/,
      );
    });

    it('rejects an empty enum', () => {
      expect(() => shapeOf({ q: { type: 'string', enum: [] } })).toThrow(
        /'enum' must be a non-empty array at properties\.q/,
      );
    });

    it('names the path of a keyword nested inside an object property', () => {
      expect(() =>
        shapeOf({
          seo: { type: 'object', properties: { title: { const: 'x' } } },
        }),
      ).toThrow(/'const' at properties\.seo\.properties\.title/);
    });

    it('names the path of a keyword nested inside array items', () => {
      expect(() =>
        shapeOf({ tags: { type: 'array', items: { type: 'string', const: 'x' } } }),
      ).toThrow(/'const' at properties\.tags\.items/);
    });

    it('names the root when the top-level schema is not an object', () => {
      expect(() => jsonSchemaToZodShape({ type: 'string' })).toThrow(
        /Top-level schema must be type 'object'.*at input/,
      );
    });

    it('rejects an unsupported keyword at the root', () => {
      expect(() => jsonSchemaToZodShape({ type: 'object', patternProperties: {} } as never)).toThrow(
        /'patternProperties' at input/,
      );
    });
  });
});

describe('jsonSchemaToZodObject', () => {
  it('is a ZodObject even for a schema with no properties', () => {
    expect(jsonSchemaToZodObject(undefined)).toBeInstanceOf(z.ZodObject);
    expect(jsonSchemaToZodObject({ type: 'object', properties: {} })).toBeInstanceOf(z.ZodObject);
  });

  it('passes unknown keys through when the root allows them', () => {
    const schema = jsonSchemaToZodObject({
      type: 'object',
      additionalProperties: true,
      properties: { q: { type: 'string' } },
    });
    const result = schema.safeParse({ q: 'x', extra: 1 });
    expect(result.success && result.data).toEqual({ q: 'x', extra: 1 });
  });

  it('rejects unknown keys when the root forbids them', () => {
    const schema = jsonSchemaToZodObject({
      type: 'object',
      additionalProperties: false,
      properties: { q: { type: 'string' } },
    });
    expect(schema.safeParse({ q: 'x', extra: 1 }).success).toBe(false);
  });

  it('strips unknown keys when the root says nothing', () => {
    const schema = jsonSchemaToZodObject({ type: 'object', properties: { q: { type: 'string' } } });
    const result = schema.safeParse({ q: 'x', extra: 1 });
    expect(result.success && result.data).toEqual({ q: 'x' });
  });
});
