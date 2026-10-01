import * as vscode from 'vscode';
import { findDuplicates } from '../diagnostics/DuplicateKeyDetector';
import { Node as JsonCNode } from 'jsonc-parser';

/** CodeActions: deterministic safe fixes only. */
export class JsonQuickFixes implements vscode.CodeActionProvider {
  constructor(private getRoot: (doc: vscode.TextDocument) => JsonCNode | undefined) {}

  provideCodeActions(
    doc: vscode.TextDocument,
    range: vscode.Range,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const root = this.getRoot(doc);
    if (!root) return actions;

    for (const d of findDuplicates(root)) {
      const dupRange = new vscode.Range(
        doc.positionAt(d.dupOffset),
        doc.positionAt(d.dupOffset + d.dupLength),
      );
      if (!dupRange.intersection(range)) continue;
      // Only offer removal when it is unambiguous which property is the later
      // duplicate; still never auto-apply — the user invokes it explicitly.
      const propRange = new vscode.Range(
        doc.positionAt(d.propOffset),
        doc.positionAt(d.propLength),
      );
      const fix = new vscode.CodeAction(
        `Remove duplicate property "${d.key}" (keeps first)`,
        vscode.CodeActionKind.QuickFix,
      );
      fix.diagnostics = [
        new vscode.Diagnostic(dupRange, `Duplicate property "${d.key}"`, vscode.DiagnosticSeverity.Warning),
      ];
      fix.edit = new vscode.WorkspaceEdit();
      // Expand to full lines/commas carefully: remove the duplicate property node
      // plus one adjacent comma to keep JSON valid.
      fix.edit.delete(doc.uri, expandWithComma(doc, propRange));
      fix.command = { command: 'jsonExplorer.removeDuplicate', title: 'Remove duplicate' };
      actions.push(fix);
    }

    const format = new vscode.CodeAction('Format JSON', vscode.CodeActionKind.QuickFix);
    format.command = { command: 'jsonExplorer.format', title: 'Format JSON' };
    actions.push(format);
    return actions;
  }
}

export function expandWithComma(doc: vscode.TextDocument, r: vscode.Range): vscode.Range {
  const text = doc.getText();
  const start = doc.offsetAt(r.start);
  const end = doc.offsetAt(r.end);
  // Prefer deleting a preceding comma + whitespace, else a trailing comma.
  const s = start;
  let i = s - 1;
  while (i >= 0 && /\s/.test(text[i])) i--;
  if (text[i] === ',') {
    return new vscode.Range(doc.positionAt(i), doc.positionAt(end));
  }
  let e = end;
  while (e < text.length && /\s/.test(text[e])) e++;
  // also consume trailing newline-adjacent comma
  let j = e;
  while (j < text.length && /\s/.test(text[j])) j++;
  if (text[j] === ',') e = j + 1;
  void s;
  return new vscode.Range(doc.positionAt(start), doc.positionAt(e));
}

/** Best-effort deterministic repairs: trailing commas only. Never guesses ambiguous data. */
export function deterministicRepairs(text: string): string | undefined {
  // Remove trailing commas before } or ] — the only safe automatic repair.
  const repaired = text.replace(/,(\s*[}\]])/g, '$1');
  return repaired !== text ? repaired : undefined;
}
