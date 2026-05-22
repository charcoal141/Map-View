"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/parser/index.ts
var parser_exports = {};
__export(parser_exports, {
  parseMapFile: () => parseMapFile
});
module.exports = __toCommonJS(parser_exports);
var LOAD_REGION_RE = /Load Region (\S+) \(Base: (0x[\da-f]+), Size: (0x[\da-f]+), Max: (0x[\da-f]+)/i;
var EXEC_REGION_RE = /Execution Region (\S+) \(Exec base: (0x[\da-f]+), Load base: (0x[\da-f]+), Size: (0x[\da-f]+), Max: (0x[\da-f]+)/i;
var MEMORY_LINE_RE = /^\s*(0x[\da-f]+)\s+(0x[\da-f]+|-)\s+(0x[\da-f]+)\s+(Code|Data|Zero|PAD)\s+(RO|RW)\s+(\d+)\s+(\*?)\s*(.+?)\s{2,}(\S+)\s*$/i;
var COMPONENT_LINE_RE = /^\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$/;
var TOTALS_LINE_RE = /Total RO\s+Size.*?(\d+)\s*\(/;
var TOTALS_RW_RE = /Total RW\s+Size.*?(\d+)\s*\(/;
var TOTALS_ROM_RE = /Total ROM\s+Size.*?(\d+)\s*\(/;
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  parseMapFile
});
