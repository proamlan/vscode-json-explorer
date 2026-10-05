import { Node as JsonCNode } from 'jsonc-parser';
import { getNodePathSegments, pathToJsonPathString } from '../parser/JsonPosition';

export interface MissingKeyInfo {
  /** Key present in siblings but absent here. */
  key: string;
  /** Path of the object missing the key, e.g. `$.users[2]`. */
  path: string;
  /** Offset/length of the object node (used for diagnostics + jump-to). */
  offset: number;
  length: number;
  /** How many siblings have it, e.g. 4/5. */
  presentIn: number;
  siblingCount: number;
  /** Possible typo in this object, e.g. `emial` vs `email`. */
  typoOf?: string;
  /** Path of the array/object scope being compared. */
  containerPath: string;
}

export interface FindMissingKeysOptions {
  /** Minimum items in an array to compare shapes (default 2). */
  minItems?: number;
  /** Only flag keys present in at least this fraction of siblings (default 0.5). */
  minPrevalence?: number;
  /** Max reports to return (default 50). */
  maxReports?: number;
}

function objectKeys(obj: JsonCNode): { key: string; keyOffset: number; keyLength: number }[] {
  const out: { key: string; keyOffset: number; keyLength: number }[] = [];
  for (const prop of obj.children ?? []) {
    if (prop.type !== 'property' || !prop.children || prop.children.length < 1) continue;
    const keyNode = prop.children[0];
    out.push({ key: String(keyNode.value), keyOffset: keyNode.offset, keyLength: keyNode.length });
  }
  return out;
}

/** Small edit-distance check for typo hints (`emial` vs `email`). */
export function isLikelyTypo(a: string, b: string): boolean {
  if (a === b || a.length < 3 || b.length < 3) return false;
  if (Math.abs(a.length - b.length) > 2) return false;
  // Bounded Levenshtein with early exit (> 2 = not a typo).
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    let rowMin = dp[0];
    for (let j = 1; j <= b.length; j++) {
      const cur = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
      rowMin = Math.min(rowMin, dp[j]);
    }
    if (rowMin > 2) return false;
  }
  return dp[b.length] <= 2 && dp[b.length] > 0;
}

/**
 * Find keys missing from some objects but present in most siblings.
 * Compares shapes of objects inside the same array (e.g. `users[0..n]`)
 * and of the root object itself when it has object-valued children.
 * Pure — never modifies data.
 */
export function findMissingKeys(
  root: JsonCNode | undefined,
  opts: FindMissingKeysOptions = {},
): MissingKeyInfo[] {
  const { minItems = 2, minPrevalence = 0.5, maxReports = 50 } = opts;
  const out: MissingKeyInfo[] = [];
  if (!root) return out;

  const checkGroup = (objects: JsonCNode[], containerPath: string): void => {
    if (objects.length < minItems) return;
    const keySets = objects.map((o) => new Set(objectKeys(o).map((k) => k.key)));
    const counts = new Map<string, number>();
    for (const ks of keySets) for (const k of ks) counts.set(k, (counts.get(k) ?? 0) + 1);
    objects.forEach((obj, idx) => {
      const present = keySets[idx];
      const objPath = pathToJsonPathString(getNodePathSegments(obj));
      const ownKeys = objectKeys(obj).map((k) => k.key);
      for (const [key, count] of counts) {
        if (present.has(key)) continue;
        if (count / objects.length < minPrevalence) continue;
        // Skip keys that only appear once — likely intentional variation.
        if (count < 2) continue;
        const typoOf = ownKeys.find((k) => isLikelyTypo(k, key));
        out.push({
          key,
          path: objPath,
          offset: obj.offset,
          length: Math.max(1, obj.length),
          presentIn: count,
          siblingCount: objects.length,
          typoOf,
          containerPath,
        });
        if (out.length >= maxReports) return;
      }
    });
  };

  const visit = (node: JsonCNode): void => {
    if (out.length >= maxReports) return;
    if (node.type === 'array') {
      const objects = (node.children ?? []).filter((c) => c.type === 'object');
      if (objects.length >= minItems && objects.length === (node.children ?? []).length) {
        checkGroup(objects, pathToJsonPathString(getNodePathSegments(node)));
      }
    }
    for (const child of node.children ?? []) {
      visit(child);
      if (out.length >= maxReports) return;
    }
  };
  visit(root);
  return out;
}
