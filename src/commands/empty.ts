import * as vscode from 'vscode';
import { Node as JsonCNode } from 'jsonc-parser';
import { getNodePathSegments, pathToJsonPathString } from '../parser/JsonPosition';

export type EmptyKind = 'null' | 'empty-string' | 'empty-array' | 'empty-object';

export interface EmptyValue {
  kind: EmptyKind;
  node: JsonCNode;
  path: string;
}

/**
 * Pure collection of empty values: null, "", [] and {} anywhere in the tree.
 * The root node itself is included when the whole document is empty.
 */
export function collectEmptyValues(root: JsonCNode | undefined): EmptyValue[] {
  const out: EmptyValue[] = [];
  if (!root) return out;
  const visit = (node: JsonCNode): void => {
    const kind = emptyKindOf(node);
    if (kind && node.type !== 'property') {
      out.push({ kind, node, path: pathToJsonPathString(getNodePathSegments(node)) });
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return out;
}

export function emptyKindOf(node: JsonCNode): EmptyKind | undefined {
  if (node.type === 'null') return 'null';
  if (node.type === 'string' && (node.value as string) === '') return 'empty-string';
  if (node.type === 'array' && (node.children?.length ?? 0) === 0) return 'empty-array';
  if (node.type === 'object' && (node.children?.length ?? 0) === 0) return 'empty-object';
  return undefined;
}

export function emptyLabel(e: EmptyValue): string {
  switch (e.kind) {
    case 'null':
      return `${e.path} — null`;
    case 'empty-string':
      return `${e.path} — empty string`;
    case 'empty-array':
      return `${e.path} — empty array`;
    case 'empty-object':
      return `${e.path} — empty object`;
  }
}

/**
 * Pure removal plan: document offsets to delete so each empty value (or its
 * enclosing property) disappears along with one adjacent comma.
 * Ranges are computed against the given text; apply descending by start.
 */
export function planPrune(
  text: string,
  empties: readonly EmptyValue[],
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const e of empties) {
    const target = e.node.parent?.type === 'property' ? e.node.parent : e.node;
    ranges.push(expandOffsets(text, target.offset, target.offset + target.length));
  }
  ranges.sort((a, b) => b.start - a.start);
  return ranges;
}

function expandOffsets(text: string, start: number, end: number): { start: number; end: number } {
  let i = start - 1;
  while (i >= 0 && /\s/.test(text[i])) i--;
  if (text[i] === ',') return { start: i, end };
  let e = end;
  while (e < text.length && /\s/.test(text[e])) e++;
  let j = e;
  while (j < text.length && /\s/.test(text[j])) j++;
  if (text[j] === ',') e = j + 1;
  return { start, end: e };
}

function toVsRange(doc: vscode.TextDocument, r: { start: number; end: number }): vscode.Range {
  return new vscode.Range(doc.positionAt(r.start), doc.positionAt(r.end));
}

/** QuickPick audit: jump to any empty value, or prune them with confirmation. */
export async function runFindEmptyValues(
  doc: vscode.TextDocument,
  root: JsonCNode | undefined,
): Promise<void> {
  const empties = collectEmptyValues(root).filter((e) => e.node !== root);
  if (empties.length === 0) {
    vscode.window.showInformationMessage('No empty values (null, "", [], {}) found.');
    return;
  }
  interface Item extends vscode.QuickPickItem {
    action: 'goto' | 'prune';
    empty?: EmptyValue;
  }
  const items: Item[] = empties.map((e) => ({
    label: emptyLabel(e),
    description: e.kind,
    action: 'goto',
    empty: e,
  }));
  items.push({
    label: `$(trash) Remove all ${empties.length} empty value(s)…`,
    description: 'modifies the document',
    action: 'prune',
  });
  const pick = await vscode.window.showQuickPick(items, {
    title: `Empty values (${empties.length}) — pick to jump, or prune all`,
    matchOnDescription: true,
  });
  if (!pick) return;
  const editor = await vscode.window.showTextDocument(doc, { preview: false });
  if (pick.action === 'goto' && pick.empty) {
    const n = pick.empty.node;
    const range = new vscode.Range(doc.positionAt(n.offset), doc.positionAt(n.offset + n.length));
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    editor.selection = new vscode.Selection(range.start, range.start);
    return;
  }
  const confirm = await vscode.window.showQuickPick([{ label: 'Remove all empty values' }, { label: 'Cancel' }], {
    title: `Remove ${empties.length} empty value(s)? This edits the document.`,
  });
  if (!confirm || confirm.label === 'Cancel') return;
  const text = doc.getText();
  const plan = planPrune(text, empties);
  await editor.edit((b) => {
    for (const r of plan) b.delete(toVsRange(editor.document, r));
  });
  // Clean up any trailing comma left behind (deterministic repair only).
  const after = editor.document.getText().replace(/,(\s*[}\]])/g, '$1');
  if (after !== editor.document.getText()) {
    const full = new vscode.Range(
      editor.document.positionAt(0),
      editor.document.positionAt(editor.document.getText().length),
    );
    await editor.edit((b) => b.replace(full, after));
  }
}
