import * as vscode from 'vscode';
import { Node as JsonCNode } from 'jsonc-parser';
import { collectEmptyValues, EmptyKind } from '../commands/empty';

/**
 * Subtle editor highlights for empty/null values so they are visible
 * at a glance without polluting the Problems panel.
 * - `null` and `""` get an inline `∅ null` / `∅ empty` badge.
 * - `[]` / `{}` reuse the inline-count badge area with an `empty` tag.
 */
export class EmptyHighlights implements vscode.Disposable {
  private types: vscode.TextEditorDecorationType[] = [];

  constructor(
    private getRoot: (doc: vscode.TextDocument) => JsonCNode | undefined,
    private isEnabled: () => boolean,
  ) {}

  update(editors: readonly vscode.TextEditor[]): void {
    this.clear();
    if (!this.isEnabled()) return;
    const targets = editors.filter(
      (e) => e.document.languageId === 'json' || e.document.languageId === 'jsonc',
    );
    for (const editor of targets) {
      const root = this.getRoot(editor.document);
      if (!root) continue;
      const byKind = new Map<EmptyKind, vscode.Range[]>();
      for (const e of collectEmptyValues(root)) {
        if (e.node === root) continue;
        const range = new vscode.Range(
          editor.document.positionAt(e.node.offset),
          editor.document.positionAt(e.node.offset + e.node.length),
        );
        const list = byKind.get(e.kind);
        if (list) list.push(range);
        else byKind.set(e.kind, [range]);
      }
      for (const [kind, ranges] of byKind) {
        const type = vscode.window.createTextEditorDecorationType({
          after: {
            contentText: ` ∅ ${emptyBadge(kind)}`,
            color: new vscode.ThemeColor('editorCodeLens.foreground'),
            margin: '0 0 0 8px',
          },
          rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        });
        this.types.push(type);
        editor.setDecorations(type, ranges);
      }
    }
  }

  private clear(): void {
    for (const t of this.types) t.dispose();
    this.types = [];
  }

  dispose(): void {
    this.clear();
  }
}

function emptyBadge(kind: EmptyKind): string {
  switch (kind) {
    case 'null':
      return 'null';
    case 'empty-string':
      return 'empty string';
    case 'empty-array':
      return 'empty array';
    case 'empty-object':
      return 'empty object';
  }
}
