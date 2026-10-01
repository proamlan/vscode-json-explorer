import * as vscode from 'vscode';
import { Node as JsonCNode } from 'jsonc-parser';
import { depthOf } from '../parser/JsonNode';

interface FoldTarget {
  startLine: number;
  endLine: number;
  depth: number;
  kind: 'object' | 'array';
}

function collectTargets(doc: vscode.TextDocument, root: JsonCNode | undefined): FoldTarget[] {
  const out: FoldTarget[] = [];
  if (!root) return out;
  const visit = (node: JsonCNode): void => {
    if (node.type === 'object' || node.type === 'array') {
      const start = doc.positionAt(node.offset).line;
      const end = doc.positionAt(node.offset + node.length).line;
      if (end > start) {
        out.push({
          startLine: start,
          endLine: end,
          depth: depthOf(node),
          kind: node.type,
        });
      }
    }
    for (const c of node.children ?? []) visit(c);
  };
  visit(root);
  return out;
}

async function foldRanges(ranges: { startLine: number }[]): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || ranges.length === 0) return;
  // VS Code has no direct programmatic fold-range API; use built-in fold command
  // with cursor placements at each target start line.
  const selections = ranges.map(
    (r) => new vscode.Selection(r.startLine, 0, r.startLine, 0),
  );
  editor.selections = selections;
  await vscode.commands.executeCommand('editor.fold');
  editor.selections = [new vscode.Selection(0, 0, 0, 0)];
}

export async function collapseAll(): Promise<void> {
  await vscode.commands.executeCommand('editor.foldAll');
}

export async function expandAll(): Promise<void> {
  await vscode.commands.executeCommand('editor.unfoldAll');
}

export async function collapseToLevel(
  doc: vscode.TextDocument,
  root: JsonCNode | undefined,
  level: number,
): Promise<void> {
  // Fold every container at depth >= level (root depth 0).
  const targets = collectTargets(doc, root).filter((t) => t.depth >= level);
  // Fold deepest first so outer folds don't invalidate inner line numbers
  // (we only use start lines, so ordering barely matters, but keep it stable).
  targets.sort((a, b) => b.depth - a.depth);
  await foldRanges(targets);
}

export async function collapseKind(
  doc: vscode.TextDocument,
  root: JsonCNode | undefined,
  kind: 'object' | 'array',
): Promise<void> {
  const targets = collectTargets(doc, root).filter((t) => t.kind === kind);
  await foldRanges(targets);
}

export async function askLevelAndCollapse(
  doc: vscode.TextDocument,
  root: JsonCNode | undefined,
): Promise<void> {
  const pick = await vscode.window.showQuickPick(['Level 1', 'Level 2', 'Level 3', 'Level 4'].map((label) => ({ label })), {
    title: 'Collapse to level',
  });
  if (!pick) return;
  const level = Number(pick.label.replace('Level ', ''));
  await collapseToLevel(doc, root, level);
}
