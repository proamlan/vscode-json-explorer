import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';
import { Node as JsonCNode } from 'jsonc-parser';
import { findDuplicates } from './DuplicateKeyDetector';
import { findDuplicateValues } from './DuplicateValues';
import { findMissingKeys } from './MissingKeys';
import { describeParseError } from './ParseErrorMessages';
import { collectEmptyValues } from '../commands/empty';

export { describeParseError } from './ParseErrorMessages';
export { sortDiagnosticsLikeSanity } from './ParseErrorMessages';

const MAX_PROBLEMS = 200;

export function parseErrorsToDiagnostics(
  doc: vscode.TextDocument,
  errors: jsonc.ParseError[],
): vscode.Diagnostic[] {
  const diags: vscode.Diagnostic[] = [];
  const text = doc.getText();
  for (const e of errors.slice(0, MAX_PROBLEMS)) {
    // jsonc often reports zero-length errors at EOF (unclosed brackets) —
    // widen to at least 1 char so the squiggle + overview marker are visible.
    const start = Math.max(0, Math.min(e.offset, text.length));
    const end = Math.max(start + 1, Math.min(start + Math.max(1, e.length), text.length));
    const range = new vscode.Range(doc.positionAt(start), doc.positionAt(Math.max(start + 1, end)));
    const { message, hint } = describeParseError(e.error);
    const pos = doc.positionAt(start);
    const snippet = snippetAround(text, start);
    const d = new vscode.Diagnostic(
      range,
      `${message} (line ${pos.line + 1}, col ${pos.character + 1}): ${hint}${snippet ? ` — near ${snippet}` : ''}`,
      vscode.DiagnosticSeverity.Error,
    );
    d.source = 'json';
    d.code = e.error;
    diags.push(d);
  }
  return diags;
}

function snippetAround(text: string, offset: number, radius = 24): string {
  const s = Math.max(0, offset - radius);
  const e = Math.min(text.length, offset + radius);
  const raw = text.slice(s, e).replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const clipped = raw.length > 48 ? raw.slice(0, 47) + '…' : raw;
  return `“${clipped}”`;
}

export interface SchemaIssue {
  message: string;
  offset: number;
  length: number;
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

export function duplicateValuesToDiagnostics(
  doc: vscode.TextDocument,
  root: JsonCNode | undefined,
): vscode.Diagnostic[] {
  const diags: vscode.Diagnostic[] = [];
  for (const g of findDuplicateValues(root).slice(0, MAX_PROBLEMS)) {
    // Flag each extra occurrence (keep the first) so Problems navigates to dupes.
    for (const occ of g.occurrences.slice(1)) {
      const range = new vscode.Range(
        doc.positionAt(occ.offset),
        doc.positionAt(occ.offset + occ.length),
      );
      const diag = new vscode.Diagnostic(
        range,
        `Duplicate entry ${g.preview} (×${g.occurrences.length} in ${g.containerPath})`,
        vscode.DiagnosticSeverity.Warning,
      );
      diag.source = 'json-explorer';
      diag.code = 'duplicate-value';
      diags.push(diag);
      if (diags.length >= MAX_PROBLEMS) return diags;
    }
  }
  return diags;
}

export function missingKeysToDiagnostics(
  doc: vscode.TextDocument,
  root: JsonCNode | undefined,
): vscode.Diagnostic[] {
  const diags: vscode.Diagnostic[] = [];
  for (const m of findMissingKeys(root).slice(0, MAX_PROBLEMS)) {
    const start = Math.max(0, Math.min(m.offset, doc.getText().length));
    const range = new vscode.Range(doc.positionAt(start), doc.positionAt(start + 1));
    const msg = m.typoOf
      ? `Possibly missing "${m.key}" in ${m.path} (present in ${m.presentIn}/${m.siblingCount} of ${m.containerPath}) — found "${m.typoOf}", is that a typo?`
      : `Missing "${m.key}" in ${m.path} (present in ${m.presentIn}/${m.siblingCount} of ${m.containerPath})`;
    const diag = new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Warning);
    diag.source = 'json-explorer';
    diag.code = 'missing-key';
    diags.push(diag);
  }
  return diags;
}

export function emptyValuesToDiagnostics(
  doc: vscode.TextDocument,
  root: JsonCNode | undefined,
): vscode.Diagnostic[] {
  const diags: vscode.Diagnostic[] = [];
  for (const e of collectEmptyValues(root).slice(0, MAX_PROBLEMS)) {
    if (e.node === root) continue;
    const range = new vscode.Range(
      doc.positionAt(e.node.offset),
      doc.positionAt(e.node.offset + e.node.length),
    );
    const label =
      e.kind === 'null'
        ? 'Null value'
        : e.kind === 'empty-string'
          ? 'Empty string'
          : e.kind === 'empty-array'
            ? 'Empty array'
            : 'Empty object';
    const diag = new vscode.Diagnostic(
      range,
      `${label} at ${e.path}`,
      vscode.DiagnosticSeverity.Information,
    );
    diag.source = 'json-explorer';
    diag.code = 'empty-value';
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
