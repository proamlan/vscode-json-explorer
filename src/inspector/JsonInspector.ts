import * as vscode from 'vscode';
import { Node as JsonCNode } from 'jsonc-parser';
import { findNodeAtOffset, getNodeValue } from '../parser/JsonParser';
import { depthOf, nodeTypeOf } from '../parser/JsonNode';
import { formatBytes } from '../utils/debounce';
import { getNodePathSegments, pathToJsonPathString } from '../parser/JsonPosition';

export class JsonInspector {
  constructor(private getRoot: (doc: vscode.TextDocument) => JsonCNode | undefined) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.languages.registerHoverProvider([{ language: 'json' }, { language: 'jsonc' }], {
        provideHover: (doc, pos) => this.hover(doc, pos),
      }),
      vscode.commands.registerCommand('jsonExplorer.inspectNode', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const hover = this.hover(editor.document, editor.selection.active);
        if (!hover) {
          vscode.window.showInformationMessage('No JSON node at cursor.');
          return;
        }
        const text = hover.contents.map((c) => (typeof c === 'string' ? c : c.value)).join('\n');
        const pick = await vscode.window.showQuickPick(
          text.split('\n').map((line) => ({ label: line })),
          { title: 'JSON node inspector' },
        );
        void pick;
      }),
    );
  }

  hover(doc: vscode.TextDocument, pos: vscode.Position): vscode.Hover | undefined {
    const root = this.getRoot(doc);
    if (!root) return undefined;
    const node = findNodeAtOffset(root, doc.offsetAt(pos));
    if (!node) return undefined;
    // Prefer the value node over property/key nodes for cleaner info.
    const target = node.type === 'property' ? (node.children?.[1] ?? node) : node;
    const t = nodeTypeOf(target);
    const path = pathToJsonPathString(getNodePathSegments(target));
    const depth = depthOf(target);
    const lines: string[] = [];
    lines.push(`**${t.toUpperCase()}**  \`${path}\``);
    if (target.type === 'object') {
      const n = target.children?.length ?? 0;
      lines.push(`Properties: ${n} · Depth: ${depth} · Size: ${formatBytes(target.length)}`);
    } else if (target.type === 'array') {
      const n = target.children?.length ?? 0;
      lines.push(`Items: ${n} · Depth: ${depth}`);
    } else {
      const v = getNodeValue(target);
      if (typeof v === 'string') lines.push(`Length: ${v.length} · Depth: ${depth}`);
      else lines.push(`Value: \`${preview(v)}\` · Depth: ${depth}`);
    }
    const md = new vscode.MarkdownString(lines.join('\n\n'));
    md.isTrusted = false;
    const range = new vscode.Range(
      doc.positionAt(target.offset),
      doc.positionAt(target.offset + target.length),
    );
    return new vscode.Hover(md, range);
  }
}

function preview(v: unknown): string {
  if (v === null) return 'null';
  const s = String(v);
  return s.length > 60 ? s.slice(0, 57) + '…' : s;
}
