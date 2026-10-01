import * as vscode from 'vscode';
import { Node as JsonCNode } from 'jsonc-parser';
import { JsonParserCache, nextToken } from './parser/JsonParserCache';
import { parseText } from './parser/JsonParser';
import { allowCommentsFor, isJsonDocument } from './parser/JsonPosition';
import { JsonTreeProvider } from './explorer/JsonTreeProvider';
import { TreeNodeResolver } from './explorer/TreeNodeResolver';
import { BreadcrumbProvider } from './navigation/BreadcrumbProvider';
import { PositionResolver } from './navigation/PositionResolver';
import {
  duplicatesToDiagnostics,
  parseErrorsToDiagnostics,
  schemaIssuesToDiagnostics,
} from './diagnostics/JsonDiagnostics';
import { resolveSchema, validateAgainstSchema } from './diagnostics/SchemaValidator';
import { JsonQuickFixes, deterministicRepairs } from './diagnostics/QuickFixes';
import { JsonInspector } from './inspector/JsonInspector';
import { JsonOutlineProvider } from './outline/JsonOutline';
import { runStructureSearch } from './search/JsonSearchProvider';
import { schemaForDocument } from './schema/SchemaGenerator';
import { StatisticsBar } from './statistics/JsonStatistics';
import { formatDocument, formatSelection, minifyDocument, minifySelection } from './commands/format';
import { sortKeys, sortSelectedObject } from './commands/sort';
import { copyPath, copyPointer, goToPath } from './commands/path';
import { FocusMode } from './commands/focus';
import { JsonLensProvider } from './readability/JsonLensProvider';
import { JsonClosingLabelProvider } from './readability/ClosingLabels';
import { CountBadges } from './readability/CountBadges';
import { runFindEmptyValues } from './commands/empty';
import { runRenameKey } from './commands/rename';
import {
  askLevelAndCollapse,
  collapseAll,
  collapseKind,
  expandAll,
} from './folding/JsonFolding';
import { getConfig } from './utils/debounce';

const DIAG_DELAY_MS = 300;

export function activate(context: vscode.ExtensionContext): void {
  const cache = new JsonParserCache();
  const diagnostics = vscode.languages.createDiagnosticCollection('json-explorer');
  context.subscriptions.push(diagnostics);

  const cfg = {
    enabled: (): boolean => getConfig('jsonExplorer', 'enabled', true),
    showStats: (): boolean => getConfig('jsonExplorer', 'showStatistics', true),
    showCrumbs: (): boolean => getConfig('jsonExplorer', 'showBreadcrumbs', true),
    pageSize: (): number => getConfig('jsonExplorer', 'maxArrayItems', 100),
    maxDepth: (): number => getConfig('jsonExplorer', 'maxDepth', 20),
    validateSchema: (): boolean => getConfig('jsonExplorer', 'validateSchema', true),
    showCodeLens: (): boolean => getConfig('jsonExplorer', 'showCodeLens', true),
    showClosingLabels: (): boolean => getConfig('jsonExplorer', 'showClosingLabels', true),
    closingLabelMinLines: (): number => getConfig('jsonExplorer', 'closingLabelMinLines', 8),
    showInlineCounts: (): boolean => getConfig('jsonExplorer', 'showInlineCounts', true),
  };

  function parseDoc(doc: vscode.TextDocument): { root: JsonCNode | undefined; errors: ReturnType<typeof parseText>['errors'] } {
    const key = doc.uri.toString();
    const parsed = cache.get(key, doc.getText(), doc.version, allowCommentsFor(doc.languageId));
    return { root: parsed.root, errors: parsed.errors };
  }

  const getRoot = (doc: vscode.TextDocument): JsonCNode | undefined => {
    if (!isJsonDocument(doc.languageId)) return undefined;
    return parseDoc(doc).root;
  };

  // --- Tree explorer ---
  const treeProvider = new JsonTreeProvider(cfg.pageSize);
  context.subscriptions.push(vscode.window.registerTreeDataProvider('jsonExplorerView', treeProvider));
  const resolver = new TreeNodeResolver(treeProvider, () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !isJsonDocument(editor.document.languageId)) return undefined;
    return { doc: editor.document, root: getRoot(editor.document) };
  });
  resolver.register(context);
  context.subscriptions.push(
    vscode.commands.registerCommand('jsonExplorer.showMore', (containerOffset: number) => {
      if (typeof containerOffset === 'number') treeProvider.showMore(containerOffset);
    }),
  );
  const positionResolver = new PositionResolver(getRoot);
  void positionResolver;

  // --- Status bars: breadcrumb + statistics ---
  const crumbs = new BreadcrumbProvider(() => undefined as never, cfg.showCrumbs);
  context.subscriptions.push(crumbs);
  const stats = new StatisticsBar(cfg.showStats);
  context.subscriptions.push(stats);

  const focusMode = new FocusMode();

  function refreshViews(doc?: vscode.TextDocument): void {
    const editor = vscode.window.activeTextEditor;
    const active = doc ?? editor?.document;
    if (!active || !isJsonDocument(active.languageId) || !cfg.enabled()) {
      treeProvider.setDocument(undefined, undefined);
      crumbs.update(undefined, undefined, 0);
      stats.update(undefined, undefined);
      return;
    }
    const { root } = parseDoc(active);
    treeProvider.setDocument(active, root);
    const offset = editor && editor.document === active ? active.offsetAt(editor.selection.active) : 0;
    crumbs.update(active, root, offset);
    stats.update(active, root);
  }

  // --- Diagnostics pipeline (debounced, cancellable) ---
  let diagTimer: ReturnType<typeof setTimeout> | undefined;
  async function updateDiagnostics(doc: vscode.TextDocument): Promise<void> {
    if (!isJsonDocument(doc.languageId) || !cfg.enabled()) return;
    const token = nextToken();
    cache.markPending(doc.uri.toString(), token);
    const { root, errors } = parseDoc(doc);
    if (cache.isStale(doc.uri.toString(), token)) return;
    const all = [
      ...parseErrorsToDiagnostics(doc, errors),
      ...duplicatesToDiagnostics(doc, root),
    ];
    if (cfg.validateSchema() && errors.length === 0 && root) {
      try {
        const resolved = await resolveSchema(doc, root);
        if (cache.isStale(doc.uri.toString(), token)) return;
        if (resolved) {
          const issues = await validateAgainstSchema(root, doc.getText(), resolved.schema);
          all.push(...schemaIssuesToDiagnostics(doc, root, issues));
        }
      } catch {
        // Schema failures must never break editing.
      }
    }
    diagnostics.set(doc.uri, all);
  }

  function scheduleDiagnostics(doc: vscode.TextDocument): void {
    if (diagTimer) clearTimeout(diagTimer);
    diagTimer = setTimeout(() => void updateDiagnostics(doc), DIAG_DELAY_MS);
  }

  // --- Providers ---
  const lensProvider = new JsonLensProvider(getRoot, cfg.showCodeLens, cfg.maxDepth);
  const closingLabels = new JsonClosingLabelProvider(
    getRoot,
    cfg.showClosingLabels,
    cfg.closingLabelMinLines,
    cfg.maxDepth,
  );
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      [{ language: 'json' }, { language: 'jsonc' }],
      new JsonOutlineProvider(getRoot),
    ),
    vscode.languages.registerCodeActionsProvider(
      [{ language: 'json' }, { language: 'jsonc' }],
      new JsonQuickFixes(getRoot),
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    ),
    vscode.languages.registerCodeLensProvider([{ language: 'json' }, { language: 'jsonc' }], lensProvider),
    vscode.languages.registerInlayHintsProvider(
      [{ language: 'json' }, { language: 'jsonc' }],
      closingLabels,
    ),
  );
  new JsonInspector(getRoot).register(context);

  // --- Inline count badges (editor decorations) ---
  const badges = new CountBadges(getRoot, cfg.showInlineCounts, cfg.maxDepth);
  context.subscriptions.push(badges);
  const refreshBadges = (): void => badges.update(vscode.window.visibleTextEditors);

  // --- Events ---
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      refreshViews(editor?.document);
      refreshBadges();
      if (editor && isJsonDocument(editor.document.languageId)) scheduleDiagnostics(editor.document);
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (!isJsonDocument(e.document.languageId)) return;
      refreshViews(e.document);
      refreshBadges();
      scheduleDiagnostics(e.document);
    }),
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (isJsonDocument(doc.languageId)) {
        refreshViews(doc);
        scheduleDiagnostics(doc);
      }
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      cache.invalidate(doc.uri.toString());
      diagnostics.delete(doc.uri);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('jsonExplorer')) {
        refreshViews();
        lensProvider.refresh();
        closingLabels.refresh();
        refreshBadges();
        const ed = vscode.window.activeTextEditor;
        if (ed && isJsonDocument(ed.document.languageId)) scheduleDiagnostics(ed.document);
      }
    }),
  );

  // --- Commands ---
  const activeRoot = (): { doc: vscode.TextDocument; root: JsonCNode | undefined } | undefined => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !isJsonDocument(editor.document.languageId)) {
      vscode.window.showWarningMessage('Open a JSON file first.');
      return undefined;
    }
    return { doc: editor.document, root: getRoot(editor.document) };
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('jsonExplorer.searchStructure', async () => {
      const s = activeRoot();
      if (!s) return;
      await runStructureSearch(s.doc, s.root, cfg.maxDepth());
    }),
    vscode.commands.registerCommand('jsonExplorer.copyPath', async () => {
      const editor = vscode.window.activeTextEditor;
      const s = activeRoot();
      if (!editor || !s) return;
      await copyPath(s.doc, s.root, editor.selection.active);
    }),
    vscode.commands.registerCommand('jsonExplorer.copyPointer', async () => {
      const editor = vscode.window.activeTextEditor;
      const s = activeRoot();
      if (!editor || !s) return;
      await copyPointer(s.doc, s.root, editor.selection.active);
    }),
    vscode.commands.registerCommand('jsonExplorer.goToPath', async () => {
      const s = activeRoot();
      if (!s) return;
      await goToPath(s.doc, s.root);
    }),
    vscode.commands.registerCommand('jsonExplorer.format', formatDocument),
    vscode.commands.registerCommand('jsonExplorer.formatSelection', formatSelection),
    vscode.commands.registerCommand('jsonExplorer.minify', minifyDocument),
    vscode.commands.registerCommand('jsonExplorer.minifySelection', minifySelection),
    vscode.commands.registerCommand('jsonExplorer.sortKeys', () => sortKeys(false)),
    vscode.commands.registerCommand('jsonExplorer.sortKeysRecursive', () => sortKeys(true)),
    vscode.commands.registerCommand('jsonExplorer.sortSelectedObject', sortSelectedObject),
    vscode.commands.registerCommand('jsonExplorer.generateSchema', async () => {
      const editor = vscode.window.activeTextEditor;
      const s = activeRoot();
      if (!editor || !s) return;
      const text = editor.selection.isEmpty ? s.doc.getText() : s.doc.getText(editor.selection);
      const schema = schemaForDocument(s.root, text);
      const schemaDoc = await vscode.workspace.openTextDocument({ language: 'json', content: schema });
      await vscode.window.showTextDocument(schemaDoc, { preview: false });
    }),
    vscode.commands.registerCommand('jsonExplorer.validateSchema', async () => {
      const s = activeRoot();
      if (!s) return;
      await updateDiagnostics(s.doc);
      const count = diagnostics.get(s.doc.uri)?.length ?? 0;
      vscode.window.showInformationMessage(
        count === 0 ? 'JSON is valid (including schema).' : `Found ${count} problem(s). See Problems panel.`,
      );
    }),
    vscode.commands.registerCommand('jsonExplorer.focusNode', async () => {
      const editor = vscode.window.activeTextEditor;
      const s = activeRoot();
      if (!editor || !s) return;
      await focusMode.focus(s.doc, s.root, editor.selection.active);
    }),
    vscode.commands.registerCommand('jsonExplorer.returnFromFocus', () => focusMode.returnToDocument()),
    vscode.commands.registerCommand('jsonExplorer.collapseAll', collapseAll),
    vscode.commands.registerCommand('jsonExplorer.expandAll', expandAll),
    vscode.commands.registerCommand('jsonExplorer.collapseToLevel', async () => {
      const s = activeRoot();
      if (!s) return;
      await askLevelAndCollapse(s.doc, s.root);
    }),
    vscode.commands.registerCommand('jsonExplorer.collapseArrays', async () => {
      const s = activeRoot();
      if (!s) return;
      await collapseKind(s.doc, s.root, 'array');
    }),
    vscode.commands.registerCommand('jsonExplorer.collapseObjects', async () => {
      const s = activeRoot();
      if (!s) return;
      await collapseKind(s.doc, s.root, 'object');
    }),
    vscode.commands.registerCommand('jsonExplorer.showStatistics', async () => {
      const s = vscode.window.activeTextEditor && isJsonDocument(vscode.window.activeTextEditor.document.languageId)
        ? { doc: vscode.window.activeTextEditor.document, root: getRoot(vscode.window.activeTextEditor.document) }
        : undefined;
      await stats.showDetails(s?.doc, s?.root);
    }),
    vscode.commands.registerCommand('jsonExplorer.findEmptyValues', async () => {
      const s = activeRoot();
      if (!s) return;
      await runFindEmptyValues(s.doc, s.root);
    }),
    vscode.commands.registerCommand('jsonExplorer.renameKey', async () => {
      const editor = vscode.window.activeTextEditor;
      const s = activeRoot();
      if (!editor || !s) return;
      await runRenameKey(s.doc, s.root, editor.selection.active);
    }),
    vscode.commands.registerCommand('jsonExplorer.foldBlock', async (startLine?: number) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || typeof startLine !== 'number') return;
      editor.selection = new vscode.Selection(startLine, 0, startLine, 0);
      await vscode.commands.executeCommand('editor.fold');
    }),
    vscode.commands.registerCommand('jsonExplorer.fixJson', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const repaired = deterministicRepairs(editor.document.getText());
      if (!repaired) {
        vscode.window.showInformationMessage('No safe automatic fix found. The issue needs manual review.');
        return;
      }
      const full = new vscode.Range(
        editor.document.positionAt(0),
        editor.document.positionAt(editor.document.getText().length),
      );
      await editor.edit((b) => b.replace(full, repaired));
    }),
    vscode.commands.registerCommand('jsonExplorer.removeDuplicate', async () => {
      vscode.window.showInformationMessage('Use the Problems panel quick fix on a duplicate-key warning to remove it.');
    }),
  );

  // Initial refresh
  refreshViews();
  refreshBadges();
  const initial = vscode.window.activeTextEditor;
  if (initial && isJsonDocument(initial.document.languageId)) scheduleDiagnostics(initial.document);
}

export function deactivate(): void {}
