import * as vscode from 'vscode';
import { TreeNode, MemorySummary } from '../parser/types';

interface WebviewData {
  regionTree: TreeNode;
  moduleTree: TreeNode;
  summary: MemorySummary;
}

export class WebviewProvider {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private extensionUri: vscode.Uri) {}

  show(filePath: string, data: WebviewData) {
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
    }

    this.panel.webview.html = this.getHtml(this.panel.webview, data);
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
