import * as vscode from 'vscode';
import { Node as JsonCNode } from 'jsonc-parser';
import { findNodeAtOffset } from '../parser/JsonParser';

function nodeToRange(doc: vscode.TextDocument, node: JsonCNode): vscode.Range {
  return new vscode.Range(doc.positionAt(node.offset), doc.positionAt(node.offset + node.length));
}

/** Map editor positions/offsets to parse-tree nodes and ranges. */
export class PositionResolver {
  constructor(private getRoot: (doc: vscode.TextDocument) => JsonCNode | undefined) {}

  nodeAtPosition(doc: vscode.TextDocument, pos: vscode.Position): JsonCNode | undefined {
    const root = this.getRoot(doc);
    if (!root) return undefined;
    return findNodeAtOffset(root, doc.offsetAt(pos));
  }

  async revealNode(
    editor: vscode.TextEditor,
    node: JsonCNode,
    preserveSelection = false,
  ): Promise<void> {
    const range = nodeToRange(editor.document, node);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    if (!preserveSelection) {
      editor.selection = new vscode.Selection(range.start, range.start);
    }
  }

  rangeOf(doc: vscode.TextDocument, node: JsonCNode): vscode.Range {
    return nodeToRange(doc, node);
  }
}
