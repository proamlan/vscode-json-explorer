import * as vscode from 'vscode';
import { Node as JsonCNode } from 'jsonc-parser';
import { collectLensTargets } from './JsonLensProvider';
import { describeCount } from '../utils/debounce';

/** `8 properties` / `1,248 items` — the badge text rendered after `{` / `[` lines. */
export function badgeText(kind: 'object' | 'array', count: number): string {
  return kind === 'object'
    ? describeCount(count, 'property', 'properties')
    : describeCount(count, 'item', 'items');
}

/**
 * Editor decorations rendering item counts at the end of each multi-line
 * `{` / `[` opening line. More prominent than CodeLens; same pure data
 * source (collectLensTargets). One decoration type per distinct text,
 * disposed and rebuilt on every update.
 */
export class CountBadges implements vscode.Disposable {
  private types: vscode.TextEditorDecorationType[] = [];

  constructor(
    private getRoot: (doc: vscode.TextDocument) => JsonCNode | undefined,
    private isEnabled: () => boolean,
    private getMaxDepth: () => number,
  ) {}

  update(editors: readonly vscode.TextEditor[]): void {
    this.clear();
    if (!this.isEnabled()) return;
    const jsonEditors = editors.filter(
      (e) => e.document.languageId === 'json' || e.document.languageId === 'jsonc',
    );
    for (const editor of jsonEditors) {
      const root = this.getRoot(editor.document);
      if (!root) continue;
      // Group ranges by badge text; decoration types are shared per text
      // but applied per editor so split panes stay correct.
      const byText = new Map<string, vscode.Range[]>();
      const text = editor.document.getText();
      for (const t of collectLensTargets(root, text, { maxDepth: this.getMaxDepth() })) {
        const lineLen = editor.document.lineAt(t.startLine).text.length;
        const range = new vscode.Range(t.startLine, lineLen, t.startLine, lineLen);
        const key = badgeText(t.kind, t.count);
        const list = byText.get(key);
        if (list) list.push(range);
        else byText.set(key, [range]);
      }
      for (const [label, ranges] of byText) {
        const type = vscode.window.createTextEditorDecorationType({
          after: {
            contentText: ` ${label}`,
            color: new vscode.ThemeColor('editorCodeLens.foreground'),
            margin: '0 0 0 12px',
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
