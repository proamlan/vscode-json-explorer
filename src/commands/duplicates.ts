import * as vscode from 'vscode';
import { Node as JsonCNode, ParseError } from 'jsonc-parser';
import * as jsonc from 'jsonc-parser';
import { findDuplicates } from '../diagnostics/DuplicateKeyDetector';
import { findDuplicateValues } from '../diagnostics/DuplicateValues';
import { getNodePathSegments, pathToJsonPathString } from '../parser/JsonPosition';

/** QuickPick audit: list duplicate keys + duplicate array entries, jump to any of them. */
export async function runFindDuplicates(
  doc: vscode.TextDocument,
  root: JsonCNode | undefined,
): Promise<void> {
  const dupKeys = findDuplicates(root);
  const dupValues = findDuplicateValues(root);
  if (dupKeys.length === 0 && dupValues.length === 0) {
    vscode.window.showInformationMessage('No duplicate keys or duplicate entries found.');
    return;
  }
  interface Item extends vscode.QuickPickItem {
    offset: number;
    length: number;
  }
  const items: Item[] = [];
  for (const d of dupKeys) {
    items.push({
      label: `$(key) Duplicate key "${d.key}"`,
      description: 'duplicate key',
      detail: pathToJsonPathString(getNodePathSegments(dupPropNode(root, d.propOffset))),
      offset: d.dupOffset,
      length: d.dupLength,
    });
  }
  for (const g of dupValues) {
    for (const occ of g.occurrences) {
      items.push({
        label: `$(copy) ${g.preview}`,
        description: `duplicate entry in ${g.containerPath}`,
        detail: occ.path,
        offset: occ.offset,
        length: occ.length,
      });
    }
  }
  const pick = await vscode.window.showQuickPick(items, {
    title: `Duplicates (${dupKeys.length} key(s), ${dupValues.length} duplicate entr(y/ies)) — pick to jump`,
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!pick) return;
  const editor = await vscode.window.showTextDocument(doc, { preview: false });
  const range = new vscode.Range(
    doc.positionAt(pick.offset),
    doc.positionAt(pick.offset + pick.length),
  );
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  editor.selection = new vscode.Selection(range.start, range.start);
}

function dupPropNode(root: JsonCNode | undefined, propOffset: number): JsonCNode | undefined {
  if (!root) return undefined;
  return jsonc.findNodeAtOffset(root, propOffset, true) ?? undefined;
}

/** Basic JSON sanity check: aggregate syntax + duplicates + empty/null into one report. */
export async function runSanityCheckCommand(
  doc: vscode.TextDocument,
  root: JsonCNode | undefined,
  errors: ParseError[],
): Promise<void> {
  // Lazy import to keep the pure report testable without vscode.
  const { runSanityCheck } = await import('../diagnostics/SanityCheck');
  const report = runSanityCheck(doc.getText(), root, errors);
  interface Item extends vscode.QuickPickItem {
    offset?: number;
    length?: number;
  }
  if (report.issues.length === 0) {
    vscode.window.showInformationMessage('✓ JSON sanity check passed: valid JSON, no duplicates, no empty values.');
    return;
  }
  const iconFor = (s: string): string =>
    s === 'error' ? '$(error)' : s === 'warning' ? '$(warning)' : '$(info)';
  const items: Item[] = report.issues.slice(0, 100).map((i) => ({
    label: `${iconFor(i.severity)} ${i.message}`,
    description: i.severity,
    detail: i.path,
    offset: i.offset,
    length: i.length,
  }));
  vscode.window
    .showInformationMessage(`JSON sanity: ${report.summary}`, 'Show details…')
    .then(async (choice) => {
      if (choice !== 'Show details…') return;
      const pick = await vscode.window.showQuickPick(items, {
        title: `JSON sanity — ${report.summary}`,
        matchOnDescription: true,
        matchOnDetail: true,
      });
      if (!pick || pick.offset === undefined) return;
      const editor = await vscode.window.showTextDocument(doc, { preview: false });
      const len = Math.max(1, pick.length ?? 1);
      const range = new vscode.Range(
        doc.positionAt(pick.offset),
        doc.positionAt(pick.offset + len),
      );
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      editor.selection = new vscode.Selection(range.start, range.start);
    });
}
