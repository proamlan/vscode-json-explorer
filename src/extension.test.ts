import { describe, it, expect } from 'vitest';
import { parseText, findNodeAtOffset, getNodePath } from './parser/JsonParser';
import {
  jsonPathStringToPath,
  pathToJsonPathString,
  pathToPointer,
  pointerToPath,
  resolvePath,
} from './parser/JsonPosition';
import { findDuplicates } from './diagnostics/DuplicateKeyDetector';
import { generateSchema } from './schema/SchemaGenerator';
import { searchTree } from './search/JsonSearchProvider';
import { computeStatsClean } from './statistics/JsonStatistics';

const DOC = `{
  "users": [
    { "name": "Amlan", "email": "a@example.com", "age": 30 },
    { "name": "Sam", "email": "s@example.com", "age": 25 }
  ],
  "count": 2
}`;

describe('parser', () => {
  it('parses nested objects/arrays', () => {
    const { root, errors } = parseText(DOC);
    expect(errors).toEqual([]);
    expect(root?.type).toBe('object');
    expect(root?.children?.length).toBe(2);
  });
  it('handles empty object/array', () => {
    expect(parseText('{}').root?.type).toBe('object');
    expect(parseText('[]').root?.type).toBe('array');
  });
  it('reports malformed JSON', () => {
    const { errors } = parseText('{"a": }');
    expect(errors.length).toBeGreaterThan(0);
  });
  it('parses primitives', () => {
    expect(parseText('"hi"').root?.type).toBe('string');
    expect(parseText('42').root?.type).toBe('number');
    expect(parseText('true').root?.type).toBe('boolean');
    expect(parseText('null').root?.type).toBe('null');
  });
  it('tolerates comments in jsonc mode', () => {
    const { errors } = parseText('{\n// c\n"a": 1\n}', 0, true);
    expect(errors).toEqual([]);
  });
});

describe('paths', () => {
  it('resolves $.users[0].name to correct range', () => {
    const text = '{"users":[{"name":"Amlan"}]}';
    const { root } = parseText(text);
    const node = resolvePath(root, jsonPathStringToPath('$.users[0].name'));
    expect(node).toBeDefined();
    expect(text.slice(node!.offset, node!.offset + node!.length)).toBe('"Amlan"');
  });
  it('resolves /users/0/name pointer', () => {
    const text = '{"users":[{"name":"Amlan"}]}';
    const { root } = parseText(text);
    const node = resolvePath(root, pointerToPath('/users/0/name'));
    expect(node).toBeDefined();
    expect(text.slice(node!.offset, node!.offset + node!.length)).toBe('"Amlan"');
  });
  it('round-trips path segments', () => {
    const path = ['users', 0, 'name'] as (string | number)[];
    expect(pathToJsonPathString(path)).toBe('$.users[0].name');
    expect(pathToPointer(path)).toBe('/users/0/name');
  });
  it('finds node at offset', () => {
    const text = '{"a": 1}';
    const { root } = parseText(text);
    const node = findNodeAtOffset(root, text.indexOf('1'));
    expect(node).toBeDefined();
    expect(getNodePath(node)).toEqual(['a']);
  });
});

describe('duplicates', () => {
  it('detects {"a":1,"a":2}', () => {
    const { root } = parseText('{"a": 1, "a": 2}');
    const dups = findDuplicates(root);
    expect(dups.length).toBe(1);
    expect(dups[0].key).toBe('a');
  });
});

describe('schema generation', () => {
  it('infers simple object', () => {
    const s = generateSchema({ id: 1, name: 'Amlan', active: true }) as unknown as {
      type: string;
      properties: Record<string, { type: string }>;
    };
    expect(s.type).toBe('object');
    expect(s.properties.id.type).toBe('integer');
    expect(s.properties.name.type).toBe('string');
  });
  it('infers nested object', () => {
    const s = generateSchema({ a: { b: 1 } }) as { properties: Record<string, { type: string }> };
    expect(s.properties.a.type).toBe('object');
  });
  it('does not mark disagreeing optional props as required', () => {
    const s = generateSchema([{ a: 1, b: 2 }, { a: 3 }]) as unknown as {
      type: string;
      items: { required: string[] };
    };
    expect(s.type).toBe('array');
    expect(s.items.required).toEqual(['a']);
  });
  it('handles null values', () => {
    expect((generateSchema(null) as { type: string }).type).toBe('null');
    const s = generateSchema({ a: null }) as { properties: Record<string, { type: string }> };
    expect(s.properties.a.type).toBe('null');
  });
});

describe('search + stats', () => {
  it('searches keys and values', () => {
    const { root } = parseText(DOC);
    const hits = searchTree(root, 'email', 20);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[0].label).toContain('email');
    const byValue = searchTree(root, 'Amlan', 20);
    expect(byValue.length).toBeGreaterThanOrEqual(1);
  });
  it('computes stats', () => {
    const { root } = parseText(DOC);
    const s = computeStatsClean(root, DOC.length);
    expect(s.objects).toBeGreaterThan(0);
    expect(s.arrays).toBe(1);
    expect(s.maxDepth).toBeGreaterThan(1);
  });
  it('handles large-ish arrays efficiently', () => {
    const big = JSON.stringify({ users: Array.from({ length: 5000 }, (_, i) => ({ id: i })) });
    const t0 = Date.now();
    const { root } = parseText(big);
    const s = computeStatsClean(root, big.length);
    expect(s.nodes).toBeGreaterThan(5000);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});
