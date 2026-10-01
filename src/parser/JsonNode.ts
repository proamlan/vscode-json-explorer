import { Node as JsonCNode, ParseError } from 'jsonc-parser';

export type PrimitiveType = 'string' | 'number' | 'integer' | 'boolean' | 'null';
export type NodeType = 'object' | 'array' | PrimitiveType;

export type PathSegment = string | number;

export interface ParsedDocument {
  root: JsonCNode | undefined;
  errors: ParseError[];
  text: string;
  version: number;
}

export function nodeTypeOf(node: JsonCNode): NodeType {
  if (node.type === 'object') return 'object';
  if (node.type === 'array') return 'array';
  if (node.type === 'string') return 'string';
  if (node.type === 'boolean') return 'boolean';
  if (node.type === 'null') return 'null';
  if (node.type === 'number') {
    const v = node.value as number;
    return Number.isInteger(v) ? 'integer' : 'number';
  }
  return 'string';
}

export function isContainer(node: JsonCNode): boolean {
  return node.type === 'object' || node.type === 'array';
}

export function childCount(node: JsonCNode): number {
  return node.children?.length ?? 0;
}

/** Depth of a node relative to root (root = 0). */
export function depthOf(node: JsonCNode): number {
  let d = 0;
  let cur = node.parent;
  while (cur) {
    d += 1;
    cur = cur.parent;
  }
  return d;
}

/** Byte size of a node's text range. */
export function sizeOf(node: JsonCNode): number {
  return node.length;
}
