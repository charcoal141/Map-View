import * as vscode from 'vscode';
import { TreeNode, MemorySummary } from '../parser/types';

interface WebviewData {
  regionTree: TreeNode;
  moduleTree: TreeNode;
  summary: MemorySummary;
}

export class WebviewProvider {
  private panel: vscode.WebviewPanel | undefined;
  private currentData: WebviewData | undefined;
  private filePath: string = '';

  constructor(private extensionUri: vscode.Uri) {}

  show(filePath: string, data: WebviewData) {
    this.filePath = filePath;
    this.currentData = data;
    const fileName = filePath.split(/[\\/]/).pop() || 'MAP Heatmap';

    if (this.panel) {
      this.panel.reveal();
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'keilMapHeatmap',
        `Heatmap: ${fileName}`,
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [
            vscode.Uri.joinPath(this.extensionUri, 'media'),
          ],
        }
      );
      this.panel.onDidDispose(() => { this.panel = undefined; });
      this.panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.type === 'configMemory') {
          await this.handleConfigMemory();
        }
      });
    }

    this.panel.webview.html = this.getHtml(this.panel.webview, data);
  }

  private async handleConfigMemory() {
    const config = vscode.workspace.getConfiguration('keilMapHeatmap');
    const memoryConfig = config.get<Record<string, {rom?: number; ram?: number}>>('memoryConfig', {});
    const fileName = this.filePath.split(/[\\/]/).pop() || '';
    const fileConfig = memoryConfig[fileName] || {};
    const currentRom = fileConfig.rom || 0;
    const currentRam = fileConfig.ram || 0;

    const romInput = await vscode.window.showInputBox({
      prompt: `ROM (Flash) size in KB for ${fileName} (0 = use MAP file value)`,
      value: currentRom.toString(),
      validateInput: (v) => isNaN(Number(v)) || Number(v) < 0 ? 'Please enter a valid number' : undefined,
    });
    if (romInput === undefined) return;

    const ramInput = await vscode.window.showInputBox({
      prompt: `RAM size in KB for ${fileName} (0 = use MAP file value)`,
      value: currentRam.toString(),
      validateInput: (v) => isNaN(Number(v)) || Number(v) < 0 ? 'Please enter a valid number' : undefined,
    });
    if (ramInput === undefined) return;

    const romSize = Number(romInput);
    const ramSize = Number(ramInput);

    memoryConfig[fileName] = { rom: romSize, ram: ramSize };
    await config.update('memoryConfig', memoryConfig, vscode.ConfigurationTarget.Workspace);

    // Refresh the webview with new config
    if (this.currentData && this.panel) {
      const { buildMemorySummary } = require('../transformer/treeBuilder');
      const { parseMapFile } = require('../parser/index');
      const content = await vscode.workspace.fs.readFile(vscode.Uri.file(this.filePath));
      const text = Buffer.from(content).toString('utf-8');
      const mapData = parseMapFile(text);
      const summary = buildMemorySummary(mapData, { romSize, ramSize });
      this.currentData.summary = summary;
      this.panel.webview.html = this.getHtml(this.panel.webview, this.currentData);
    }
  }

  private getHtml(webview: vscode.Webview, data: WebviewData): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'style.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'treemap.js')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html style="height:100%;margin:0;padding:0;">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body style="height:100%;margin:0;padding:0;display:flex;flex-direction:column;overflow:hidden;">
  <div id="toolbar">
    <button id="btn-back" style="display:none;" title="Back">&#8592; Back</button>
    <div class="memory-bars">
      <div class="memory-bar">
        <span class="label">ROM:</span>
        <div class="progress-bar"><div class="progress-fill rom-fill" id="rom-fill"></div></div>
        <span class="usage-text" id="rom-text"></span>
      </div>
      <div class="memory-bar">
        <span class="label">RAM:</span>
        <div class="progress-bar"><div class="progress-fill ram-fill" id="ram-fill"></div></div>
        <span class="usage-text" id="ram-text"></span>
      </div>
      <button id="btn-config" title="Configure ROM/RAM size">&#9881;</button>
    </div>
    <div class="controls">
      <select id="view-mode">
        <option value="region">Region View</option>
        <option value="module">Module View</option>
      </select>
      <input type="text" id="search" placeholder="Search..." />
    </div>
  </div>
  <div id="treemap-container" style="flex:1;min-height:0;position:relative;overflow:hidden;"></div>
  <div id="tooltip"></div>
  <script nonce="${nonce}">
    window.__DATA__ = ${JSON.stringify(data)};
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
