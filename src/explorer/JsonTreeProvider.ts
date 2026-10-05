import * as vscode from 'vscode';
import { Node as JsonCNode } from 'jsonc-parser';
import { getNodeValue } from '../parser/JsonParser';
import { getNodePathSegments, pathToJsonPathString } from '../parser/JsonPosition';
import { childCount, nodeTypeOf } from '../parser/JsonNode';
import { describeCount } from '../utils/debounce';

export interface ExplorerNode {
  kind: 'root' | 'property' | 'index' | 'more' | 'issue';
  key?: string;
  index?: number;
  node: JsonCNode | undefined;
  parentEntry?: ExplorerNode;
  /** For kind === 'issue': human-readable summary shown when JSON can't be parsed. */
  message?: string;
}

import { emptyKindOf } from '../commands/empty';

function labelFor(entry: ExplorerNode): string {
  if (entry.kind === 'more') return 'Show more…';
  if (entry.kind === 'issue') return entry.message ?? 'JSON has issues';
  const node = entry.node;
  if (!node) return entry.key ?? 'node';
  const t = nodeTypeOf(node);
  const name = entry.kind === 'root' ? 'root' : (entry.key ?? String(entry.index ?? ''));
  if (t === 'object') {
    const n = childCount(node);
    return n === 0 ? `${name}  {} (empty)` : `${name}  {${n}}`;
  }
  if (t === 'array') {
    const n = childCount(node);
    return n === 0 ? `${name}  [] (empty)` : `${name}  [${n}]`;
  }
  const v = getNodeValue(node);
  const preview = previewValue(v);
  const empty = emptyKindOf(node);
  if (empty === 'null') return `${name}: null (null)`;
  if (empty === 'empty-string') return `${name}: ${preview} (empty)`;
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
  const empty = emptyKindOf(node);
  if (empty === 'null') return 'null';
  if (empty === 'empty-string') return 'empty string';
  if (empty === 'empty-array') return 'empty array';
  if (empty === 'empty-object') return 'empty object';
  const t = nodeTypeOf(node);
  if (t === 'object') return describeCount(childCount(node), 'property', 'properties');
  if (t === 'array') return describeCount(childCount(node), 'item', 'items');
  return `${t}`;
}

export interface IssueSummary {
  errors: number;
  warnings: number;
  messages: string[];
}

/**
 * Pure, testable core: count how many diagnostics overlap [nodeStart, nodeEnd).
 * Ancestors contain their descendants' ranges, so counts naturally bubble up
 * — a broken leaf makes every parent up to root show ❌/⚠ in the side view.
 */
export function countIssuesForRange(
  nodeStart: number,
  nodeEnd: number,
  diags: readonly { start: number; end: number; severity: number; message: string }[],
  errorSeverity = 0,
  warningSeverity = 1,
): IssueSummary {
  let errors = 0;
  let warnings = 0;
  const messages: string[] = [];
  for (const d of diags) {
    // Overlap (not strict containment): parse errors on broken JSON often
    // sit just outside any parsed node range — still surface them nearby.
    if (d.start < nodeEnd && d.end > nodeStart) {
      if (d.severity === errorSeverity) errors++;
      else if (d.severity === warningSeverity) warnings++;
      else continue;
      if (messages.length < 3) messages.push(d.message);
    }
  }
  return { errors, warnings, messages };
}

/** vscode-typed wrapper: converts node offsets + Diagnostic ranges to numbers. */
export function summarizeIssuesForNode(
  doc: vscode.TextDocument,
  node: JsonCNode,
  diags: readonly vscode.Diagnostic[],
): IssueSummary {
  const nodeStart = node.offset;
  const nodeEnd = node.offset + node.length;
  const flat = diags.map((d) => {
    let start = 0;
    let end = 0;
    try {
      start = doc.offsetAt(d.range.start);
      end = doc.offsetAt(d.range.end);
    } catch {
      start = 0;
      end = 0;
    }
    return {
      start,
      end: Math.max(end, start + 1),
      severity: d.severity as unknown as number,
      message: d.message,
    };
  });
  // vscode.DiagnosticSeverity.Error === 0, Warning === 1 in both real and mock API.
  return countIssuesForRange(nodeStart, Math.max(nodeEnd, nodeStart + 1), flat, 0, 1);
}

export class JsonTreeItem extends vscode.TreeItem {
  constructor(
    public entry: ExplorerNode,
    collapsible: vscode.TreeItemCollapsibleState,
    label: string,
    issues?: IssueSummary,
  ) {
    super(label, collapsible);
    const node = entry.node;
    if (entry.kind === 'issue') {
      const hasError = /error/i.test(entry.message ?? '');
      this.iconPath = new vscode.ThemeIcon(hasError ? 'error' : 'warning');
      this.description = 'see Problems';
      this.tooltip = entry.message ?? 'JSON has issues — see Problems panel';
      this.command = {
        command: 'jsonExplorer.nextIssue',
        title: 'Go to issue',
      };
      return;
    }
    if (entry.kind === 'more') {
      this.iconPath = new vscode.ThemeIcon('add');
      // Clicking loads the next page of the parent container (see showMore).
      this.command = {
        command: 'jsonExplorer.showMore',
        title: 'Show more',
        arguments: [entry.parentEntry?.node?.offset],
      };
    } else if (issues && issues.errors > 0) {
      // Error overrides the type icon — red stands out in a long side list.
      this.iconPath = new vscode.ThemeIcon('error');
      this.contextValue = 'jsonIssue';
    } else if (issues && issues.warnings > 0) {
      this.iconPath = new vscode.ThemeIcon('warning');
      this.contextValue = 'jsonIssue';
    } else if (node && (node.type === 'object' || node.type === 'array')) {
      this.iconPath = new vscode.ThemeIcon(node.type === 'array' ? 'list-ordered' : 'symbol-object');
      this.contextValue = emptyKindOf(node) ? 'jsonEmptyContainer' : 'jsonContainer';
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
      this.contextValue = node && emptyKindOf(node) ? 'jsonEmptyValue' : 'jsonValue';
    }
    if (entry.kind !== 'more' && node) {
      const baseDescription = descriptionFor(node);
      const path = pathToJsonPathString(getNodePathSegments(node));
      const empty = emptyKindOf(node);
      let prefix = '';
      if (issues && (issues.errors > 0 || issues.warnings > 0)) {
        const parts: string[] = [];
        if (issues.errors > 0) parts.push(`❌ ${issues.errors} error${issues.errors === 1 ? '' : 's'}`);
        if (issues.warnings > 0) parts.push(`⚠ ${issues.warnings} warning${issues.warnings === 1 ? '' : 's'}`);
        prefix = parts.join(', ');
      }
      this.description = prefix ? (baseDescription ? `${prefix} • ${baseDescription}` : prefix) : baseDescription;
      let tip = empty ? `${path} — ${empty}` : path;
      if (issues && issues.messages.length > 0) {
        tip += `\n${issues.messages.join('\n')}`;
      }
      this.tooltip = tip;
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
  private diags: readonly vscode.Diagnostic[] = [];
  /** Container node offset -> number of extra pages loaded via "Show more…". */
  private extraPages = new Map<number, number>();

  constructor(private getPageSize: () => number) {}

  setDocument(doc: vscode.TextDocument | undefined, root: JsonCNode | undefined): void {
    const prevUri = this.doc?.uri.toString();
    const nextUri = doc?.uri.toString();
    this.doc = doc;
    this.root = root;
    // New document (or closed) → old diagnostics no longer apply; they arrive
    // async via setDiagnostics. Same-document edits keep stale badges briefly
    // so the side view doesn't flicker blank on every keystroke.
    if (!doc || prevUri !== nextUri) this.diags = [];
    this.extraPages.clear();
    this.refresh();
  }

  /** Called from the diagnostics pipeline so the side view can badge issues. */
  setDiagnostics(doc: vscode.TextDocument, diags: readonly vscode.Diagnostic[]): void {
    if (this.doc && doc.uri.toString() !== this.doc.uri.toString()) return;
    if (!this.doc) return;
    this.diags = diags;
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
    if (element.kind === 'issue') {
      return new JsonTreeItem(element, vscode.TreeItemCollapsibleState.None, labelFor(element));
    }
    const node = element.node;
    const collapsible =
      node && (node.type === 'object' || node.type === 'array') && (node.children?.length ?? 0) > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;
    const issues =
      node && this.doc && this.diags.length > 0
        ? summarizeIssuesForNode(this.doc, node, this.diags)
        : undefined;
    return new JsonTreeItem(element, collapsible, labelFor(element), issues);
  }

  /** Summary line for the unparsable-JSON placeholder (e.g. "❌ 2 errors, 1 warning"). */
  issueSummaryText(): string | undefined {
    if (this.diags.length === 0) return undefined;
    let errors = 0;
    let warnings = 0;
    for (const d of this.diags) {
      if ((d.severity as unknown as number) === 0) errors++;
      else if ((d.severity as unknown as number) === 1) warnings++;
    }
    const parts: string[] = [];
    if (errors > 0) parts.push(`❌ ${errors} error${errors === 1 ? '' : 's'}`);
    if (warnings > 0) parts.push(`⚠ ${warnings} warning${warnings === 1 ? '' : 's'}`);
    if (parts.length === 0) return undefined;
    return `${parts.join(', ')} — click to jump`;
  }

  async getChildren(element?: ExplorerNode): Promise<ExplorerNode[]> {
    const pageSize = Math.max(10, this.getPageSize());
    if (!this.root) {
      // Broken JSON parses to no root — previously the side view went blank
      // precisely when you needed it most. Show a single error row instead
      // so issues stay visible and clickable in the side view.
      if (!element && this.doc && this.diags.length > 0) {
        const summary = this.issueSummaryText();
        if (summary) return [{ kind: 'issue', node: undefined, message: summary }];
      }
      return [];
    }
    if (!element) {
      if (this.root.type === 'object' || this.root.type === 'array') {
        return this.pagedChildren({ kind: 'root', node: this.root }, this.root, pageSize);
      }
      return [{ kind: 'root', node: this.root }];
    }
    if (element.kind === 'more' || element.kind === 'issue') {
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
