import * as vscode from 'vscode';
import { Node as JsonCNode } from 'jsonc-parser';
import { findNodeAtOffset } from '../parser/JsonParser';
import {
  getNodePathSegments,
  jsonPathStringToPath,
  pathToJsonPathString,
  pathToPointer,
  pointerToPath,
  resolvePath,
} from '../parser/JsonPosition';

export async function copyPath(doc: vscode.TextDocument, root: JsonCNode | undefined, pos: vscode.Position): Promise<void> {
  const node = root ? findNodeAtOffset(root, doc.offsetAt(pos)) : undefined;
  const path = getNodePathSegments(node);
  await vscode.env.clipboard.writeText(pathToJsonPathString(path));
  vscode.window.showInformationMessage(`Copied ${pathToJsonPathString(path)}`);
}

export async function copyPointer(doc: vscode.TextDocument, root: JsonCNode | undefined, pos: vscode.Position): Promise<void> {
  const node = root ? findNodeAtOffset(root, doc.offsetAt(pos)) : undefined;
  const path = getNodePathSegments(node);
  const pointer = pathToPointer(path) || '/';
  await vscode.env.clipboard.writeText(pointer);
  vscode.window.showInformationMessage(`Copied ${pointer}`);
}

export async function goToPath(doc: vscode.TextDocument, root: JsonCNode | undefined): Promise<void> {
  const input = await vscode.window.showInputBox({
    prompt: 'Go to JSONPath ($.users[0].name) or JSON Pointer (/users/0/name)',
    placeHolder: '$.users[0].name',
  });
  if (!input) return;
  let node: JsonCNode | undefined;
  try {
    const trimmed = input.trim();
    node = trimmed.startsWith('/')
      ? resolvePath(root, pointerToPath(trimmed))
      : resolvePath(root, jsonPathStringToPath(trimmed));
  } catch (e) {
    vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
    return;
  }
  if (!node) {
    vscode.window.showWarningMessage(`No node found at ${input}`);
    return;
  }
  const editor = await vscode.window.showTextDocument(doc, { preview: false });
  const range = new vscode.Range(doc.positionAt(node.offset), doc.positionAt(node.offset + node.length));
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  editor.selection = new vscode.Selection(range.start, range.start);
}
