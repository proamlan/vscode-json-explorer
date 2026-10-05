import * as vscode from 'vscode';

/**
 * Pure index math for next/prev issue navigation (unit-tested).
 * Offsets must be sorted ascending. Wraps around.
 */
export function nextIssueIndex(
  offsets: readonly number[],
  cursorOffset: number,
  direction: 1 | -1,
): number {
  if (offsets.length === 0) return -1;
  if (direction === 1) {
    for (let i = 0; i < offsets.length; i++) {
      if (offsets[i] > cursorOffset) return i;
    }
    return 0;
  }
  for (let i = offsets.length - 1; i >= 0; i--) {
    if (offsets[i] < cursorOffset) return i;
  }
  return offsets.length - 1;
}

/** Reveal a diagnostic in the editor (centers it, places cursor). */
export async function revealDiagnostic(
  editor: vscode.TextEditor,
  diag: vscode.Diagnostic,
): Promise<void> {
  editor.revealRange(diag.range, vscode.TextEditorRevealType.InCenter);
  editor.selection = new vscode.Selection(diag.range.start, diag.range.start);
}

/**
 * Jump to the next/previous issue in document order. Errors sort before
 * warnings so the first jump lands on what matters most.
 */
export async function goToIssue(
  editor: vscode.TextEditor,
  diags: readonly vscode.Diagnostic[],
  direction: 1 | -1,
): Promise<void> {
  if (diags.length === 0) {
    vscode.window.showInformationMessage('No JSON issues — document looks good.');
    return;
  }
  const rank = (d: vscode.Diagnostic): number =>
    d.severity === vscode.DiagnosticSeverity.Error
      ? 0
      : d.severity === vscode.DiagnosticSeverity.Warning
        ? 1
        : 2;
  const sorted = [...diags].sort(
    (a, b) => rank(a) - rank(b) || editor.document.offsetAt(a.range.start) - editor.document.offsetAt(b.range.start),
  );
  const cursor = editor.document.offsetAt(editor.selection.active);
  const offsets = sorted.map((d) => editor.document.offsetAt(d.range.start));
  const idx = nextIssueIndex(offsets, cursor, direction);
  const target = sorted[idx];
  await revealDiagnostic(editor, target);
  const kind = target.severity === vscode.DiagnosticSeverity.Error ? 'Error' : target.severity === vscode.DiagnosticSeverity.Warning ? 'Warning' : 'Note';
  vscode.window.showInformationMessage(`${kind} ${idx + 1}/${sorted.length}: ${target.message}`);
}
