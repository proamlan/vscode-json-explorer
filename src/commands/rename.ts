import * as vscode from 'vscode';
import { Node as JsonCNode } from 'jsonc-parser';
import { findNodeAtOffset } from '../parser/JsonParser';
import { getNodePathSegments, pathToJsonPathString } from '../parser/JsonPosition';

export interface KeyOccurrence {
  /** Property node offsets (whole `"old": value` range, for context). */
  propOffset: number;
  propLength: number;
  /** Key string offsets (the `"old"` token only — what gets replaced). */
  keyOffset: number;
  keyLength: number;
  path: string;
}

/**
 * Pure: find every property whose key equals `key` at or under `scope`
 * (the whole tree when scope is undefined).
 */
export function findKeyOccurrences(
  root: JsonCNode | undefined,
  scope: JsonCNode | undefined,
  key: string,
): KeyOccurrence[] {
  const out: KeyOccurrence[] = [];
  const start = scope ?? root;
  if (!start) return out;
  const visit = (node: JsonCNode): void => {
    if (node.type === 'property' && node.children && node.children.length >= 2) {
      const keyNode = node.children[0];
      if (String(keyNode.value) === key) {
        out.push({
          propOffset: node.offset,
          propLength: node.length,
          keyOffset: keyNode.offset,
          keyLength: keyNode.length,
          // Path of the value node (the property node itself has no segment).
          path: pathToJsonPathString(getNodePathSegments(node.children[1])),
        });
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(start);
  return out;
}

/**
 * Pure: would renaming `key` -> `newKey` under `scope` create duplicates?
 * Returns the conflicting paths (objects already containing `newKey`).
 */
export function findRenameConflicts(
  root: JsonCNode | undefined,
  scope: JsonCNode | undefined,
  key: string,
  newKey: string,
): string[] {
  if (key === newKey) return [];
  const conflicts: string[] = [];
  const start = scope ?? root;
  if (!start) return conflicts;
  const visit = (node: JsonCNode): void => {
    if (node.type === 'object' && node.children) {
      const keys = new Set<string>();
      let hasOld = false;
      for (const prop of node.children) {
        if (prop.type !== 'property' || !prop.children || prop.children.length < 2) continue;
        const k = String(prop.children[0].value);
        keys.add(k);
        if (k === key) hasOld = true;
      }
      if (hasOld && keys.has(newKey)) {
        conflicts.push(pathToJsonPathString(getNodePathSegments(node)) || '$');
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(start);
  return conflicts;
}

/** Property key at the cursor (key itself or inside its value), if any. */
export function keyAtOffset(
  root: JsonCNode | undefined,
  offset: number,
): { key: string; scopeHint: JsonCNode } | undefined {
  const node = root ? findNodeAtOffset(root, offset) : undefined;
  if (!node) return undefined;
  let cur: JsonCNode | undefined = node;
  while (cur) {
    if (cur.type === 'property' && cur.children && cur.children.length >= 2) {
      const key = String(cur.children[0].value ?? '');
      if (key) {
        const container = cur.parent?.type === 'object' || cur.parent?.type === 'array' ? cur.parent : cur;
        return { key, scopeHint: container };
      }
    }
    cur = cur.parent;
  }
  return undefined;
}

export async function runRenameKey(
  doc: vscode.TextDocument,
  root: JsonCNode | undefined,
  pos: vscode.Position,
): Promise<void> {
  const found = keyAtOffset(root, doc.offsetAt(pos));
  const key = found?.key;
  if (!key) {
    vscode.window.showInformationMessage('Place the cursor on a property key or value to rename it.');
    return;
  }
  const scopePick = await vscode.window.showQuickPick(
    [
      { label: 'Whole document', value: 'doc' },
      { label: 'Enclosing object/array only', value: 'scope' },
    ],
    { title: `Rename key "${key}" — scope` },
  );
  if (!scopePick) return;
  const scope = scopePick.value === 'scope' && found?.scopeHint ? found.scopeHint : undefined;
  const occurrences = findKeyOccurrences(root, scope, key);
  if (occurrences.length === 0) return;
  const newKey = await vscode.window.showInputBox({
    prompt: `Rename "${key}" (${occurrences.length} occurrence(s)) to:`,
    value: key,
    validateInput: (v) => (v.trim() === '' ? 'Key must not be empty.' : undefined),
  });
  if (!newKey || newKey === key) return;
  const conflicts = findRenameConflicts(root, scope, key, newKey);
  if (conflicts.length > 0) {
    vscode.window.showWarningMessage(
      `Rename aborted: "${newKey}" already exists in ${conflicts.length} object(s) (${conflicts.slice(0, 3).join(', ')}${conflicts.length > 3 ? ', …' : ''}).`,
    );
    return;
  }
  const editor = await vscode.window.showTextDocument(doc, { preview: false });
  const edit = new vscode.WorkspaceEdit();
  for (const o of occurrences) {
    // Replace only the inner key text, preserving quotes/escapes.
    const keyRange = new vscode.Range(doc.positionAt(o.keyOffset + 1), doc.positionAt(o.keyOffset + o.keyLength - 1));
    edit.replace(doc.uri, keyRange, newKey.replace(/["\\]/g, (c) => `\\${c}`));
  }
  await vscode.workspace.applyEdit(edit);
  vscode.window.showInformationMessage(`Renamed "${key}" → "${newKey}" (${occurrences.length} occurrence(s)).`);
  void editor;
}
