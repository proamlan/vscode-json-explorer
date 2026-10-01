export const window = {
  createStatusBarItem: () => ({ show: () => {}, hide: () => {}, dispose: () => {} }),
  showQuickPick: async () => undefined,
  showInputBox: async () => undefined,
  showInformationMessage: () => {},
  showWarningMessage: () => {},
  showErrorMessage: () => {},
  activeTextEditor: undefined,
  visibleTextEditors: [],
};
export const workspace = {
  getConfiguration: () => ({ get: (_k: string, d: unknown) => d }),
  openTextDocument: async () => undefined,
  fs: { readFile: async () => new Uint8Array() },
  onDidChangeTextDocument: () => ({ dispose: () => {} }),
  onDidOpenTextDocument: () => ({ dispose: () => {} }),
  onDidCloseTextDocument: () => ({ dispose: () => {} }),
  onDidChangeConfiguration: () => ({ dispose: () => {} }),
};
export const languages = {
  createDiagnosticCollection: () => ({ set: () => {}, delete: () => {}, dispose: () => {} }),
  registerHoverProvider: () => ({ dispose: () => {} }),
  registerCodeActionsProvider: () => ({ dispose: () => {} }),
  registerDocumentSymbolProvider: () => ({ dispose: () => {} }),
};
export const commands = { registerCommand: () => ({ dispose: () => {} }), executeCommand: async () => {} };
export const env = { clipboard: { writeText: async () => {} } };
export class Range {
  constructor(
    public start: unknown,
    public end: unknown,
  ) {}
}
export class Selection {
  constructor(
    public anchor: unknown,
    public active: unknown,
  ) {}
}
export class TreeItem {}
export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };
export class ThemeIcon {
  constructor(public id: string) {}
}
export const StatusBarAlignment = { Left: 1, Right: 2 };
export const TextEditorRevealType = { InCenter: 0, InCenterIfOutsideViewport: 1 };
export const DiagnosticSeverity = { Error: 0, Warning: 1 };
export class Diagnostic {
  constructor(
    public range: unknown,
    public message: string,
    public severity: unknown,
  ) {}
}
export class MarkdownString {
  value = '';
  isTrusted = false;
  constructor(value = '') {
    this.value = value;
  }
  appendMarkdown(v = '') {
    this.value += v;
    return this;
  }
}
export const SymbolKind = { Object: 1, Array: 2, String: 3, Number: 4, Boolean: 5, Null: 6, String2: 3 };
export class DocumentSymbol {
  children: DocumentSymbol[] = [];
  constructor(
    public name: string,
    public detail: string,
    public kind: unknown,
    public range: unknown,
    public selectionRange: unknown,
  ) {}
}
export const CodeActionKind = { QuickFix: 'quickfix' };
export class CodeAction {
  diagnostics: unknown[] | undefined;
  edit: unknown | undefined;
  command: unknown | undefined;
  constructor(
    public title: string,
    public kind: unknown,
  ) {}
}
export class WorkspaceEdit {
  delete() {}
}
export const Uri = {
  file: (p: string) => ({ fsPath: p, toString: () => p }),
  joinPath: (...parts: { fsPath: string }[]) => ({ fsPath: parts.map((p) => p.fsPath).join('/') }),
};
export const EventEmitter = class {
  event = undefined;
  fire() {}
};
