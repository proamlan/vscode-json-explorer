import * as vscode from 'vscode';
import { getNodePathSegments, formatBreadcrumb, pathToJsonPathString } from '../parser/JsonPosition';
import { findNodeAtOffset, getNodeValue } from '../parser/JsonParser';
import { childCount } from '../parser/JsonNode';
import { Node as JsonCNode } from 'jsonc-parser';
import { describeCount, formatBytes } from '../utils/debounce';

/**
 * Status-bar breadcrumb: `root › users › 42 › profile`.
 * Clicking it opens a QuickPick of ancestor segments for navigation.
 */
export class BreadcrumbProvider implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private root: JsonCNode | undefined;
  private doc: vscode.TextDocument | undefined;

  constructor(
    private onNavigate: (node: JsonCNode) => void,
    private isEnabled: () => boolean,
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 5);
    this.item.command = 'jsonExplorer.goToPath';
    this.item.tooltip = 'JSON path — click to go to a path';
  }

  update(doc: vscode.TextDocument | undefined, root: JsonCNode | undefined, offset: number): void {
    this.doc = doc;
    this.root = root;
    if (!this.isEnabled() || !doc || !root) {
      this.item.hide();
      return;
    }
    const node = findNodeAtOffset(root, offset);
    const path = getNodePathSegments(node);
    this.item.text = `$(breadcrumb) ${formatBreadcrumb(path)}`;
    this.item.tooltip = this.tooltipFor(node);
    this.item.show();
  }

  private tooltipFor(node: JsonCNode | undefined): string {
    const head = 'JSON path — click to go to a node, right-click for more actions';
    if (!node) return head;
    const target = node.type === 'property' ? (node.children?.[1] ?? node) : node;
    const jp = pathToJsonPathString(getNodePathSegments(target));
    if (target.type === 'object') {
      return `${head}\n${jp} — ${describeCount(childCount(target), 'property', 'properties')}, ${formatBytes(target.length)}`;
    }
    if (target.type === 'array') {
      return `${head}\n${jp} — ${describeCount(childCount(target), 'item', 'items')}`;
    }
    const v = getNodeValue(target);
    const preview = typeof v === 'string' ? `"${v.length > 40 ? v.slice(0, 37) + '…' : v}"` : String(v);
    return `${head}\n${jp} = ${preview}`;
  }

  async pickAncestor(): Promise<void> {
    // Used by goToPath: quick pick ancestors + free input happens in command.
    if (!this.root || !this.doc) return;
  }

  dispose(): void {
    this.item.dispose();
  }
}
