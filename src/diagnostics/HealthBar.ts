import * as vscode from 'vscode';

/**
 * Always-visible JSON health indicator so problems in huge files are
 * never "at the bottom somewhere". Clicking jumps to the issue list.
 * - `$(check) JSON OK` when clean
 * - `$(error) JSON: 2 errors, 1 warning` otherwise (red background on errors)
 */
export class HealthBar implements vscode.Disposable {
  private item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 4);

  constructor(private isEnabled: () => boolean) {
    this.item.command = 'jsonExplorer.checkSanity';
    this.item.tooltip = 'JSON health — click to see issues and jump to them';
  }

  update(doc: vscode.TextDocument | undefined, diags: readonly vscode.Diagnostic[] | undefined): void {
    if (!this.isEnabled() || !doc) {
      this.item.hide();
      return;
    }
    const errors = diags?.filter((d) => d.severity === vscode.DiagnosticSeverity.Error).length ?? 0;
    const warnings = diags?.filter((d) => d.severity === vscode.DiagnosticSeverity.Warning).length ?? 0;
    if (errors === 0 && warnings === 0) {
      const notes = diags?.length ?? 0;
      this.item.text = notes > 0 ? `$(info) JSON: OK · ${notes} note(s)` : '$(check) JSON: OK';
      this.item.backgroundColor = undefined;
      this.item.tooltip = 'JSON looks good — click for the full sanity report';
      this.item.show();
      return;
    }
    const parts: string[] = [];
    if (errors > 0) parts.push(`${errors} error${errors === 1 ? '' : 's'}`);
    if (warnings > 0) parts.push(`${warnings} warning${warnings === 1 ? '' : 's'}`);
    this.item.text = `$(error) JSON: ${parts.join(', ')}`;
    this.item.backgroundColor = errors > 0 ? new vscode.ThemeColor('statusBarItem.errorBackground') : new vscode.ThemeColor('statusBarItem.warningBackground');
    this.item.tooltip = `JSON has ${parts.join(' and ')} — click to jump to them (no scrolling needed)`;
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
