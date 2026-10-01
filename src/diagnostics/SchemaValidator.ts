import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';
import Ajv, { ErrorObject } from 'ajv';
import { getNodeValue } from '../parser/JsonParser';
import { Node as JsonCNode } from 'jsonc-parser';
import { SchemaIssue } from '../diagnostics/JsonDiagnostics';

/** Resolve the $schema reference (local files only) relative to the document. */
export async function resolveSchema(
  doc: vscode.TextDocument,
  root: JsonCNode | undefined,
): Promise<{ schema: unknown; uri: vscode.Uri } | undefined> {
  if (!root || root.type !== 'object') return undefined;
  const schemaPath = ['$schema'] as (string | number)[];
  const node = jsonc.findNodeAtLocation(root, schemaPath);
  if (!node) return undefined;
  const raw = String(getNodeValue(node) ?? '');
  if (!raw) return undefined;
  if (/^https?:\/\//i.test(raw)) return undefined; // offline: skip remote schemas
  try {
    const base = vscode.Uri.joinPath(vscode.Uri.file(doc.uri.fsPath), '..');
    const uri = vscode.Uri.joinPath(base, raw);
    // Avoid directory traversal surprises: still allow but normalize.
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(bytes).toString('utf8');
    return { schema: JSON.parse(text), uri };
  } catch {
    return undefined;
  }
}

function ajvErrorToOffset(
  root: JsonCNode | undefined,
  err: ErrorObject,
): { offset: number; length: number } {
  // Map instancePath (JSON pointer) to a node range; fall back to root.
  const pointer = err.instancePath || '';
  let node = root;
  if (pointer && root) {
    const parts = pointer
      .split('/')
      .slice(1)
      .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
      .map((s) => (/^(0|[1-9][0-9]*)$/.test(s) ? Number(s) : s));
    node = jsonc.findNodeAtLocation(root, parts as (string | number)[]) ?? root;
    // For missing required props, highlight the parent object.
    if (err.keyword === 'required' && node) {
      // node already is the parent
    } else if (err.keyword === 'additionalProperties' && node) {
      // node is parent; try to highlight offending prop handled by message
    }
  }
  if (!node) return { offset: 0, length: 1 };
  return { offset: node.offset, length: Math.max(1, node.length) };
}

export async function validateAgainstSchema(
  root: JsonCNode | undefined,
  text: string,
  schema: unknown,
): Promise<SchemaIssue[]> {
  const ajv = new Ajv({ allErrors: true, strict: false });
  let value: unknown;
  try {
    value = jsonc.parse(text);
  } catch {
    return [];
  }
  const validate = ajv.compile(schema as Parameters<Ajv['compile']>[0]);
  const ok = validate(value);
  if (ok) return [];
  const issues: SchemaIssue[] = [];
  for (const e of validate.errors ?? []) {
    let message = `Schema: ${e.message ?? e.keyword}`;
    if (e.keyword === 'required' && e.params && typeof e.params === 'object') {
      const missing = (e.params as { missingProperty?: string }).missingProperty;
      if (missing) message = `Missing required property "${missing}"`;
    } else if (e.keyword === 'type' && e.params) {
      message = `Must be ${(e.params as { type?: string }).type ?? 'of the schema type'}${e.instancePath ? ` (${e.instancePath})` : ''}`;
    } else if (e.instancePath) {
      message = `${e.instancePath || 'value'} ${e.message ?? ''}`.trim();
      if (message && !message.startsWith('Property')) message = `Property "${e.instancePath}" ${e.message ?? ''}`.trim();
    }
    const { offset, length } = ajvErrorToOffset(root, e);
    issues.push({ message, offset, length });
  }
  return issues;
}
