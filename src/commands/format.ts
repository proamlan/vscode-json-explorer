import * as vscode from 'vscode';
import { Node as JsonCNode } from 'jsonc-parser';
import { findNodeAtOffset } from '../parser/JsonParser';

function indentFor(doc: vscode.TextDocument): string {
  const cfg = vscode.workspace.getConfiguration('editor', doc.uri);
  const insertSpaces = cfg.get<boolean>('insertSpaces', true);
  const tabSize = cfg.get<number>('tabSize', 2);
  return insertSpaces ? ' '.repeat(tabSize) : '\t';
}

function ensureTrailingNewline(text: string, doc: vscode.TextDocument): string {
  const eolSetting = vscode.workspace.getConfiguration('files', doc.uri).get<string>('insertFinalNewline', 'auto');
  void eolSetting;
  return text;
}

function parseLenient(text: string): { value: unknown; error?: string } {
  try {
    return { value: JSON.parse(text) };
  } catch (e) {
    return { value: undefined, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function formatDocument(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const doc = editor.document;
  if (doc.languageId !== 'json' && doc.languageId !== 'jsonc') return;
  // Never silently destroy JSONC comments: refuse document-wide re-serialization for jsonc.
  if (doc.languageId === 'jsonc') {
    vscode.window.showWarningMessage('Format is limited for JSONC to preserve comments. Use Format Selection on a pure-JSON range.');
    return;
  }
  const parsed = parseLenient(doc.getText());
  if (parsed.error || parsed.value === undefined) {
    vscode.window.showErrorMessage(`Cannot format: invalid JSON (${parsed.error})`);
    return;
  }
  const indent = indentFor(doc);
  // JSON.stringify with a string indent honors spaces; tabs pass through.
  const formatted = JSON.stringify(parsed.value, null, indent) + '\n';
  void ensureTrailingNewline;
  const full = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
  await editor.edit((b) => b.replace(full, formatted));
}

export async function formatSelection(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    vscode.window.showInformationMessage('Select a JSON range first.');
    return;
  }
  const text = editor.document.getText(editor.selection);
  const parsed = parseLenient(text);
  if (parsed.error || parsed.value === undefined) {
    vscode.window.showErrorMessage(`Cannot format selection: invalid JSON (${parsed.error})`);
    return;
  }
  const formatted = JSON.stringify(parsed.value, null, indentFor(editor.document));
  await editor.edit((b) => b.replace(editor.selection, formatted));
}

export async function minifyDocument(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  if (editor.document.languageId === 'jsonc') {
    vscode.window.showWarningMessage('Minify is disabled for JSONC to preserve comments.');
    return;
  }
  const parsed = parseLenient(editor.document.getText());
  if (parsed.error || parsed.value === undefined) {
    vscode.window.showErrorMessage(`Cannot minify: invalid JSON (${parsed.error})`);
    return;
  }
  const full = new vscode.Range(
    editor.document.positionAt(0),
    editor.document.positionAt(editor.document.getText().length),
  );
  await editor.edit((b) => b.replace(full, JSON.stringify(parsed.value)));
}

export async function minifySelection(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    vscode.window.showInformationMessage('Select a JSON range first.');
    return;
  }
  const text = editor.document.getText(editor.selection);
  const parsed = parseLenient(text);
  if (parsed.error || parsed.value === undefined) {
    vscode.window.showErrorMessage(`Cannot minify selection: invalid JSON (${parsed.error})`);
    return;
  }
  await editor.edit((b) => b.replace(editor.selection, JSON.stringify(parsed.value)));
}

export function nodeAtCursor(
  doc: vscode.TextDocument,
  root: JsonCNode | undefined,
  pos: vscode.Position,
): JsonCNode | undefined {
  if (!root) return undefined;
  return findNodeAtOffset(root, doc.offsetAt(pos));
}
