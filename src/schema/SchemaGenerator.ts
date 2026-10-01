import { Node as JsonCNode } from 'jsonc-parser';
import { getNodeValue } from '../parser/JsonParser';

export interface JsonSchema {
  $schema: string;
  type: string;
  [k: string]: unknown;
}

/** Conservative schema inference. Optional props are only required when present in ALL samples. */
export function generateSchema(value: unknown): JsonSchema | Record<string, unknown> {
  return inferType(value, new Set()) as JsonSchema;
}

function inferType(value: unknown, seen: Set<unknown>): Record<string, unknown> {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) return inferArray(value, seen);
  switch (typeof value) {
    case 'string':
      return { type: 'string' };
    case 'boolean':
      return { type: 'boolean' };
    case 'number':
      return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' };
    case 'object':
      return inferObject(value as Record<string, unknown>, seen);
    default:
      return {};
  }
}

function inferObject(obj: Record<string, unknown>, seen: Set<unknown>): Record<string, unknown> {
  if (seen.has(obj)) return { type: 'object' };
  seen.add(obj);
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    properties[k] = inferType(v, seen);
    required.push(k);
  }
  const out: Record<string, unknown> = { type: 'object', properties };
  if (required.length > 0) out.required = required.sort();
  return out;
}

function inferArray(arr: unknown[], seen: Set<unknown>): Record<string, unknown> {
  if (arr.length === 0) return { type: 'array', items: {} };
  // Merge object samples: required = intersection of keys; property schema = merged.
  if (arr.every((v) => v !== null && typeof v === 'object' && !Array.isArray(v))) {
    const objs = arr as Record<string, unknown>[];
    const counts = new Map<string, number>();
    const merged: Record<string, unknown[]> = {};
    for (const o of objs) {
      for (const [k, v] of Object.entries(o)) {
        counts.set(k, (counts.get(k) ?? 0) + 1);
        if (!merged[k]) merged[k] = [];
        merged[k].push(v);
      }
    }
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [k, samples] of Object.entries(merged)) {
      properties[k] = mergeSchemas(samples.map((s) => inferType(s, seen)));
      if ((counts.get(k) ?? 0) === objs.length) required.push(k);
    }
    const itemSchema: Record<string, unknown> = { type: 'object', properties };
    if (required.length > 0) itemSchema.required = required.sort();
    return { type: 'array', items: itemSchema };
  }
  const itemSchemas = arr.map((v) => inferType(v, seen));
  const merged = mergeSchemas(itemSchemas);
  return { type: 'array', items: merged };
}

function schemaKey(s: Record<string, unknown>): string {
  return JSON.stringify(s);
}

function mergeSchemas(schemas: Record<string, unknown>[]): Record<string, unknown> {
  const uniq = [...new Map(schemas.map((s) => [schemaKey(s), s])).values()];
  if (uniq.length === 1) return uniq[0];
  const types = uniq.map((u) => u.type);
  if (uniq.every((u) => typeof u.type === 'string') && new Set(types).size === uniq.length) {
    return { type: [...new Set(types)] };
  }
  return { anyOf: uniq };
}

export function schemaForDocument(root: JsonCNode | undefined, text: string): string {
  let value: unknown = null;
  try {
    value = JSON.parse(text);
  } catch {
    value = root ? getNodeValue(root) : null;
  }
  const schema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    ...(generateSchema(value) as Record<string, unknown>),
  };
  return JSON.stringify(schema, null, 2);
}
