import * as vscode from 'vscode';
import { Node as JsonCNode } from 'jsonc-parser';
import { JsonTreeProvider, ExplorerNode } from './JsonTreeProvider';

/** Reveal explorer nodes in the editor and vice versa. */
export class TreeNodeResolver {
  constructor(
    private provider: JsonTreeProvider,
    private getEditorRoot: () => { doc: vscode.TextDocument; root: JsonCNode | undefined } | undefined,
  ) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('jsonExplorer.revealNode', async (entry: ExplorerNode) => {
        const state = this.getEditorRoot();
        // "Show more…" nodes are handled by jsonExplorer.showMore, not here.
        if (!state || !entry || !entry.node) {
          return;
        }
        const { doc } = state;
        const editor = vscode.window.visibleTextEditors.find((e) => e.document === doc);
        const node = entry.node;
        const range = new vscode.Range(
          doc.positionAt(node.offset),
          doc.positionAt(node.offset + node.length),
        );
        if (editor) {
          editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
          editor.selection = new vscode.Selection(range.start, range.start);
        } else {
          const shown = await vscode.window.showTextDocument(doc, { preview: false });
          shown.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
          shown.selection = new vscode.Selection(range.start, range.start);
        }
      }),
      vscode.commands.registerCommand('jsonExplorer.openExplorer', async () => {
        await vscode.commands.executeCommand('workbench.view.explorer');
      }),
    );
  }
}
