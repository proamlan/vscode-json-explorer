import { Node as JsonCNode } from 'jsonc-parser';

export interface DuplicateInfo {
  key: string;
  firstOffset: number;
  firstLength: number;
  dupOffset: number;
  dupLength: number;
  /** Offset/length of the whole duplicate property node for removal. */
  propOffset: number;
  propLength: number;
}

/** Detect duplicate keys within the same object. Never modifies data. */
export function findDuplicates(root: JsonCNode | undefined): DuplicateInfo[] {
  const out: DuplicateInfo[] = [];
  if (!root) return out;
  const visit = (node: JsonCNode): void => {
    if (node.type === 'object' && node.children) {
      const seen = new Map<string, { keyOffset: number; keyLength: number }>();
      for (const prop of node.children) {
        if (prop.type !== 'property' || !prop.children || prop.children.length < 2) continue;
        const keyNode = prop.children[0];
        const key = String(keyNode.value);
        const cur = { keyOffset: keyNode.offset, keyLength: keyNode.length };
        const prev = seen.get(key);
        if (prev) {
          out.push({
            key,
            firstOffset: prev.keyOffset,
            firstLength: prev.keyLength,
            dupOffset: cur.keyOffset,
            dupLength: cur.keyLength,
            propOffset: prop.offset,
            propLength: prop.length,
          });
        } else {
          seen.set(key, cur);
        }
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return out;
}
