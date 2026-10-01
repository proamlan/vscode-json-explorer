import * as vscode from 'vscode';
import { Node as JsonCNode } from 'jsonc-parser';

const MAX_OUTLINE_ARRAY_ITEMS = 50;
const MAX_OUTLINE_DEPTH = 12;

/** DocumentSymbolProvider with truncation for huge arrays. */
export class JsonOutlineProvider implements vscode.DocumentSymbolProvider {
  constructor(private getRoot: (doc: vscode.TextDocument) => JsonCNode | undefined) {}

  provideDocumentSymbols(doc: vscode.TextDocument): vscode.DocumentSymbol[] {
    const root = this.getRoot(doc);
    if (!root) return [];
    const symbols: vscode.DocumentSymbol[] = [];
    if (root.type === 'object') {
      for (const prop of root.children ?? []) {
        const s = this.propertySymbol(doc, prop, 0);
        if (s) symbols.push(s);
      }
    } else if (root.type === 'array') {
      const items = root.children ?? [];
      const shown = items.slice(0, MAX_OUTLINE_ARRAY_ITEMS);
      shown.forEach((child, i) => {
        symbols.push(this.valueSymbol(doc, String(i), child, 0));
      });
      if (items.length > shown.length) {
        const r = rangeOf(doc, root);
        symbols.push(
          new vscode.DocumentSymbol(
            `… ${items.length - shown.length} more`,
            'truncated',
            vscode.SymbolKind.Array,
            r,
            r,
          ),
        );
      }
    } else {
      symbols.push(this.valueSymbol(doc, 'value', root, 0));
    }
    return symbols;
  }

  private propertySymbol(
    doc: vscode.TextDocument,
    prop: JsonCNode,
    depth: number,
  ): vscode.DocumentSymbol | undefined {
    if (prop.type !== 'property' || !prop.children || prop.children.length < 2) return undefined;
    const keyNode = prop.children[0];
    const valNode = prop.children[1];
    const name = String(keyNode.value);
    return this.valueSymbol(doc, name, valNode, depth, rangeOf(doc, prop));
  }

  private valueSymbol(
    doc: vscode.TextDocument,
    name: string,
    node: JsonCNode,
    depth: number,
    propRange?: vscode.Range,
  ): vscode.DocumentSymbol {
    const range = rangeOf(doc, node);
    const selection = propRange ? rangeOf(doc, node) : range;
    const kind =
      node.type === 'object'
        ? vscode.SymbolKind.Object
        : node.type === 'array'
          ? vscode.SymbolKind.Array
          : node.type === 'string'
            ? vscode.SymbolKind.String
            : node.type === 'number'
              ? vscode.SymbolKind.Number
              : node.type === 'boolean'
                ? vscode.SymbolKind.Boolean
                : vscode.SymbolKind.Null;
    const sym = new vscode.DocumentSymbol(name, kindName(node), kind, propRange ?? range, selection);
    if (depth < MAX_OUTLINE_DEPTH) {
      if (node.type === 'object') {
        for (const prop of node.children ?? []) {
          const child = this.propertySymbol(doc, prop, depth + 1);
          if (child) sym.children.push(child);
        }
      } else if (node.type === 'array') {
        const items = node.children ?? [];
        items.slice(0, MAX_OUTLINE_ARRAY_ITEMS).forEach((child, i) => {
          sym.children.push(this.valueSymbol(doc, String(i), child, depth + 1));
        });
        if (items.length > MAX_OUTLINE_ARRAY_ITEMS) {
          sym.children.push(
            new vscode.DocumentSymbol(
              `… ${items.length - MAX_OUTLINE_ARRAY_ITEMS} more`,
              'truncated',
              vscode.SymbolKind.Array,
              range,
              range,
            ),
          );
        }
      }
    }
    void doc;
    return sym;
  }
}

function rangeOf(doc: vscode.TextDocument, node: JsonCNode): vscode.Range {
  return new vscode.Range(doc.positionAt(node.offset), doc.positionAt(node.offset + node.length));
}

function kindName(node: JsonCNode): string {
  if (node.type === 'object') return `object {${node.children?.length ?? 0}}`;
  if (node.type === 'array') return `array [${node.children?.length ?? 0}]`;
  return node.type;
}
