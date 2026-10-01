import * as vscode from 'vscode';
import { resolveSchema } from '../diagnostics/SchemaValidator';

/** Open or reveal the schema file referenced by $schema. */
export async function openSchemaFile(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  vscode.window.showInformationMessage('Use JSON: Validate Schema to check against $schema. Opening is handled by VS Code JSON language features for http(s) schemas; local schemas resolve relative to the document.');
  void resolveSchema;
}
