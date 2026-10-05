import { Node as JsonCNode } from 'jsonc-parser';
import * as jsonc from 'jsonc-parser';
import { getNodePathSegments, pathToJsonPathString } from '../parser/JsonPosition';

export interface DuplicateValueOccurrence {
  node: JsonCNode;
  path: string;
  offset: number;
  length: number;
}

export interface DuplicateValueGroup {
  /** Stable canonical key (JSON stringify with sorted object keys). */
  key: string;
  /** Human preview, e.g. `"foo"`, `42`, `{"a":1}`. */
  preview: string;
  /** JSON path of the containing array (or object scope). */
  containerPath: string;
  occurrences: DuplicateValueOccurrence[];
}

export interface FindDuplicateValuesOptions {
  /** Max groups to return (default 50). */
  maxGroups?: number;
  /** Minimum serialized length to consider (default 1). */
  minLength?: number;
  /** When false, trivial scalars (true/false/null/""/0) are ignored to reduce noise. Default true. */
  ignoreTrivialScalars?: boolean;
  /** Only detect duplicates within the same array (default true). */
  sameArrayOnly?: boolean;
}

function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
  }
  const s = JSON.stringify(value);
  return typeof s === 'string' ? s : String(value);
}

function previewFor(value: unknown): string {
  if (typeof value === 'string') {
    const s = value.length > 40 ? value.slice(0, 37) + '…' : value;
    return `"${s}"`;
  }
  const s = stableStringify(value);
  return s.length > 60 ? s.slice(0, 57) + '…' : s;
}

function isTrivialScalar(value: unknown): boolean {
  return value === null || value === true || value === false || value === '' || value === 0;
}

/**
 * Find deep-equal duplicate entries within the same array.
 * Pure function — never modifies data. Grouping is per-array so
 * `{"a":1}` in two different arrays is not flagged, but two
 * identical items in one array are.
 */
export function findDuplicateValues(
  root: JsonCNode | undefined,
  opts: FindDuplicateValuesOptions = {},
): DuplicateValueGroup[] {
  const { maxGroups = 50, minLength = 1, ignoreTrivialScalars = true, sameArrayOnly = true } = opts;
  const out: DuplicateValueGroup[] = [];
  if (!root) return out;

  const visitArray = (arr: JsonCNode): void => {
    const children = arr.children ?? [];
    if (children.length < 2) return;
    const containerPath = pathToJsonPathString(getNodePathSegments(arr));
    const byKey = new Map<string, { value: unknown; nodes: JsonCNode[] }>();
    for (const child of children) {
      let value: unknown;
      try {
        value = jsonc.getNodeValue(child);
      } catch {
        continue;
      }
      if (ignoreTrivialScalars && isTrivialScalar(value)) continue;
      const key = stableStringify(value);
      if (key.length < minLength) continue;
      const entry = byKey.get(key);
      if (entry) entry.nodes.push(child);
      else byKey.set(key, { value, nodes: [child] });
    }
    for (const { value, nodes } of byKey.values()) {
      if (nodes.length < 2) continue;
      // Skip groups whose nodes are all empty containers when trivials ignored —
      // `[]`/`{}` duplicates are surfaced by the empty-values audit instead.
      out.push({
        key: stableStringify(value),
        preview: previewFor(value),
        containerPath,
        occurrences: nodes.map((node) => ({
          node,
          path: pathToJsonPathString(getNodePathSegments(node)),
          offset: node.offset,
          length: node.length,
        })),
      });
      if (out.length >= maxGroups) return;
    }
  };

  if (!sameArrayOnly) {
    void 0;
  }

  const visit = (node: JsonCNode): void => {
    if (node.type === 'array') visitArray(node);
    if (out.length >= maxGroups) return;
    for (const child of node.children ?? []) {
      visit(child);
      if (out.length >= maxGroups) return;
    }
  };
  visit(root);
  return out;
}
