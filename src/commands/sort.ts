import * as vscode from 'vscode';

function sortValue(value: unknown, recursive: boolean): unknown {
  if (Array.isArray(value)) {
    // Never sort arrays — only recurse into items when requested.
    return recursive ? value.map((v) => sortValue(v, true)) : value;
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      out[k] = recursive ? sortValue(obj[k], true) : obj[k];
    }
    return out;
  }
  return value;
}

function indentFor(doc: vscode.TextDocument): string {
  const cfg = vscode.workspace.getConfiguration('editor', doc.uri);
  const insertSpaces = cfg.get<boolean>('insertSpaces', true);
  const tabSize = cfg.get<number>('tabSize', 2);
  return insertSpaces ? ' '.repeat(tabSize) : '\t';
}

async function rewrite(
  editor: vscode.TextEditor,
  range: vscode.Range,
  value: unknown,
): Promise<void> {
  const text = JSON.stringify(value, null, indentFor(editor.document));
  await editor.edit((b) => b.replace(range, text));
}

function parseLenient(text: string): { value: unknown; error?: string } {
  try {
    return { value: JSON.parse(text) };
  } catch (e) {
    return { value: undefined, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sortKeys(recursive: boolean): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  if (editor.document.languageId === 'jsonc') {
    vscode.window.showWarningMessage('Sort is disabled for JSONC to preserve comments.');
    return;
  }
  const parsed = parseLenient(editor.document.getText());
  if (parsed.error || parsed.value === undefined) {
    vscode.window.showErrorMessage(`Cannot sort: invalid JSON (${parsed.error})`);
    return;
  }
  const full = new vscode.Range(
    editor.document.positionAt(0),
    editor.document.positionAt(editor.document.getText().length),
  );
  await rewrite(editor, full, sortValue(parsed.value, recursive));
}

export async function sortSelectedObject(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    vscode.window.showInformationMessage('Select a JSON object first.');
    return;
  }
  const text = editor.document.getText(editor.selection);
  const parsed = parseLenient(text);
  if (parsed.error || parsed.value === undefined) {
    vscode.window.showErrorMessage(`Cannot sort selection: invalid JSON (${parsed.error})`);
    return;
  }
  if (parsed.value === null || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
    vscode.window.showWarningMessage('Selection is not a JSON object.');
    return;
  }
  await rewrite(editor, editor.selection, sortValue(parsed.value, false));
}
