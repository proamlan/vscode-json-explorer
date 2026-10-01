import * as vscode from 'vscode';
import { Node as JsonCNode } from 'jsonc-parser';
import { getNodeValue } from '../parser/JsonParser';
import {
  getNodePathSegments,
  pathToJsonPathString,
  pathToPointer,
} from '../parser/JsonPosition';
import { nodeTypeOf } from '../parser/JsonNode';

export interface SearchHit {
  label: string;
  detail: string;
  node: JsonCNode;
}

const MAX_RESULTS = 200;

/** Structure-aware search over keys, values, paths and types. */
export function searchTree(
  root: JsonCNode | undefined,
  query: string,
  maxDepth: number,
): SearchHit[] {
  const out: SearchHit[] = [];
  if (!root || !query) return out;
  const q = query.toLowerCase();
  const typeQuery = q.replace(/^(type|is):/, '');

  const visit = (node: JsonCNode, depth: number): void => {
    if (out.length >= MAX_RESULTS || depth > maxDepth) return;
    const path = getNodePathSegments(node);
    const jp = pathToJsonPathString(path);
    const pointer = pathToPointer(path);
    const t = nodeTypeOf(node);

    let key = '';
    const parent = node.parent;
    if (parent?.type === 'property' && parent.children?.[0]) {
      key = String(parent.children[0].value ?? '');
    } else if (node.type === 'property' && node.children?.[0]) {
      key = String(node.children[0].value ?? '');
    }

    const value = node.type === 'object' || node.type === 'array' ? undefined : getNodeValue(node);
    const hay = `${key} ${value !== undefined ? String(value) : ''} ${jp} ${pointer} ${t}`.toLowerCase();
    const matches =
      hay.includes(q) ||
      (query.startsWith('type:') && t === typeQuery) ||
      (query.startsWith('is:') && t === typeQuery);

    if (matches && node.type !== 'property') {
      const shownValue =
        value !== undefined ? `: ${truncate(String(value), 60)}` : node.type === 'object' || node.type === 'array' ? ` (${t})` : '';
      out.push({
        label: `${jp}${shownValue}`,
        detail: `${t}${key ? ` · key "${key}"` : ''} · ${pointer || '/'}`,
        node,
      });
    }
    for (const child of node.children ?? []) visit(child, depth + 1);
  };
  visit(root, 0);
  return out;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export async function runStructureSearch(
  doc: vscode.TextDocument,
  root: JsonCNode | undefined,
  maxDepth: number,
): Promise<void> {
  const query = await vscode.window.showInputBox({
    prompt: 'Search keys, values, paths, types (e.g. email, type:number)',
    placeHolder: 'email',
  });
  if (!query) return;
  const hits = searchTree(root, query, maxDepth);
  if (hits.length === 0) {
    vscode.window.showInformationMessage(`No JSON matches for "${query}".`);
    return;
  }
  const pick = await vscode.window.showQuickPick(
    hits.map((h) => ({ label: h.label, detail: h.detail, hit: h })),
    { title: `JSON matches for "${query}"`, matchOnDetail: true },
  );
  if (!pick) return;
  const editor = await vscode.window.showTextDocument(doc, { preview: false });
  const range = new vscode.Range(
    doc.positionAt(pick.hit.node.offset),
    doc.positionAt(pick.hit.node.offset + pick.hit.node.length),
  );
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  editor.selection = new vscode.Selection(range.start, range.start);
}
