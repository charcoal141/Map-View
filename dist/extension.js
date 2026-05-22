"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/parser/index.ts
var parser_exports = {};
__export(parser_exports, {
  parseMapFile: () => parseMapFile
});
function detectCompilerVersion(firstLine) {
  if (firstLine.includes("Arm Compiler for Embedded") || /Compiler.*6\.\d/.test(firstLine)) {
    return "AC6";
  }
  return "AC5";
}
function extractFunctionName(sectionName, version) {
  if (version === "AC5") {
    const m = sectionName.match(/^i\.(.+)$/);
    return m ? m[1] : void 0;
  } else {
    const m = sectionName.match(/^\.text\.(.+)$/);
    if (m && !m[1].startsWith("OUTLINED_FUNCTION_")) {
      return m[1];
    }
    return void 0;
  }
}
function parseMapFile(content) {
  const lines = content.split(/\r?\n/);
  const compilerVersion = detectCompilerVersion(lines[0] || "");
  const result = {
    compiler: lines[0] || "",
    compilerVersion,
    loadRegions: [],
    componentSizes: [],
    libraryMembers: [],
    librarySizes: [],
    grandTotals: { code: 0, roData: 0, rwData: 0, ziData: 0, totalRO: 0, totalRW: 0, totalROM: 0 }
  };
  let state = 0 /* Initial */;
  let componentSubState = 0 /* ObjectNames */;
  let currentLoadRegion = null;
  let currentExecRegion = null;
  for (const line of lines) {
    if (line.includes("Section Cross References")) {
      state = 1 /* CrossReferences */;
      continue;
    }
    if (line.includes("Removing Unused input sections")) {
      state = 2 /* RemovedSections */;
      continue;
    }
    if (line.includes("Image Symbol Table")) {
      state = 3 /* SymbolTable */;
      continue;
    }
    if (line.includes("Memory Map of the image")) {
      state = 4 /* MemoryMap */;
      continue;
    }
    if (line.includes("Image component sizes")) {
      state = 5 /* ComponentSizes */;
      componentSubState = 0 /* ObjectNames */;
      continue;
    }
    switch (state) {
      case 4 /* MemoryMap */: {
        const loadMatch = line.match(LOAD_REGION_RE);
        if (loadMatch) {
          currentLoadRegion = {
            name: loadMatch[1],
            baseAddr: parseInt(loadMatch[2], 16),
            size: parseInt(loadMatch[3], 16),
            maxSize: parseInt(loadMatch[4], 16),
            executionRegions: []
          };
          result.loadRegions.push(currentLoadRegion);
          break;
        }
        const execMatch = line.match(EXEC_REGION_RE);
        if (execMatch) {
          currentExecRegion = {
            name: execMatch[1],
            execBase: parseInt(execMatch[2], 16),
            loadBase: parseInt(execMatch[3], 16),
            size: parseInt(execMatch[4], 16),
            maxSize: parseInt(execMatch[5], 16),
            sections: []
          };
          currentLoadRegion?.executionRegions.push(currentExecRegion);
          break;
        }
        const dataMatch = line.match(MEMORY_LINE_RE);
        if (dataMatch) {
          const sectionName = dataMatch[8].trim();
          const section = {
            execAddr: parseInt(dataMatch[1], 16),
            loadAddr: dataMatch[2] === "-" ? null : parseInt(dataMatch[2], 16),
            size: parseInt(dataMatch[3], 16),
            type: dataMatch[4],
            attr: dataMatch[5],
            sectionName,
            objectName: dataMatch[9],
            functionName: extractFunctionName(sectionName, compilerVersion),
            isOutlinedFunction: /^\.text\.OUTLINED_FUNCTION_\d+$/.test(sectionName)
          };
          currentExecRegion?.sections.push(section);
        }
        break;
      }
      case 5 /* ComponentSizes */: {
        if (line.includes("Library Member Name")) {
          componentSubState = 1 /* LibraryMembers */;
          break;
        }
        if (line.includes("Library Name") && !line.includes("Library Member")) {
          componentSubState = 2 /* LibraryNames */;
          break;
        }
        const roMatch = line.match(TOTALS_LINE_RE);
        if (roMatch) {
          result.grandTotals.totalRO = parseInt(roMatch[1]);
          break;
        }
        const rwMatch = line.match(TOTALS_RW_RE);
        if (rwMatch) {
          result.grandTotals.totalRW = parseInt(rwMatch[1]);
          break;
        }
        const romMatch = line.match(TOTALS_ROM_RE);
        if (romMatch) {
          result.grandTotals.totalROM = parseInt(romMatch[1]);
          break;
        }
        if (line.includes("Grand Totals")) {
          const m = line.match(/^\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
          if (m) {
            result.grandTotals.code = parseInt(m[1]);
            result.grandTotals.roData = parseInt(m[3]);
            result.grandTotals.rwData = parseInt(m[4]);
            result.grandTotals.ziData = parseInt(m[5]);
          }
          componentSubState = 3 /* GrandTotals */;
          break;
        }
        if (line.trim() === "" || line.includes("---") || line.includes("Code (inc. data)") || line.includes("Object Totals") || line.includes("(incl.") || line.includes("Library Totals") || line.includes("ELF Image Totals") || line.includes("ROM Totals")) {
          break;
        }
        const compMatch = line.match(COMPONENT_LINE_RE);
        if (compMatch) {
          const rawName = compMatch[7].trim();
          const libMatch = rawName.match(/^(.+?)\((.+?)\)$/);
          const component = {
            objectName: libMatch ? libMatch[2] : rawName,
            code: parseInt(compMatch[1]),
            codeIncData: parseInt(compMatch[2]),
            roData: parseInt(compMatch[3]),
            rwData: parseInt(compMatch[4]),
            ziData: parseInt(compMatch[5]),
            debug: parseInt(compMatch[6]),
            library: libMatch ? libMatch[1] : void 0,
            member: libMatch ? libMatch[2] : void 0
          };
          switch (componentSubState) {
            case 0 /* ObjectNames */:
              result.componentSizes.push(component);
              break;
            case 1 /* LibraryMembers */:
              result.libraryMembers.push(component);
              break;
            case 2 /* LibraryNames */:
              result.librarySizes.push(component);
              break;
          }
        }
        break;
      }
    }
  }
  if (result.grandTotals.totalRO === 0 && result.grandTotals.code > 0) {
    result.grandTotals.totalRO = result.grandTotals.code + result.grandTotals.roData;
  }
  if (result.grandTotals.totalRW === 0 && (result.grandTotals.rwData > 0 || result.grandTotals.ziData > 0)) {
    result.grandTotals.totalRW = result.grandTotals.rwData + result.grandTotals.ziData;
  }
  if (result.grandTotals.totalROM === 0 && result.grandTotals.totalRO > 0) {
    result.grandTotals.totalROM = result.grandTotals.totalRO + result.grandTotals.rwData;
  }
  return result;
}
var LOAD_REGION_RE, EXEC_REGION_RE, MEMORY_LINE_RE, COMPONENT_LINE_RE, TOTALS_LINE_RE, TOTALS_RW_RE, TOTALS_ROM_RE;
var init_parser = __esm({
  "src/parser/index.ts"() {
    "use strict";
    LOAD_REGION_RE = /Load Region (\S+) \(Base: (0x[\da-f]+), Size: (0x[\da-f]+), Max: (0x[\da-f]+)/i;
    EXEC_REGION_RE = /Execution Region (\S+) \(Exec base: (0x[\da-f]+), Load base: (0x[\da-f]+), Size: (0x[\da-f]+), Max: (0x[\da-f]+)/i;
    MEMORY_LINE_RE = /^\s*(0x[\da-f]+)\s+(0x[\da-f]+|-)\s+(0x[\da-f]+)\s+(Code|Data|Zero|PAD)\s+(RO|RW)\s+(\d+)\s+(\*?)\s*(.+?)\s{2,}(\S+)\s*$/i;
    COMPONENT_LINE_RE = /^\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$/;
    TOTALS_LINE_RE = /Total RO\s+Size.*?(\d+)\s*\(/;
    TOTALS_RW_RE = /Total RW\s+Size.*?(\d+)\s*\(/;
    TOTALS_ROM_RE = /Total ROM\s+Size.*?(\d+)\s*\(/;
  }
});

// src/transformer/treeBuilder.ts
var treeBuilder_exports = {};
__export(treeBuilder_exports, {
  buildMemorySummary: () => buildMemorySummary,
  buildModuleTree: () => buildModuleTree,
  buildRegionTree: () => buildRegionTree
});
function buildRegionTree(data) {
  const root = { name: "root", children: [] };
  for (const loadRegion of data.loadRegions) {
    for (const execRegion of loadRegion.executionRegions) {
      const regionNode = {
        name: execRegion.name,
        children: []
      };
      const groups = groupBy(execRegion.sections, (s) => s.objectName);
      for (const [objName, sections] of Object.entries(groups)) {
        const libMatch = objName.match(/^(.+?)\((.+?)\)$/);
        const displayName = libMatch ? `[${libMatch[1]}] ${libMatch[2]}` : objName;
        const objNode = {
          name: displayName,
          children: sections.filter((s) => s.size > 0).map((s) => ({
            name: s.functionName || s.sectionName,
            size: s.size,
            type: s.type,
            attr: s.attr,
            address: s.execAddr,
            objectFile: objName,
            category: classifySection(s)
          }))
        };
        if (objNode.children.length > 0) {
          regionNode.children.push(objNode);
        }
      }
      if (regionNode.children.length > 0) {
        root.children.push(regionNode);
      }
    }
  }
  return root;
}
function buildModuleTree(data) {
  const root = { name: "root", children: [] };
  const allComponents = [...data.componentSizes, ...data.libraryMembers];
  const categories = categorizeComponents(allComponents);
  for (const [category, components] of Object.entries(categories)) {
    const catNode = { name: category, children: [] };
    for (const comp of components) {
      const totalSize = comp.code + comp.roData + comp.rwData + comp.ziData;
      if (totalSize === 0)
        continue;
      const displayName = comp.objectName.replace(/\.o$/, "");
      const moduleNode = {
        name: comp.objectName,
        children: [
          ...comp.code > 0 ? [{ name: displayName, size: comp.code, category: "code", objectFile: comp.objectName }] : [],
          ...comp.roData > 0 ? [{ name: displayName + " [RO]", size: comp.roData, category: "rodata", objectFile: comp.objectName }] : [],
          ...comp.rwData > 0 ? [{ name: displayName + " [RW]", size: comp.rwData, category: "rwdata", objectFile: comp.objectName }] : [],
          ...comp.ziData > 0 ? [{ name: displayName + " [ZI]", size: comp.ziData, category: "zidata", objectFile: comp.objectName }] : []
        ]
      };
      catNode.children.push(moduleNode);
    }
    if (catNode.children.length > 0) {
      root.children.push(catNode);
    }
  }
  return root;
}
function buildMemorySummary(data, overrides) {
  const romRegion = data.loadRegions[0]?.executionRegions.find(
    (r) => r.name.includes("IROM") || r.execBase >= 134217728 && r.execBase < 536870912
  );
  const ramRegion = data.loadRegions[0]?.executionRegions.find(
    (r) => r.name.includes("IRAM") || r.execBase >= 536870912
  );
  const romTotal = overrides?.romSize && overrides.romSize > 0 ? overrides.romSize * 1024 : romRegion?.maxSize || 0;
  const ramTotal = overrides?.ramSize && overrides.ramSize > 0 ? overrides.ramSize * 1024 : ramRegion?.maxSize || 0;
  const romUsed = data.grandTotals.totalROM;
  const ramUsed = data.grandTotals.totalRW;
  return {
    rom: { used: romUsed, total: romTotal, percent: romTotal > 0 ? romUsed / romTotal * 100 : 0 },
    ram: { used: ramUsed, total: ramTotal, percent: ramTotal > 0 ? ramUsed / ramTotal * 100 : 0 }
  };
}
function classifySection(s) {
  if (s.type === "PAD")
    return "pad";
  if (s.type === "Code")
    return "code";
  if (s.type === "Zero")
    return "zidata";
  if (s.attr === "RO")
    return "rodata";
  return "rwdata";
}
function categorizeComponents(components) {
  const result = {};
  for (const comp of components) {
    let category;
    if (comp.library) {
      category = "Compiler Library";
    } else if (/^at32f\d+/.test(comp.objectName)) {
      category = "Chip Library";
    } else if (/usb|hid|winusb|usbd_/i.test(comp.objectName)) {
      category = "USB/Middleware";
    } else if (/^lv_|^lfs|lvgl/i.test(comp.objectName)) {
      category = "Third Party";
    } else {
      category = "User Code";
    }
    if (!result[category])
      result[category] = [];
    result[category].push(comp);
  }
  return result;
}
function groupBy(arr, keyFn) {
  const result = {};
  for (const item of arr) {
    const key = keyFn(item);
    if (!result[key])
      result[key] = [];
    result[key].push(item);
  }
  return result;
}
var init_treeBuilder = __esm({
  "src/transformer/treeBuilder.ts"() {
    "use strict";
  }
});

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode2 = __toESM(require("vscode"));
init_parser();
init_treeBuilder();

// src/webview/WebviewProvider.ts
var vscode = __toESM(require("vscode"));
var WebviewProvider = class {
  constructor(extensionUri) {
    this.extensionUri = extensionUri;
    this.filePath = "";
  }
  show(filePath, data) {
    this.filePath = filePath;
    this.currentData = data;
    const fileName = filePath.split(/[\\/]/).pop() || "MAP Heatmap";
    if (this.panel) {
      this.panel.reveal();
    } else {
      this.panel = vscode.window.createWebviewPanel(
        "keilMapHeatmap",
        `Heatmap: ${fileName}`,
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [
            vscode.Uri.joinPath(this.extensionUri, "media")
          ]
        }
      );
      this.panel.onDidDispose(() => {
        this.panel = void 0;
      });
      this.panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.type === "configMemory") {
          await this.handleConfigMemory();
        }
      });
    }
    this.panel.webview.html = this.getHtml(this.panel.webview, data);
  }
  async handleConfigMemory() {
    const config = vscode.workspace.getConfiguration("keilMapHeatmap");
    const memoryConfig = config.get("memoryConfig", {});
    const fileName = this.filePath.split(/[\\/]/).pop() || "";
    const fileConfig = memoryConfig[fileName] || {};
    const currentRom = fileConfig.rom || 0;
    const currentRam = fileConfig.ram || 0;
    const romInput = await vscode.window.showInputBox({
      prompt: `ROM (Flash) size in KB for ${fileName} (0 = use MAP file value)`,
      value: currentRom.toString(),
      validateInput: (v) => isNaN(Number(v)) || Number(v) < 0 ? "Please enter a valid number" : void 0
    });
    if (romInput === void 0)
      return;
    const ramInput = await vscode.window.showInputBox({
      prompt: `RAM size in KB for ${fileName} (0 = use MAP file value)`,
      value: currentRam.toString(),
      validateInput: (v) => isNaN(Number(v)) || Number(v) < 0 ? "Please enter a valid number" : void 0
    });
    if (ramInput === void 0)
      return;
    const romSize = Number(romInput);
    const ramSize = Number(ramInput);
    memoryConfig[fileName] = { rom: romSize, ram: ramSize };
    await config.update("memoryConfig", memoryConfig, vscode.ConfigurationTarget.Workspace);
    if (this.currentData && this.panel) {
      const { buildMemorySummary: buildMemorySummary2 } = (init_treeBuilder(), __toCommonJS(treeBuilder_exports));
      const { parseMapFile: parseMapFile2 } = (init_parser(), __toCommonJS(parser_exports));
      const content = await vscode.workspace.fs.readFile(vscode.Uri.file(this.filePath));
      const text = Buffer.from(content).toString("utf-8");
      const mapData = parseMapFile2(text);
      const summary = buildMemorySummary2(mapData, { romSize, ramSize });
      this.currentData.summary = summary;
      this.panel.webview.html = this.getHtml(this.panel.webview, this.currentData);
    }
  }
  getHtml(webview, data) {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "style.css")
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "treemap.js")
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
};
function getNonce() {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

// src/extension.ts
function activate(context) {
  const openFileCmd = vscode2.commands.registerCommand(
    "keilMapHeatmap.openFile",
    async (uri) => {
      const fileUri = uri || await vscode2.window.showOpenDialog({
        filters: { "MAP Files": ["map"] },
        canSelectMany: false
      }).then((uris) => uris?.[0]);
      if (!fileUri)
        return;
      await openMapHeatmap(fileUri, context);
    }
  );
  const openActiveCmd = vscode2.commands.registerCommand(
    "keilMapHeatmap.openActive",
    async () => {
      const editor = vscode2.window.activeTextEditor;
      if (!editor || !editor.document.uri.fsPath.endsWith(".map")) {
        vscode2.window.showWarningMessage("Please open a .map file first");
        return;
      }
      await openMapHeatmap(editor.document.uri, context);
    }
  );
  context.subscriptions.push(openFileCmd, openActiveCmd);
}
async function openMapHeatmap(uri, context) {
  try {
    const content = await vscode2.workspace.fs.readFile(uri);
    const text = Buffer.from(content).toString("utf-8");
    const mapData = parseMapFile(text);
    if (mapData.loadRegions.length === 0 && mapData.componentSizes.length === 0) {
      vscode2.window.showErrorMessage("Failed to parse MAP file: no valid data found");
      return;
    }
    const config = vscode2.workspace.getConfiguration("keilMapHeatmap");
    const memoryConfig = config.get("memoryConfig", {});
    const fileName = uri.fsPath.split(/[\\/]/).pop() || "";
    const fileConfig = memoryConfig[fileName] || {};
    const regionTree = buildRegionTree(mapData);
    const moduleTree = buildModuleTree(mapData);
    const summary = buildMemorySummary(mapData, { romSize: fileConfig.rom || 0, ramSize: fileConfig.ram || 0 });
    const provider = new WebviewProvider(context.extensionUri);
    provider.show(uri.fsPath, { regionTree, moduleTree, summary });
  } catch (err) {
    vscode2.window.showErrorMessage("Error reading MAP file: " + err.message);
  }
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
