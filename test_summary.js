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

// src/transformer/treeBuilder.ts
var treeBuilder_exports = {};
__export(treeBuilder_exports, {
  buildMemorySummary: () => buildMemorySummary,
  buildModuleTree: () => buildModuleTree,
  buildRegionTree: () => buildRegionTree
});
module.exports = __toCommonJS(treeBuilder_exports);
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
          children: mergeSameNameEntries(sections.filter((s) => s.size > 0).map((s) => ({
            name: s.functionName || s.sectionName,
            size: s.size,
            type: s.type,
            attr: s.attr,
            address: s.execAddr,
            objectFile: objName,
            category: classifySection(s)
          })))
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
  if (data.memoryRegions && data.memoryRegions.length > 0) {
    let findRegion2 = function(addr) {
      return data.memoryRegions.find(
        (r) => r.length > 0 && addr >= r.origin && addr < r.origin + r.length
      );
    };
    var findRegion = findRegion2;
    const execRegions = data.loadRegions[0]?.executionRegions || [];
    const textSection = execRegions.find((r) => r.name === ".text" || r.name.includes("flash.text") || r.name.includes("iram0.text"));
    const dataSection = execRegions.find((r) => r.name === ".data" || r.name.includes("dram0.data"));
    const bssSection = execRegions.find((r) => r.name === ".bss" || r.name.includes("dram0.bss"));
    const romRegion2 = textSection ? findRegion2(textSection.execBase) : void 0;
    const ramRegion2 = (dataSection ? findRegion2(dataSection.execBase) : void 0) || (bssSection ? findRegion2(bssSection.execBase) : void 0);
    const romTotal2 = overrides?.romSize && overrides.romSize > 0 ? overrides.romSize * 1024 : romRegion2?.length || 0;
    const ramTotal2 = overrides?.ramSize && overrides.ramSize > 0 ? overrides.ramSize * 1024 : ramRegion2?.length || 0;
    const romUsed2 = data.grandTotals.totalROM;
    const ramUsed2 = data.grandTotals.totalRW;
    return {
      rom: { used: romUsed2, total: romTotal2, percent: romTotal2 > 0 ? romUsed2 / romTotal2 * 100 : 0 },
      ram: { used: ramUsed2, total: ramTotal2, percent: ramTotal2 > 0 ? ramUsed2 / ramTotal2 * 100 : 0 }
    };
  }
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
      if (/^lib(esp_|driver|hal|soc|freertos|xtensa|riscv)/.test(comp.library)) {
        category = "ESP-IDF System";
      } else if (/^lib(lwip|mbedtls|mqtt|nghttp|cjson|protobuf)/.test(comp.library)) {
        category = "Third Party";
      } else if (/^lib/.test(comp.library) && comp.objectName.includes(".a(")) {
        category = "ESP-IDF Component";
      } else {
        category = "Compiler Library";
      }
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
function mergeSameNameEntries(entries) {
  const map = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    const existing = map.get(entry.name);
    if (existing && existing.size !== void 0 && entry.size !== void 0) {
      existing.size += entry.size;
      if (entry.address !== void 0 && entry.size > existing.size - entry.size) {
        existing.address = entry.address;
      }
    } else {
      map.set(entry.name, { ...entry });
    }
  }
  return [...map.values()];
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildMemorySummary,
  buildModuleTree,
  buildRegionTree
});
