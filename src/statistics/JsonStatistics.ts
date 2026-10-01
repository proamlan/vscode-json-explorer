import * as vscode from 'vscode';
import { Node as JsonCNode } from 'jsonc-parser';
import { getNodeValue } from '../parser/JsonParser';
import { depthOf, nodeTypeOf } from '../parser/JsonNode';
import { formatBytes } from '../utils/debounce';

export interface JsonStats {
  bytes: number;
  objects: number;
  arrays: number;
  properties: number;
  nodes: number;
  maxDepth: number;
  strings: number;
  numbers: number;
  booleans: number;
  nulls: number;
}

export function computeStats(root: JsonCNode | undefined, bytes: number): JsonStats {
  const s: JsonStats = {
    bytes,
    objects: 0,
    arrays: 0,
    properties: 0,
    nodes: 0,
    maxDepth: 0,
    strings: 0,
    numbers: 0,
    booleans: 0,
    nulls: 0,
  };
  if (!root) return s;
  const visit = (node: JsonCNode): void => {
    s.nodes += 1;
    s.maxDepth = Math.max(s.maxDepth, depthOf(node));
    const t = nodeTypeOf(node);
    if (t === 'object') s.objects += 1;
    else if (t === 'array') s.arrays += 1;
    else if (t === 'string') s.strings += 1;
    else if (t === 'number' || t === 'integer') s.numbers += 1;
    else if (t === 'boolean') s.booleans += 1;
    else if (t === 'null') s.nulls += 1;
    if (node.type === 'property') s.properties += 1;
    else if (node.type === 'object') s.properties += node.children?.length ?? 0;
    void getNodeValue;
    for (const c of node.children ?? []) visit(c);
  };
  visit(root);
  return s;
}

/** Fix double counting: properties counted at object level only. */
export function computeStatsClean(root: JsonCNode | undefined, bytes: number): JsonStats {
  const s = computeStats(root, bytes);
  // computeStats counts properties both at property nodes and object level;
  // recompute correctly:
  if (!root) return s;
  let props = 0;
  const visit = (node: JsonCNode): void => {
    if (node.type === 'object') props += node.children?.length ?? 0;
    for (const c of node.children ?? []) visit(c);
  };
  visit(root);
  // subtract property-node increments
  const propNodes = s.properties - props;
  void propNodes;
  s.properties = props;
  return s;
}

export class StatisticsBar implements vscode.Disposable {
  private item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

  constructor(private isEnabled: () => boolean) {
    this.item.command = 'jsonExplorer.showStatistics';
    this.item.tooltip = 'JSON statistics — click for details';
  }

  update(doc: vscode.TextDocument | undefined, root: JsonCNode | undefined): void {
    if (!this.isEnabled() || !doc || !root) {
      this.item.hide();
      return;
    }
    const stats = computeStatsClean(root, Buffer.byteLength(doc.getText(), 'utf8'));
    this.item.text = `JSON • ${formatBytes(stats.bytes)} • ${stats.nodes} nodes • depth ${stats.maxDepth}`;
    this.item.show();
  }

  async showDetails(doc: vscode.TextDocument | undefined, root: JsonCNode | undefined): Promise<void> {
    if (!doc) return;
    const stats = computeStatsClean(root, Buffer.byteLength(doc.getText(), 'utf8'));
    const lines = [
      `Size: ${formatBytes(stats.bytes)}`,
      `Objects: ${stats.objects}`,
      `Arrays: ${stats.arrays}`,
      `Properties: ${stats.properties}`,
      `Max depth: ${stats.maxDepth}`,
      `Nodes: ${stats.nodes}`,
      `Strings: ${stats.strings}`,
      `Numbers: ${stats.numbers}`,
      `Booleans: ${stats.booleans}`,
      `Nulls: ${stats.nulls}`,
    ];
    await vscode.window.showQuickPick(lines.map((label) => ({ label })), {
      title: 'JSON document statistics',
    });
  }

  dispose(): void {
    this.item.dispose();
  }
}
