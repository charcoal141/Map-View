import * as vscode from 'vscode';
import { parseMapFile } from './parser/index';
import { buildRegionTree, buildModuleTree, buildMemorySummary } from './transformer/treeBuilder';
import { WebviewProvider } from './webview/WebviewProvider';

export function activate(context: vscode.ExtensionContext) {
  const openFileCmd = vscode.commands.registerCommand(
    'keilMapHeatmap.openFile',
    async (uri?: vscode.Uri) => {
      const fileUri = uri || await vscode.window.showOpenDialog({
        filters: { 'MAP Files': ['map'] },
        canSelectMany: false,
      }).then(uris => uris?.[0]);

      if (!fileUri) return;
      await openMapHeatmap(fileUri, context);
    }
  );

  const openActiveCmd = vscode.commands.registerCommand(
    'keilMapHeatmap.openActive',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !editor.document.uri.fsPath.endsWith('.map')) {
        vscode.window.showWarningMessage('Please open a .map file first');
        return;
      }
      await openMapHeatmap(editor.document.uri, context);
    }
  );

  context.subscriptions.push(openFileCmd, openActiveCmd);
}

async function openMapHeatmap(uri: vscode.Uri, context: vscode.ExtensionContext) {
  try {
    const content = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(content).toString('utf-8');

    const mapData = parseMapFile(text);

    if (mapData.loadRegions.length === 0 && mapData.componentSizes.length === 0) {
      vscode.window.showErrorMessage('Failed to parse MAP file: no valid data found');
      return;
    }

    const config = vscode.workspace.getConfiguration('keilMapHeatmap');
    const memoryConfig = config.get<Record<string, {rom?: number; ram?: number}>>('memoryConfig', {});
    const fileName = uri.fsPath.split(/[\\/]/).pop() || '';
    const fileConfig = memoryConfig[fileName] || {};

    const regionTree = buildRegionTree(mapData);
    const moduleTree = buildModuleTree(mapData);
    const summary = buildMemorySummary(mapData, { romSize: fileConfig.rom || 0, ramSize: fileConfig.ram || 0 });

    const provider = new WebviewProvider(context.extensionUri);
    provider.show(uri.fsPath, { regionTree, moduleTree, summary });
  } catch (err: any) {
    vscode.window.showErrorMessage('Error reading MAP file: ' + err.message);
  }
}

export function deactivate() {}
