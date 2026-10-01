import * as vscode from 'vscode';
import { Node as JsonCNode } from 'jsonc-parser';
import { childCount, depthOf } from '../parser/JsonNode';
import { offsetToPosition } from '../utils/ranges';
import { describeCount } from '../utils/debounce';

export interface LensTarget {
  startLine: number;
  endLine: number;
  count: number;
  kind: 'object' | 'array';
  depth: number;
}

export interface LensOptions {
  maxDepth: number;
  maxLenses: number;
}

const DEFAULT_LENS_OPTIONS: LensOptions = { maxDepth: 20, maxLenses: 200 };

/**
 * Pure collection of CodeLens targets: multi-line objects/arrays get a
 * `8 properties` / `1,248 items` lens above their opening line.
 * Single-line containers are already readable and get no lens.
 */
export function collectLensTargets(
  root: JsonCNode | undefined,
  text: string,
  opts: Partial<LensOptions> = {},
): LensTarget[] {
  const { maxDepth, maxLenses } = { ...DEFAULT_LENS_OPTIONS, ...opts };
  const out: LensTarget[] = [];
  if (!root) return out;
  const visit = (node: JsonCNode): void => {
    if (out.length >= maxLenses) return;
    if ((node.type === 'object' || node.type === 'array') && depthOf(node) <= maxDepth) {
      const startLine = offsetToPosition(text, node.offset).line;
      const endLine = offsetToPosition(text, node.offset + node.length).line;
      if (endLine > startLine) {
        out.push({
          startLine,
          endLine,
          count: childCount(node),
          kind: node.type,
          depth: depthOf(node),
        });
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return out;
}

export function lensTitle(t: LensTarget): string {
  return t.kind === 'object'
    ? describeCount(t.count, 'property', 'properties')
    : describeCount(t.count, 'item', 'items');
}

/** Native CodeLens provider: item counts above JSON blocks, click to fold. */
export class JsonLensProvider implements vscode.CodeLensProvider {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChange.event;

  constructor(
    private getRoot: (doc: vscode.TextDocument) => JsonCNode | undefined,
    private isEnabled: () => boolean,
    private getMaxDepth: () => number,
  ) {}

  refresh(): void {
    this._onDidChange.fire();
  }

  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    if (!this.isEnabled()) return [];
    const root = this.getRoot(doc);
    if (!root) return [];
    return collectLensTargets(root, doc.getText(), { maxDepth: this.getMaxDepth() }).map((t) => {
      const range = new vscode.Range(t.startLine, 0, t.startLine, 0);
      const lens = new vscode.CodeLens(range, {
        command: 'jsonExplorer.foldBlock',
        title: lensTitle(t),
        tooltip: 'Click to fold this block',
        arguments: [t.startLine],
      });
      return lens;
    });
  }
}
