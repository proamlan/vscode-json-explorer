import * as vscode from 'vscode';
import { Node as JsonCNode } from 'jsonc-parser';
import { getNodeValue } from '../parser/JsonParser';
import { getNodePathSegments, pathToJsonPathString } from '../parser/JsonPosition';
import { childCount, nodeTypeOf } from '../parser/JsonNode';
import { describeCount } from '../utils/debounce';

export interface ExplorerNode {
  kind: 'root' | 'property' | 'index' | 'more';
  key?: string;
  index?: number;
  node: JsonCNode | undefined;
  parentEntry?: ExplorerNode;
}

function labelFor(entry: ExplorerNode): string {
  if (entry.kind === 'more') return 'Show more…';
  const node = entry.node;
  if (!node) return entry.key ?? 'node';
  const t = nodeTypeOf(node);
  const name = entry.kind === 'root' ? 'root' : (entry.key ?? String(entry.index ?? ''));
  if (t === 'object') {
    const n = childCount(node);
    return `${name}  {${n}}`;
  }
  if (t === 'array') {
    const n = childCount(node);
    return `${name}  [${n}]`;
  }
  const v = getNodeValue(node);
  const preview = previewValue(v);
  return `${name}: ${preview}`;
}

function previewValue(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'string') {
    const s = v.length > 40 ? v.slice(0, 37) + '…' : v;
    return `"${s}"`;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return String(v ?? '');
}

function descriptionFor(node: JsonCNode | undefined): string {
  if (!node) return '';
  const t = nodeTypeOf(node);
  if (t === 'object') return describeCount(childCount(node), 'property', 'properties');
  if (t === 'array') return describeCount(childCount(node), 'item', 'items');
  return `${t}`;
}

export class JsonTreeItem extends vscode.TreeItem {
  constructor(
    public entry: ExplorerNode,
    collapsible: vscode.TreeItemCollapsibleState,
    label: string,
  ) {
    super(label, collapsible);
    const node = entry.node;
    if (entry.kind === 'more') {
      this.iconPath = new vscode.ThemeIcon('add');
      // Clicking loads the next page of the parent container (see showMore).
      this.command = {
        command: 'jsonExplorer.showMore',
        title: 'Show more',
        arguments: [entry.parentEntry?.node?.offset],
      };
    } else if (node && (node.type === 'object' || node.type === 'array')) {
      this.iconPath = new vscode.ThemeIcon(node.type === 'array' ? 'list-ordered' : 'symbol-object');
      this.contextValue = 'jsonContainer';
    } else {
      const t = node ? nodeTypeOf(node) : 'string';
      const icon =
        t === 'string'
          ? 'symbol-string'
          : t === 'number' || t === 'integer'
            ? 'symbol-number'
            : t === 'boolean'
              ? 'symbol-boolean'
              : t === 'null'
                ? 'symbol-null'
                : 'symbol-property';
      this.iconPath = new vscode.ThemeIcon(icon);
      this.contextValue = 'jsonValue';
    }
    if (entry.kind !== 'more' && node) {
      this.description = descriptionFor(node);
      this.tooltip = pathToJsonPathString(getNodePathSegments(node));
    }
    // Clicking navigates to the node in the editor.
    if (entry.kind !== 'more') {
      this.command = {
        command: 'jsonExplorer.revealNode',
        title: 'Reveal in editor',
        arguments: [entry],
      };
    }
  }
}

export class JsonTreeProvider implements vscode.TreeDataProvider<ExplorerNode> {
  private _onDidChange = new vscode.EventEmitter<ExplorerNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private root: JsonCNode | undefined;
  private doc: vscode.TextDocument | undefined;
  /** Container node offset -> number of extra pages loaded via "Show more…". */
  private extraPages = new Map<number, number>();

  constructor(private getPageSize: () => number) {}

  setDocument(doc: vscode.TextDocument | undefined, root: JsonCNode | undefined): void {
    this.doc = doc;
    this.root = root;
    this.extraPages.clear();
    this.refresh();
  }

  /** Load the next page of a container, then refresh the view. */
  showMore(containerOffset: number): void {
    this.extraPages.set(containerOffset, (this.extraPages.get(containerOffset) ?? 0) + 1);
    this.refresh();
  }

  refresh(): void {
    this._onDidChange.fire();
  }

  getTreeItem(element: ExplorerNode): vscode.TreeItem {
    if (element.kind === 'more') {
      return new JsonTreeItem(element, vscode.TreeItemCollapsibleState.None, 'Show more…');
    }
    const node = element.node;
    const collapsible =
      node && (node.type === 'object' || node.type === 'array') && (node.children?.length ?? 0) > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;
    return new JsonTreeItem(element, collapsible, labelFor(element));
  }

  async getChildren(element?: ExplorerNode): Promise<ExplorerNode[]> {
    const pageSize = Math.max(10, this.getPageSize());
    if (!this.root) return [];
    if (!element) {
      if (this.root.type === 'object' || this.root.type === 'array') {
        return this.pagedChildren({ kind: 'root', node: this.root }, this.root, pageSize);
      }
      return [{ kind: 'root', node: this.root }];
    }
    if (element.kind === 'more') {
      // Leaf node with a command; it has no children of its own.
      return [];
    }
    const node = element.node;
    if (!node || !node.children || node.children.length === 0) return [];
    return this.pagedChildren(element, node, pageSize);
  }

  getParent(element: ExplorerNode): ExplorerNode | undefined {
    return element.parentEntry;
  }

  private pagedChildren(
    parentEntry: ExplorerNode,
    node: JsonCNode,
    pageSize: number,
  ): ExplorerNode[] {
    // Number of items currently visible for this container (grows via showMore).
    const visible = ((this.extraPages.get(node.offset) ?? 0) + 1) * pageSize;
    const out: ExplorerNode[] = [];
    if (node.type === 'object') {
      const props = node.children ?? [];
      for (const prop of props.slice(0, visible)) {
        // property node: children [key, value]
        const keyNode = prop.children?.[0];
        const valNode = prop.children?.[1];
        const key = keyNode?.value as string;
        out.push({ kind: 'property', key, node: valNode, parentEntry });
      }
      if (props.length > visible) {
        out.push({ kind: 'more', node: undefined, parentEntry });
      }
      return out;
    }
    if (node.type === 'array') {
      const items = node.children ?? [];
      items.slice(0, visible).forEach((child, i) => {
        out.push({ kind: 'index', index: i, key: String(i), node: child, parentEntry });
      });
      if (items.length > visible) {
        out.push({ kind: 'more', node: undefined, parentEntry });
      }
      return out;
    }
    return [];
  }
}
