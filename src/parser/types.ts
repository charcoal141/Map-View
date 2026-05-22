export type SectionType = 'Code' | 'Data' | 'Zero' | 'PAD';
export type SectionAttr = 'RO' | 'RW';
export type CompilerVersion = 'AC5' | 'AC6';

export interface MemorySection {
  execAddr: number;
  loadAddr: number | null;
  size: number;
  type: SectionType;
  attr: SectionAttr;
  sectionName: string;
  objectName: string;
  functionName?: string;
  isOutlinedFunction?: boolean;
}

export interface ExecutionRegion {
  name: string;
  execBase: number;
  loadBase: number;
  size: number;
  maxSize: number;
  sections: MemorySection[];
}

export interface LoadRegion {
  name: string;
  baseAddr: number;
  size: number;
  maxSize: number;
  executionRegions: ExecutionRegion[];
}

export interface ComponentSize {
  objectName: string;
  code: number;
  codeIncData: number;
  roData: number;
  rwData: number;
  ziData: number;
  debug: number;
  library?: string;
  member?: string;
}

export interface MapFileData {
  compiler: string;
  compilerVersion: CompilerVersion;
  loadRegions: LoadRegion[];
  componentSizes: ComponentSize[];
  libraryMembers: ComponentSize[];
  librarySizes: ComponentSize[];
  grandTotals: {
    code: number;
    roData: number;
    rwData: number;
    ziData: number;
    totalRO: number;
    totalRW: number;
    totalROM: number;
  };
}

export type ViewMode = 'region' | 'module';

export interface TreeNode {
  name: string;
  children?: TreeNode[];
  size?: number;
  type?: SectionType;
  attr?: SectionAttr;
  address?: number;
  objectFile?: string;
  category?: 'code' | 'rodata' | 'rwdata' | 'zidata' | 'pad';
}

export interface MemorySummary {
  rom: { used: number; total: number; percent: number };
  ram: { used: number; total: number; percent: number };
}
