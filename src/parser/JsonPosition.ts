import { Node as JsonCNode } from 'jsonc-parser';
import * as jsonc from 'jsonc-parser';
import { PathSegment } from './JsonNode';

export type { PathSegment };

export function isJsonDocument(languageId: string): boolean {
  return languageId === 'json' || languageId === 'jsonc';
}

export function allowCommentsFor(languageId: string): boolean {
  return languageId === 'jsonc' || languageId === 'json';
}

export function pathToJsonPathString(path: readonly PathSegment[]): string {
  if (path.length === 0) return '$';
  let out = '$';
  for (const seg of path) {
    if (typeof seg === 'number') out += `[${seg}]`;
    else if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(seg)) out += `.${seg}`;
    else out += `[${JSON.stringify(seg)}]`;
  }
  return out;
}

export function pathToPointer(path: readonly PathSegment[]): string {
  if (path.length === 0) return '';
  return (
    '/' +
    path
      .map((s) => String(s).replace(/~/g, '~0').replace(/\//g, '~1'))
      .join('/')
  );
}

export function pointerToPath(pointer: string): PathSegment[] {
  const p = pointer.trim();
  if (p === '' || p === '/') return [];
  if (!p.startsWith('/')) throw new Error('JSON Pointer must start with "/"');
  return p
    .slice(1)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
    .map((s) => (/^(0|[1-9][0-9]*)$/.test(s) ? Number(s) : s));
}

/** Parse `$.a[0].b` / `$["a-b"]` style JSONPath (subset: root $, dot names, bracket index/quoted). */
export function jsonPathStringToPath(input: string): PathSegment[] {
  const s = input.trim();
  if (s === '$') return [];
  if (!s.startsWith('$')) throw new Error('JSONPath must start with "$"');
  const path: PathSegment[] = [];
  let i = 1;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '.') {
      i += 1;
      if (s[i] === '.') throw new Error('Recursive descent ("..") is not supported');
      let name = '';
      if (s[i] === '"' || s[i] === "'") {
        const q = s[i];
        i += 1;
        while (i < s.length && s[i] !== q) {
          if (s[i] === '\\' && i + 1 < s.length) {
            name += s[i + 1];
            i += 2;
          } else {
            name += s[i];
            i += 1;
          }
        }
        i += 1; // closing quote
      } else {
        while (i < s.length && /[^.[\]]/.test(s[i])) {
          name += s[i];
          i += 1;
        }
      }
      if (!name) throw new Error('Invalid JSONPath: empty property name');
      path.push(name);
    } else if (ch === '[') {
      const close = s.indexOf(']', i);
      if (close === -1) throw new Error('Invalid JSONPath: missing "]"');
      const inside = s.slice(i + 1, close).trim();
      if (/^(0|[1-9][0-9]*)$/.test(inside)) path.push(Number(inside));
      else if (
        (inside.startsWith('"') && inside.endsWith('"')) ||
        (inside.startsWith("'") && inside.endsWith("'"))
      ) {
        path.push(inside.slice(1, -1).replace(/\\(.)/g, '$1'));
      } else if (inside === '*') {
        throw new Error('Wildcards are not supported');
      } else {
        // tolerate unquoted string keys like [foo]
        path.push(inside);
      }
      i = close + 1;
    } else if (/\s/.test(ch)) {
      i += 1;
    } else {
      throw new Error(`Invalid JSONPath at column ${i}: "${ch}"`);
    }
  }
  return path;
}

export function getNodePathSegments(node: JsonCNode | undefined): PathSegment[] {
  if (!node) return [];
  return jsonc.getNodePath(node) as PathSegment[];
}

export function formatBreadcrumb(path: readonly PathSegment[]): string {
  if (path.length === 0) return 'root';
  return ['root', ...path.map((s) => String(s))].join(' › ');
}

/** Resolve a path against a parse tree; returns undefined when missing. */
export function resolvePath(
  root: JsonCNode | undefined,
  path: readonly PathSegment[],
): JsonCNode | undefined {
  if (!root) return undefined;
  try {
    return jsonc.findNodeAtLocation(root, path as (string | number)[]) ?? undefined;
  } catch {
    return undefined;
  }
}
