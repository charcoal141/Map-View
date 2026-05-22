import { MapFileData, MemorySection, SectionType, SectionAttr, LoadRegion, ExecutionRegion, ComponentSize, MemoryRegion } from './types';

interface SectionEntry {
  sectionName: string;
  address: number;
  size: number;
  objectFile: string;
  functionName?: string;
}

interface OutputSection {
  name: string;
  address: number;
  totalSize: number;
  entries: SectionEntry[];
}

const MEMORY_REGION_RE = /^(\S+)\s+(0x[\da-f]+)\s+(0x[\da-f]+)\s+(\S+)\s*$/i;
const OUTPUT_SECTION_RE = /^(\.\S+)\s+(0x[\da-f]+)\s+(0x[\da-f]+)\s*$/;
const ENTRY_RE = /^\s+(\.\S+)\s+(0x[\da-f]+)\s+(0x[\da-f]+)\s+(.+)$/;
const ENTRY_CONTINUED_RE = /^\s+(0x[\da-f]+)\s+(0x[\da-f]+)\s+(.+)$/;
const SYMBOL_RE = /^\s+(0x[\da-f]+)\s+(\S+)$/;
const FILL_RE = /^\s+\*fill\*\s+(0x[\da-f]+)\s+(0x[\da-f]+)/;

// PLACEHOLDER_ESP32_PARSER_CONTINUE

export function parseEsp32MapFile(content: string): MapFileData {
  const lines = content.split(/\r?\n/);

  const memoryRegions: MemoryRegion[] = [];
  const outputSections: OutputSection[] = [];

  let phase: 'scan' | 'memconfig' | 'linkermap' = 'scan';
  let currentSection: OutputSection | null = null;
  let lastEntry: SectionEntry | null = null;
  let pendingSubSectionName: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Phase transitions
    if (line.startsWith('Memory Configuration')) {
      phase = 'memconfig';
      i++; // skip blank line
      i++; // skip header "Name  Origin  Length  Attributes"
      continue;
    }
    if (line.startsWith('Linker script and memory map')) {
      phase = 'linkermap';
      continue;
    }

    if (phase === 'memconfig') {
      if (line.trim() === '') {
        phase = 'scan';
        continue;
      }
      const m = line.match(MEMORY_REGION_RE);
      if (m && m[1] !== '*default*') {
        memoryRegions.push({
          name: m[1],
          origin: parseInt(m[2], 16),
          length: parseInt(m[3], 16),
          attrs: m[4],
        });
      }
    }

    if (phase === 'linkermap') {
      // Skip LOAD lines and assignments
      if (line.startsWith('LOAD ') || line.includes(' = ')) continue;

      // Output section header (starts at column 0 with a dot)
      const secMatch = line.match(OUTPUT_SECTION_RE);
      if (secMatch) {
        if (currentSection && currentSection.entries.length > 0) {
          outputSections.push(currentSection);
        }
        currentSection = {
          name: secMatch[1],
          address: parseInt(secMatch[2], 16),
          totalSize: parseInt(secMatch[3], 16),
          entries: [],
        };
        lastEntry = null;
        continue;
      }

      // Also handle section header split across two lines
      if (line.match(/^(\.\S+)\s*$/) && currentSection === null) {
        const nextLine = lines[i + 1] || '';
        const contMatch = nextLine.match(/^\s+(0x[\da-f]+)\s+(0x[\da-f]+)\s*$/);
        if (contMatch) {
          currentSection = {
            name: line.trim(),
            address: parseInt(contMatch[1], 16),
            totalSize: parseInt(contMatch[2], 16),
            entries: [],
          };
          lastEntry = null;
          i++;
          continue;
        }
      }

      if (!currentSection) continue;

      // *fill* entries
      const fillMatch = line.match(FILL_RE);
      if (fillMatch) {
        const size = parseInt(fillMatch[2], 16);
        if (size > 0) {
          lastEntry = {
            sectionName: '*fill*',
            address: parseInt(fillMatch[1], 16),
            size,
            objectFile: '*fill*',
          };
          currentSection.entries.push(lastEntry);
        }
        pendingSubSectionName = null;
        continue;
      }

      // Sub-section entry with object file on same line
      const entryMatch = line.match(ENTRY_RE);
      if (entryMatch) {
        const size = parseInt(entryMatch[3], 16);
        if (size > 0) {
          lastEntry = {
            sectionName: entryMatch[1],
            address: parseInt(entryMatch[2], 16),
            size,
            objectFile: entryMatch[4].trim(),
          };
          currentSection.entries.push(lastEntry);
        }
        pendingSubSectionName = null;
        continue;
      }

      // Sub-section name on its own line (to be continued on next line)
      const subSecOnly = line.match(/^\s+(\.\S+)\s*$/);
      if (subSecOnly) {
        pendingSubSectionName = subSecOnly[1];
        continue;
      }

      // Continuation line: address + size + object file (follows a sub-section name line)
      const contEntryMatch = line.match(ENTRY_CONTINUED_RE);
      if (contEntryMatch) {
        const size = parseInt(contEntryMatch[2], 16);
        const objFile = contEntryMatch[3].trim();
        if (size > 0 && !objFile.startsWith('0x') && !objFile.includes('(size before')) {
          lastEntry = {
            sectionName: pendingSubSectionName || '',
            address: parseInt(contEntryMatch[1], 16),
            size,
            objectFile: objFile,
          };
          currentSection.entries.push(lastEntry);
        }
        pendingSubSectionName = null;
        continue;
      }

      // Exported symbol line
      const symMatch = line.match(SYMBOL_RE);
      if (symMatch && lastEntry && !symMatch[2].startsWith('.') && !symMatch[2].startsWith('_')) {
        if (!lastEntry.functionName) {
          lastEntry.functionName = symMatch[2];
        }
      }

      // New section starts (line starts with dot at column 0)
      if (line.match(/^\.\S+/) && !line.match(/^\s/)) {
        if (currentSection && currentSection.entries.length > 0) {
          outputSections.push(currentSection);
        }
        // Try to parse as section header with size on same line
        const inlineMatch = line.match(/^(\.\S+)\s+(0x[\da-f]+)\s+(0x[\da-f]+)/);
        if (inlineMatch) {
          currentSection = {
            name: inlineMatch[1],
            address: parseInt(inlineMatch[2], 16),
            totalSize: parseInt(inlineMatch[3], 16),
            entries: [],
          };
        } else {
          currentSection = null;
        }
        lastEntry = null;
      }
    }
  }

  // Push last section
  if (currentSection && currentSection.entries.length > 0) {
    outputSections.push(currentSection);
  }

  // Build MapFileData from parsed sections
  return buildMapFileData(outputSections, memoryRegions);
}

function classifySectionType(sectionName: string, parentSection: string): { type: SectionType; attr: SectionAttr } {
  const combined = parentSection + ' ' + sectionName;
  if (/\.bss|\.noinit|zidata/i.test(combined)) {
    return { type: 'Zero', attr: 'RW' };
  }
  if (/\.data/i.test(combined) && !/\.rodata/i.test(combined)) {
    return { type: 'Data', attr: 'RW' };
  }
  if (/\.rodata|drom/i.test(combined)) {
    return { type: 'Data', attr: 'RO' };
  }
  if (/\.text|\.literal|iram|\.vectors/i.test(combined)) {
    return { type: 'Code', attr: 'RO' };
  }
  if (sectionName === '*fill*') {
    return { type: 'PAD', attr: 'RO' };
  }
  // Default: treat as code if in iram/flash.text sections
  if (/iram|flash\.text/i.test(parentSection)) {
    return { type: 'Code', attr: 'RO' };
  }
  return { type: 'Data', attr: 'RO' };
}

function extractObjectName(objPath: string): string {
  // "esp-idf/heap/libheap.a(tlsf.c.obj)" -> "libheap.a(tlsf.c.obj)"
  const libMatch = objPath.match(/([^/]+\.a\(.+?\))/);
  if (libMatch) return libMatch[1];
  // "CMakeFiles/test.elf.dir/project_elf_src_esp32s3.c.obj" -> "project_elf_src_esp32s3.c.obj"
  const objMatch = objPath.match(/([^/]+\.obj)$/);
  if (objMatch) return objMatch[1];
  return objPath;
}

function extractLibraryName(objPath: string): string | undefined {
  const m = objPath.match(/([^/]+\.a)\(/);
  return m ? m[1] : undefined;
}

function extractComponentName(objPath: string): string | undefined {
  // "esp-idf/heap/libheap.a(tlsf.c.obj)" -> "heap"
  const m = objPath.match(/esp-idf\/([^/]+)\//);
  return m ? m[1] : undefined;
}

function getFunctionFromSection(sectionName: string): string | undefined {
  // ".text.esp_log_write" -> "esp_log_write"
  const m = sectionName.match(/\.(?:text|literal|iram\d*)\.(.+)/);
  return m ? m[1] : undefined;
}

function buildMapFileData(outputSections: OutputSection[], memoryRegions: MemoryRegion[]): MapFileData {
  // Filter out debug and non-runtime sections
  const runtimeSections = outputSections.filter(sec => {
    const name = sec.name.toLowerCase();
    if (name.startsWith('.debug')) return false;
    if (name.startsWith('.comment')) return false;
    if (name.startsWith('.xtensa')) return false;
    if (name.startsWith('.xt.')) return false;
    if (name === '.noload') return false;
    if (name.includes('dummy')) return false;
    if (name === '.ext_ram.dummy') return false;
    return true;
  });

  const loadRegion: LoadRegion = {
    name: 'ESP32_FLASH',
    baseAddr: 0,
    size: 0,
    maxSize: 0,
    executionRegions: [],
  };

  // Component size aggregation
  const compMap = new Map<string, { code: number; roData: number; rwData: number; ziData: number; library?: string }>();

  for (const sec of runtimeSections) {
    if (sec.totalSize === 0) continue;

    const execRegion: ExecutionRegion = {
      name: sec.name,
      execBase: sec.address,
      loadBase: sec.address,
      size: sec.totalSize,
      maxSize: sec.totalSize,
      sections: [],
    };

    for (const entry of sec.entries) {
      const { type, attr } = classifySectionType(entry.sectionName, sec.name);
      const funcName = entry.functionName || getFunctionFromSection(entry.sectionName);
      const objName = extractObjectName(entry.objectFile);

      const memSection: MemorySection = {
        execAddr: entry.address,
        loadAddr: null,
        size: entry.size,
        type,
        attr,
        sectionName: entry.sectionName,
        objectName: objName,
        functionName: funcName,
      };
      execRegion.sections.push(memSection);

      // Aggregate component sizes
      if (objName !== '*fill*') {
        if (!compMap.has(objName)) {
          compMap.set(objName, { code: 0, roData: 0, rwData: 0, ziData: 0, library: extractLibraryName(entry.objectFile) });
        }
        const comp = compMap.get(objName)!;
        if (type === 'Code') comp.code += entry.size;
        else if (type === 'Zero') comp.ziData += entry.size;
        else if (attr === 'RW') comp.rwData += entry.size;
        else comp.roData += entry.size;
      }
    }

    if (execRegion.sections.length > 0) {
      loadRegion.executionRegions.push(execRegion);
    }
  }

  loadRegion.size = loadRegion.executionRegions.reduce((s, r) => s + r.size, 0);

  // Build componentSizes array
  const componentSizes: ComponentSize[] = [];
  const libraryMembers: ComponentSize[] = [];

  for (const [objName, sizes] of compMap) {
    const comp: ComponentSize = {
      objectName: objName,
      code: sizes.code,
      codeIncData: sizes.code,
      roData: sizes.roData,
      rwData: sizes.rwData,
      ziData: sizes.ziData,
      debug: 0,
      library: sizes.library,
    };
    if (sizes.library) {
      libraryMembers.push(comp);
    } else {
      componentSizes.push(comp);
    }
  }

  // Calculate grand totals
  let totalCode = 0, totalRoData = 0, totalRwData = 0, totalZiData = 0;
  for (const comp of [...componentSizes, ...libraryMembers]) {
    totalCode += comp.code;
    totalRoData += comp.roData;
    totalRwData += comp.rwData;
    totalZiData += comp.ziData;
  }

  // ROM = code + rodata + rwdata (everything that needs to be stored in flash)
  // RAM = rwdata + zidata (runtime RAM usage)
  const totalROM = totalCode + totalRoData + totalRwData;
  const totalRW = totalRwData + totalZiData;

  return {
    compiler: 'GNU ld (ESP-IDF)',
    compilerVersion: 'AC6', // reuse AC6 for function name extraction compatibility
    loadRegions: [loadRegion],
    componentSizes,
    libraryMembers,
    librarySizes: [],
    grandTotals: {
      code: totalCode,
      roData: totalRoData,
      rwData: totalRwData,
      ziData: totalZiData,
      totalRO: totalCode + totalRoData,
      totalRW,
      totalROM,
    },
    memoryRegions,
  };
}