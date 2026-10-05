import * as vscode from 'vscode';

/**
 * Extra-large-file visibility: diagnostics already paint squiggles, but in
 * a 10k-line file the overview-ruler tick is easy to miss. These whole-line
 * bands + stronger overview-ruler markers make errors/warnings visible
 * from afar (gutter-adjacent, no scrolling to discover them).
 *
 * Visibility design (both editor + minimap/scrollbar "side preview"):
 * - whole-line background (stronger alpha than before)
 * - 3px left border in the diagnostic color (visible even when color-blind
 *   to faint red washes, and visible in the minimap overview strip)
 * - `●` gutter marker via `before` attachment (no image asset needed)
 * - overview ruler lane Full for BOTH errors and warnings so the right-side
 *   preview strip always shows them
 */
export class IssueDecorations implements vscode.Disposable {
  private types: vscode.TextEditorDecorationType[] = [];

  constructor(private isEnabled: () => boolean) {}

  update(editor: vscode.TextEditor, diags: readonly vscode.Diagnostic[]): void {
    this.clear();
    if (!this.isEnabled()) return;
    if (editor.document.languageId !== 'json' && editor.document.languageId !== 'jsonc') return;
    const errors = diags.filter((d) => d.severity === vscode.DiagnosticSeverity.Error).map((d) => wholeLine(d.range));
    const warnings = diags.filter((d) => d.severity === vscode.DiagnosticSeverity.Warning).map((d) => wholeLine(d.range));
    if (errors.length > 0) {
      const t = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        // ~2x stronger than the old 0.07 wash — still transparent enough to
        // play well with selection/word-highlight, but visible at a glance.
        backgroundColor: 'rgba(255, 43, 43, 0.16)',
        borderWidth: '0 0 0 3px',
        borderStyle: 'solid',
        borderColor: new vscode.ThemeColor('editorError.foreground'),
        fontWeight: '600',
        before: {
          contentText: '● ',
          color: new vscode.ThemeColor('editorError.foreground'),
          fontWeight: 'bold',
          margin: '0 6px 0 0',
        },
        overviewRulerColor: new vscode.ThemeColor('editorError.foreground'),
        overviewRulerLane: vscode.OverviewRulerLane.Full,
      });
      this.types.push(t);
      editor.setDecorations(t, errors);
    }
    if (warnings.length > 0) {
      const t = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: 'rgba(255, 185, 0, 0.16)',
        borderWidth: '0 0 0 3px',
        borderStyle: 'solid',
        borderColor: new vscode.ThemeColor('editorWarning.foreground'),
        fontWeight: '600',
        before: {
          contentText: '● ',
          color: new vscode.ThemeColor('editorWarning.foreground'),
          fontWeight: 'bold',
          margin: '0 6px 0 0',
        },
        overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'),
        overviewRulerLane: vscode.OverviewRulerLane.Full,
      });
      this.types.push(t);
      editor.setDecorations(t, warnings);
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

function wholeLine(r: vscode.Range): vscode.Range {
  return new vscode.Range(r.start.line, 0, r.start.line, Number.MAX_SAFE_INTEGER);
}
