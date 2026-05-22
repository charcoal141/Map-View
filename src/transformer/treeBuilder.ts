import { MapFileData, MemorySection, ComponentSize, TreeNode, MemorySummary } from '../parser/types';

export function buildRegionTree(data: MapFileData): TreeNode {
  const root: TreeNode = { name: 'root', children: [] };

  for (const loadRegion of data.loadRegions) {
    for (const execRegion of loadRegion.executionRegions) {
      const regionNode: TreeNode = {
        name: execRegion.name,
        children: [],
      };

      const groups = groupBy(execRegion.sections, s => s.objectName);

      for (const [objName, sections] of Object.entries(groups)) {
        const libMatch = objName.match(/^(.+?)\((.+?)\)$/);
        const displayName = libMatch ? `[${libMatch[1]}] ${libMatch[2]}` : objName;

        const objNode: TreeNode = {
          name: displayName,
          children: sections
            .filter(s => s.size > 0)
            .map(s => ({
              name: s.functionName || s.sectionName,
              size: s.size,
              type: s.type,
              attr: s.attr,
              address: s.execAddr,
              objectFile: objName,
              category: classifySection(s),
            })),
        };

        if (objNode.children!.length > 0) {
          regionNode.children!.push(objNode);
        }
      }

      if (regionNode.children!.length > 0) {
        root.children!.push(regionNode);
      }
    }
  }

  return root;
}

export function buildModuleTree(data: MapFileData): TreeNode {
  const root: TreeNode = { name: 'root', children: [] };
  const allComponents = [...data.componentSizes, ...data.libraryMembers];
  const categories = categorizeComponents(allComponents);

  for (const [category, components] of Object.entries(categories)) {
    const catNode: TreeNode = { name: category, children: [] };

    for (const comp of components) {
      const totalSize = comp.code + comp.roData + comp.rwData + comp.ziData;
      if (totalSize === 0) continue;

      const displayName = comp.objectName.replace(/\.o$/, '');
      const moduleNode: TreeNode = {
        name: comp.objectName,
        children: [
          ...(comp.code > 0 ? [{ name: displayName, size: comp.code, category: 'code' as const, objectFile: comp.objectName }] : []),
          ...(comp.roData > 0 ? [{ name: displayName + ' [RO]', size: comp.roData, category: 'rodata' as const, objectFile: comp.objectName }] : []),
          ...(comp.rwData > 0 ? [{ name: displayName + ' [RW]', size: comp.rwData, category: 'rwdata' as const, objectFile: comp.objectName }] : []),
          ...(comp.ziData > 0 ? [{ name: displayName + ' [ZI]', size: comp.ziData, category: 'zidata' as const, objectFile: comp.objectName }] : []),
        ],
      };
      catNode.children!.push(moduleNode);
    }

    if (catNode.children!.length > 0) {
      root.children!.push(catNode);
    }
  }

  return root;
}

export function buildMemorySummary(data: MapFileData, overrides?: { romSize?: number; ramSize?: number }): MemorySummary {
  const romRegion = data.loadRegions[0]?.executionRegions.find(r =>
    r.name.includes('IROM') || r.execBase >= 0x08000000 && r.execBase < 0x20000000
  );
  const ramRegion = data.loadRegions[0]?.executionRegions.find(r =>
    r.name.includes('IRAM') || r.execBase >= 0x20000000
  );

  const romTotal = (overrides?.romSize && overrides.romSize > 0) ? overrides.romSize * 1024 : romRegion?.maxSize || 0;
  const ramTotal = (overrides?.ramSize && overrides.ramSize > 0) ? overrides.ramSize * 1024 : ramRegion?.maxSize || 0;
  const romUsed = data.grandTotals.totalROM;
  const ramUsed = data.grandTotals.totalRW;

  return {
    rom: { used: romUsed, total: romTotal, percent: romTotal > 0 ? (romUsed / romTotal) * 100 : 0 },
    ram: { used: ramUsed, total: ramTotal, percent: ramTotal > 0 ? (ramUsed / ramTotal) * 100 : 0 },
  };
}

function classifySection(s: MemorySection): 'code' | 'rodata' | 'rwdata' | 'zidata' | 'pad' {
  if (s.type === 'PAD') return 'pad';
  if (s.type === 'Code') return 'code';
  if (s.type === 'Zero') return 'zidata';
  if (s.attr === 'RO') return 'rodata';
  return 'rwdata';
}

function categorizeComponents(components: ComponentSize[]): Record<string, ComponentSize[]> {
  const result: Record<string, ComponentSize[]> = {};

  for (const comp of components) {
    let category: string;
    if (comp.library) {
      category = 'Compiler Library';
    } else if (/^at32f\d+/.test(comp.objectName)) {
      category = 'Chip Library';
    } else if (/usb|hid|winusb|usbd_/i.test(comp.objectName)) {
      category = 'USB/Middleware';
    } else if (/^lv_|^lfs|lvgl/i.test(comp.objectName)) {
      category = 'Third Party';
    } else {
      category = 'User Code';
    }

    if (!result[category]) result[category] = [];
    result[category].push(comp);
  }

  return result;
}

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of arr) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}
