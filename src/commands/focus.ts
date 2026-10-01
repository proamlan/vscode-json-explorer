import * as vscode from 'vscode';
import { Node as JsonCNode } from 'jsonc-parser';
import { findNodeAtOffset, getNodeValue } from '../parser/JsonParser';
import { formatBreadcrumb, getNodePathSegments } from '../parser/JsonPosition';

/** Focus Mode: show a subtree in a temporary read-only-ish editor without touching the source. */
export class FocusMode {
  private returnTarget:
    | { uri: vscode.Uri; selection: vscode.Selection; viewColumn?: vscode.ViewColumn }
    | undefined;

  async focus(doc: vscode.TextDocument, root: JsonCNode | undefined, pos: vscode.Position): Promise<void> {
    const node = root ? findNodeAtOffset(root, doc.offsetAt(pos)) : undefined;
    if (!node) {
      vscode.window.showInformationMessage('No JSON node at cursor.');
      return;
    }
    // Prefer container nodes: if cursor is on a leaf, focus its parent container.
    let target = node.type === 'property' ? (node.children?.[1] ?? node) : node;
    if (target.type !== 'object' && target.type !== 'array' && target.parent) {
      const maybeParent = target.parent.type === 'property' ? target.parent.parent : target.parent;
      if (maybeParent && (maybeParent.type === 'object' || maybeParent.type === 'array')) {
        const pick = await vscode.window.showQuickPick(
          [
            { label: 'Focus on this value', value: target },
            { label: 'Focus on parent container', value: maybeParent },
          ],
          { title: 'Focus on node' },
        );
        if (!pick) return;
        target = pick.value as JsonCNode;
      }
    }
    const value = getNodeValue(target);
    const path = getNodePathSegments(target);
    const breadcrumb = formatBreadcrumb(path);
    const text = JSON.stringify(value, null, 2);
    this.returnTarget = {
      uri: doc.uri,
      selection: vscode.window.activeTextEditor?.selection ?? new vscode.Selection(pos, pos),
      viewColumn: vscode.window.activeTextEditor?.viewColumn,
    };
    const focusDoc = await vscode.workspace.openTextDocument({
      language: 'json',
      content: `// Focus: ${breadcrumb}\n// Source: ${doc.uri.fsPath}\n// Use "JSON: Return to Document" to go back.\n${text}\n`,
    });
    await vscode.window.showTextDocument(focusDoc, { preview: false });
    vscode.window.showInformationMessage(`Focused on ${breadcrumb}. Use JSON: Return to Document to go back.`);
  }

  async returnToDocument(): Promise<void> {
    if (!this.returnTarget) {
      vscode.window.showInformationMessage('No focus session to return from.');
      return;
    }
    const { uri, selection } = this.returnTarget;
    this.returnTarget = undefined;
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, { preview: false });
      editor.selection = selection;
      editor.revealRange(
        new vscode.Range(selection.active, selection.active),
        vscode.TextEditorRevealType.InCenterIfOutsideViewport,
      );
    } catch {
      vscode.window.showWarningMessage('Original document is no longer available.');
    }
  }
}
