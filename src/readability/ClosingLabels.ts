import * as vscode from 'vscode';
import { Node as JsonCNode } from 'jsonc-parser';
import { depthOf } from '../parser/JsonNode';
import { offsetToPosition } from '../utils/ranges';

export interface ClosingLabel {
  /** Document offset where the hint is anchored (end of the closing line). */
  line: number;
  character: number;
  label: string;
}

export interface ClosingLabelOptions {
  minLines: number;
  maxDepth: number;
  maxLabels: number;
}

const DEFAULT_OPTIONS: ClosingLabelOptions = { minLines: 8, maxDepth: 20, maxLabels: 300 };

/**
 * Pure collection of end-of-block labels: for objects/arrays spanning at
 * least `minLines` lines, produce a `users` / `users[12]` label anchored at
 * the end of the closing `}` / `]` line so long blocks stay readable.
 * The root block and short blocks get no label.
 */
export function collectClosingLabels(
  root: JsonCNode | undefined,
  text: string,
  opts: Partial<ClosingLabelOptions> = {},
): ClosingLabel[] {
  const { minLines, maxDepth, maxLabels } = { ...DEFAULT_OPTIONS, ...opts };
  const out: ClosingLabel[] = [];
  if (!root) return out;
  const lines = text.split('\n');

  const visit = (node: JsonCNode): void => {
    if (out.length >= maxLabels) return;
    if (
      (node.type === 'object' || node.type === 'array') &&
      node !== root &&
      depthOf(node) <= maxDepth
    ) {
      const startLine = offsetToPosition(text, node.offset).line;
      const endLine = offsetToPosition(text, node.offset + node.length).line;
      if (endLine - startLine + 1 >= minLines) {
        const label = labelFor(node);
        if (label && label.length <= 40) {
          out.push({ line: endLine, character: (lines[endLine] ?? '').length, label });
        }
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return out;
}

/** `users` for property values, `users[12]` for array items, '' otherwise. */
export function labelFor(node: JsonCNode): string {
  const parent = node.parent;
  if (!parent) return '';
  if (parent.type === 'property' && parent.children?.[0]) {
    return String(parent.children[0].value ?? '');
  }
  if (parent.type === 'array' && parent.parent?.type === 'property') {
    const keyNode = parent.parent.children?.[0];
    const key = String(keyNode?.value ?? '');
    const index = parent.children?.indexOf(node) ?? -1;
    if (key && index >= 0) return `${key}[${index}]`;
    if (index >= 0) return `[${index}]`;
  }
  return '';
}

/** Native inlay-hints provider: subtle closing labels for long JSON blocks. */
export class JsonClosingLabelProvider implements vscode.InlayHintsProvider {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeInlayHints = this._onDidChange.event;

  constructor(
    private getRoot: (doc: vscode.TextDocument) => JsonCNode | undefined,
    private isEnabled: () => boolean,
    private getMinLines: () => number,
    private getMaxDepth: () => number,
  ) {}

  refresh(): void {
    this._onDidChange.fire();
  }

  provideInlayHints(doc: vscode.TextDocument): vscode.InlayHint[] {
    if (!this.isEnabled()) return [];
    const root = this.getRoot(doc);
    if (!root) return [];
    return collectClosingLabels(root, doc.getText(), {
      minLines: this.getMinLines(),
      maxDepth: this.getMaxDepth(),
    }).map((l) => {
      const hint = new vscode.InlayHint(new vscode.Position(l.line, l.character), l.label);
      hint.paddingLeft = true;
      hint.tooltip = 'JSON block closing label';
      return hint;
    });
  }
}
