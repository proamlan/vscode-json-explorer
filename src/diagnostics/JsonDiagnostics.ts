import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';
import { Node as JsonCNode } from 'jsonc-parser';
import { findDuplicates } from './DuplicateKeyDetector';

const MAX_PROBLEMS = 200;

export interface SchemaIssue {
  message: string;
  offset: number;
  length: number;
}

export function parseErrorsToDiagnostics(
  doc: vscode.TextDocument,
  errors: jsonc.ParseError[],
): vscode.Diagnostic[] {
  const diags: vscode.Diagnostic[] = [];
  for (const e of errors.slice(0, MAX_PROBLEMS)) {
    const range = new vscode.Range(doc.positionAt(e.offset), doc.positionAt(e.offset + e.length));
    const msg = `${jsonc.printParseErrorCode(e.error)}`;
    const d = new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Error);
    d.source = 'json';
    d.code = e.error;
    diags.push(d);
  }
  return diags;
}

export function duplicatesToDiagnostics(
  doc: vscode.TextDocument,
  root: JsonCNode | undefined,
): vscode.Diagnostic[] {
  const diags: vscode.Diagnostic[] = [];
  for (const d of findDuplicates(root).slice(0, MAX_PROBLEMS)) {
    const range = new vscode.Range(
      doc.positionAt(d.dupOffset),
      doc.positionAt(d.dupOffset + d.dupLength),
    );
    const diag = new vscode.Diagnostic(
      range,
      `Duplicate property "${d.key}"`,
      vscode.DiagnosticSeverity.Warning,
    );
    diag.source = 'json-explorer';
    diag.code = 'duplicate-key';
    diags.push(diag);
  }
  return diags;
}

export function schemaIssuesToDiagnostics(
  doc: vscode.TextDocument,
  root: JsonCNode | undefined,
  issues: SchemaIssue[],
): vscode.Diagnostic[] {
  return issues.slice(0, MAX_PROBLEMS).map((i) => {
    const start = Math.max(0, Math.min(i.offset, doc.getText().length));
    const end = Math.max(start, Math.min(start + Math.max(1, i.length), doc.getText().length));
    const node = root ? jsonc.findNodeAtOffset(root, start) : undefined;
    void node;
    const d = new vscode.Diagnostic(
      new vscode.Range(doc.positionAt(start), doc.positionAt(end)),
      i.message,
      vscode.DiagnosticSeverity.Error,
    );
    d.source = 'json-schema';
    return d;
  });
}
