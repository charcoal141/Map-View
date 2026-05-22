# Keil MAP 热力图 VSCode 插件 — AI 实现指南

## 一、项目目标

开发一个 VSCode 插件，能够解析 Keil ARM Compiler 生成的 `.map` 链接器映射文件，并以类似 **Webpack Bundle Analyzer** 的交互式 Treemap（矩形树图/热力图）形式，可视化展示嵌入式项目的 Flash/RAM 内存占用情况。

### 核心功能
- 同时支持 ARM Compiler 5 (AC5/armcc) 和 ARM Compiler 6 (AC6/armclang) 生成的 .map 文件
- 以 Treemap 热力图展示各模块/函数的内存占用
- 支持 ROM(Flash) 和 RAM 两个维度的可视化
- 提供搜索、过滤、下钻等交互能力
- 显示内存使用率（已用/总量）

---

## 二、MAP 文件格式规范

### 2.1 文件来源

由 ARM Compiler 5 (armcc/armlink) 或 ARM Compiler 6 (armclang/armlink) 在 Keil MDK 编译时生成，文件扩展名 `.map`，编码为 ASCII/UTF-8。

**编译器识别方式（文件第一行）：**
- AC5: `Component: ARM Compiler 5.06 update 7 (build 960) Tool: armlink [4d3601]`
- AC6: `Component: Arm Compiler for Embedded 6.19 Tool: armlink [5e73cb00]`

### 2.2 文件整体结构

MAP 文件由以下段落按顺序组成（以 `======` 分隔线分隔）：

| 段落 | 内容 | 对插件的价值 |
|------|------|-------------|
| Section Cross References | 模块间符号交叉引用 | 低（可忽略） |
| Removing Unused input sections | 被链接器移除的未使用段 | 中（可选展示优化效果） |
| Image Symbol Table | 符号表（地址、类型、大小） | 中（补充函数级细节） |
| **Memory Map of the image** | 内存映射详情 | **核心数据源** |
| **Image component sizes** | 各目标文件的大小汇总 | **核心数据源** |

### 2.3 Memory Map 段格式（核心）

#### 区域头部

```
Load Region LR_IROM1 (Base: 0x08000000, Size: 0x00004970, Max: 0x00010000, ABSOLUTE, COMPRESSED[0x000048bc])

  Execution Region ER_IROM1 (Exec base: 0x08000000, Load base: 0x08000000, Size: 0x000047ac, Max: 0x00010000, ABSOLUTE)
```

- `LR_IROM1`: 加载区域名称，对应 Flash
- `Base`: 起始地址
- `Size`: 实际使用大小
- `Max`: 最大可用空间（来自芯片配置）

#### 数据行格式

```
Exec Addr    Load Addr    Size         Type   Attr      Idx    E Section Name        Object

0x08000644   0x08000644   0x00000048   Code   RO         3628    i.At32UsbInit       at32_usb.o
0x0800068c   0x0800068c   0x00000128   Code   RO         3630    i.At32UsbSend       at32_usb.o
0x20000000   0x080047ac   0x000001c4   Data   RW          452    .data               system_at32f425.o
0x2000050c        -       0x00000240   Zero   RW         3715    .bss                soft_timer.o
```

字段说明：
- `Exec Addr`: 运行时地址（十六进制）
- `Load Addr`: 加载地址（RAM 中的 ZI 段显示为 `-`）
- `Size`: 段大小（十六进制，单位 bytes）
- `Type`: `Code` | `Data` | `Zero` | `PAD`
- `Attr`: `RO`(只读) | `RW`(读写)
- `Section Name`: 段名（AC5 和 AC6 格式不同，见下方对比）
- `Object`: 来源目标文件（如 `main.o`、`mc_w.l(memcpya.o)`、`c_w.l(puts.o)`）

#### AC5 vs AC6 Section Name 格式对比

| 特征 | AC5 (armcc) | AC6 (armclang) |
|------|-------------|----------------|
| 函数段命名 | `i.函数名` (如 `i.main`) | `.text.函数名` (如 `.text.main`) |
| 数据段 | `.data`, `.bss`, `.constdata` | `.data.变量名`, `.bss.变量名`, `.rodata.xxx` |
| 异常处理索引 | 无 | `.ARM.exidx.text.函数名` |
| 编译器生成函数 | 无 | `.text.OUTLINED_FUNCTION_N` |
| 标准库前缀 | `mc_w.l(xxx.o)`, `mf_w.l(xxx.o)` | `c_w.l(xxx.o)`, `m_wm.l(xxx.o)`, `fz_wm.l(xxx.o)` |
| 入口点 | `.ARM.Collect$$$$00000000` | `!!!main`, `!!!scatter` |

**AC6 Memory Map 数据行示例：**
```
0x08009000   0x08009000   0x000001e0   Data   RO         1345    RESET               startup_at32f402_405.o
0x080091e0   0x080091e0   0x00000008   Code   RO         6765  * !!!main             c_w.l(__main.o)
0x0800a0a4   0x0800a0a4   0x00000170   Code   RO           18    .text.system_clock_config  at32f402_405_clock.o
0x0800acba   0x0800acba   0x0000000c   Code   RO          143    .text.OUTLINED_FUNCTION_0  protocol_analysis.o
0x0800acd0   0x0800acd0   0x00000064   Code   RO          408    .text.OUTLINED_FUNCTION_0  at32f402_405_crm.o
0x20000208        -       0x00000207   Zero   RW         1960    .bss.lfs_cfg        lfs.o
```

**注意：** AC6 中同名的 `.text.OUTLINED_FUNCTION_0` 可能出现在多个不同的 Object 中，每个都是独立的段。解析时需要同时用 Section Name + Object Name 来唯一标识一个段。

#### 内存区域含义

| 执行区域 | 地址范围 | 对应硬件 |
|----------|----------|----------|
| ER_IROM1 | 0x08000000 起 | Flash/ROM |
| RW_IRAM1 | 0x20000000 起 | SRAM/RAM |

### 2.4 Image Component Sizes 段格式（核心）

AC5 和 AC6 的 Component Sizes 段格式完全一致，无需区分。

```
      Code (inc. data)   RO Data    RW Data    ZI Data      Debug   Object Name

        96          8          0          0          0        593   argb.o
       994        128          0          1        840       8763   at32_usb.o
      4028        266          0         29        336      26376   digital_show.o
```

AC6 额外有 **Library Member Name** 子段（AC5 没有此独立子段，库成员直接列在 Object Totals 之后）：
```
      Code (inc. data)   RO Data    RW Data    ZI Data      Debug   Library Member Name

      4864        816       1304          4      18572      16099   at32_gif_play.o
        90          0          0          0          0          0   __dczerorl2.o
       392          4         17          0          0         92   __printf_flags_ss_wp.o
```

以及 **Library Name** 汇总：
```
      Code (inc. data)   RO Data    RW Data    ZI Data      Debug   Library Name

      4864        816       1304          4      18572      16099   at32_gif_play.lib
      4188        232        337          0         96       5320   c_w.l
        26          0          0          0          0        116   fz_wm.l
       278         24          0          0          0        368   m_wm.l
```

字段说明：
- `Code (inc. data)`: 代码段大小（含内联数据），占 Flash
- `RO Data`: 只读数据（常量表等），占 Flash
- `RW Data`: 已初始化读写数据，占 Flash + RAM
- `ZI Data`: 零初始化数据（BSS），仅占 RAM
- `Debug`: 调试信息大小（不占目标内存）
- `Object Name`: 目标文件名

#### 汇总行

```
     18050       1140        298        452       3388     279278   Grand Totals

    Total RO  Size (Code + RO Data)                18348 (  17.92kB)
    Total RW  Size (RW Data + ZI Data)              3840 (   3.75kB)
    Total ROM Size (Code + RO Data + RW Data)      18620 (  18.18kB)
```

### 2.5 解析用正则表达式

```typescript
// 编译器版本检测（第一行）
/^Component:\s*(ARM Compiler \d|Arm Compiler for Embedded \d)/i
// 匹配结果判断: 包含 "5." → AC5, 包含 "6." 或 "Embedded" → AC6

// Load Region 头（AC5/AC6 通用）
/Load Region (\S+) \(Base: (0x[\da-f]+), Size: (0x[\da-f]+), Max: (0x[\da-f]+)/i

// Execution Region 头（AC5/AC6 通用）
/Execution Region (\S+) \(Exec base: (0x[\da-f]+), Load base: (0x[\da-f]+), Size: (0x[\da-f]+), Max: (0x[\da-f]+)/i

// Memory Map 数据行（AC5/AC6 通用）
// 注意：Section Name 可能包含空格前的特殊字符如 !!!、$$$$
/^\s*(0x[\da-f]+)\s+(0x[\da-f]+|-)\s+(0x[\da-f]+)\s+(Code|Data|Zero|PAD)\s+(RO|RW)\s+(\d+)\s+(\*?)\s*(\S+)\s+(\S+)/i

// Component Sizes 数据行（AC5/AC6 通用）
/^\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s*$/

// 库成员行（带括号，AC5/AC6 通用）
/^(\S+)\((\S+)\)$/  // 匹配 "mc_w.l(memcpya.o)" 或 "c_w.l(puts.o)"

// AC6 函数名提取（从 Section Name 中）
/^\.text\.(.+)$/    // ".text.main" → "main"

// AC5 函数名提取（从 Section Name 中）
/^i\.(.+)$/         // "i.main" → "main"

// AC6 OUTLINED_FUNCTION 检测
/^\.text\.OUTLINED_FUNCTION_(\d+)$/
```

---

## 三、技术架构

### 3.1 技术栈

| 层级 | 选择 | 理由 |
|------|------|------|
| 插件语言 | TypeScript | VSCode 插件标准 |
| 构建工具 | esbuild | 快速，VSCode 官方推荐 |
| 可视化库 | D3.js (d3-hierarchy + d3-treemap) | 成熟的 treemap 实现 |
| Webview UI | 原生 HTML + CSS + JS | 轻量，D3 直接操作 DOM |
| 测试框架 | vitest | 快速，TS 原生支持 |

不使用 React/Vue — Webview 内容相对固定，D3 直接操作 DOM 更高效。

### 3.2 目录结构

```
keil-map-heatmap/
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── src/
│   ├── extension.ts              # 插件入口
│   ├── parser/
│   │   ├── types.ts              # 数据类型定义
│   │   ├── index.ts              # 解析器主逻辑（状态机）
│   │   ├── memoryMapParser.ts    # Memory Map 段解析
│   │   └── componentParser.ts    # Component Sizes 段解析
│   ├── transformer/
│   │   └── treeBuilder.ts        # 构建 treemap 层级数据
│   ├── webview/
│   │   ├── WebviewProvider.ts    # Webview 面板管理
│   │   └── getHtmlContent.ts     # 生成 HTML
│   └── commands/
│       └── openMapFile.ts        # 命令处理
├── media/
│   ├── treemap.js                # Webview 内的 D3 渲染逻辑
│   ├── style.css                 # Webview 样式
│   └── d3.min.js                 # D3 库（本地打包）
├── test/
│   ├── parser.test.ts
│   └── fixtures/
│       └── sample.map
└── README.md
```

### 3.3 数据流

```
.map 文件
  │ fs.readFile
  ▼
纯文本 string
  │ parseMapFile()
  ▼
MapFileData { loadRegions[], componentSizes[], totals }
  │ buildTreeData(options)
  ▼
TreeNode 层级树 (JSON)
  │ webview.postMessage()
  ▼
Webview 接收数据
  │ D3 treemap layout
  ▼
SVG 矩形树图渲染
```

---

## 四、核心数据类型定义

```typescript
// src/parser/types.ts

/** 内存段类型 */
export type SectionType = 'Code' | 'Data' | 'Zero' | 'PAD';

/** 内存段属性 */
export type SectionAttr = 'RO' | 'RW';

/** Memory Map 中的单行条目 */
export interface MemorySection {
  execAddr: number;
  loadAddr: number | null;   // ZI 段为 null
  size: number;
  type: SectionType;
  attr: SectionAttr;
  sectionName: string;       // AC5: "i.main", AC6: ".text.main"
  objectName: string;        // 如 "main.o", "mc_w.l(memcpya.o)", "c_w.l(puts.o)"
  functionName?: string;     // 提取的函数名（AC5从i.xxx提取，AC6从.text.xxx提取）
  isOutlinedFunction?: boolean; // AC6 编译器生成的 OUTLINED_FUNCTION
}

/** 执行区域 */
export interface ExecutionRegion {
  name: string;              // 如 "ER_IROM1", "RW_IRAM1"
  execBase: number;
  loadBase: number;
  size: number;
  maxSize: number;
  sections: MemorySection[];
}

/** 加载区域 */
export interface LoadRegion {
  name: string;              // 如 "LR_IROM1"
  baseAddr: number;
  size: number;
  maxSize: number;
  executionRegions: ExecutionRegion[];
}

/** Component Sizes 中的一行 */
export interface ComponentSize {
  objectName: string;        // 如 "digital_show.o"
  code: number;
  codeIncData: number;       // code 中包含的 data 部分
  roData: number;
  rwData: number;
  ziData: number;
  debug: number;
  library?: string;          // 如果属于库，如 "mc_w.l"
  member?: string;           // 库成员名，如 "memcpya.o"
}

/** 编译器版本 */
export type CompilerVersion = 'AC5' | 'AC6';

/** 解析器完整输出 */
export interface MapFileData {
  compiler: string;          // 编译器版本信息原文
  compilerVersion: CompilerVersion; // AC5 或 AC6
  loadRegions: LoadRegion[];
  componentSizes: ComponentSize[];
  libraryMembers: ComponentSize[];  // AC6 的 Library Member Name 段
  librarySizes: ComponentSize[];    // Library Name 汇总段
  grandTotals: {
    code: number;
    roData: number;
    rwData: number;
    ziData: number;
    totalRO: number;         // Code + RO Data
    totalRW: number;         // RW Data + ZI Data
    totalROM: number;        // Code + RO Data + RW Data
  };
}

/** Treemap 视图模式 */
export type ViewMode = 'region' | 'module';

/** 传给 Webview 的树节点 */
export interface TreeNode {
  name: string;
  children?: TreeNode[];
  // 叶子节点属性
  size?: number;             // bytes
  type?: SectionType;
  attr?: SectionAttr;
  address?: number;
  objectFile?: string;
  category?: 'code' | 'rodata' | 'rwdata' | 'zidata' | 'pad';
}

/** 内存使用摘要 */
export interface MemorySummary {
  rom: { used: number; total: number; percent: number };
  ram: { used: number; total: number; percent: number };
}
```

---

## 五、解析器实现指南

### 5.1 状态机设计

```typescript
// src/parser/index.ts

enum ParserState {
  Initial,
  CrossReferences,
  RemovedSections,
  SymbolTable,
  MemoryMap,
  ComponentSizes,
  Done,
}

export function parseMapFile(content: string): MapFileData {
  const lines = content.split(/\r?\n/);
  let state = ParserState.Initial;
  const result: MapFileData = { /* 初始化空结构 */ };

  // 第一行检测编译器版本
  // AC5: "Component: ARM Compiler 5.06 update 7 (build 960) Tool: armlink [4d3601]"
  // AC6: "Component: Arm Compiler for Embedded 6.19 Tool: armlink [5e73cb00]"
  result.compiler = lines[0] || '';
  result.compilerVersion = detectCompilerVersion(lines[0]);

  for (const line of lines) {
    // 段标题检测（状态转换）
    if (line.includes('Section Cross References')) {
      state = ParserState.CrossReferences; continue;
    }
    if (line.includes('Removing Unused input sections')) {
      state = ParserState.RemovedSections; continue;
    }
    if (line.includes('Image Symbol Table')) {
      state = ParserState.SymbolTable; continue;
    }
    if (line.includes('Memory Map of the image')) {
      state = ParserState.MemoryMap; continue;
    }
    if (line.includes('Image component sizes')) {
      state = ParserState.ComponentSizes; continue;
    }

    // 根据状态分派解析
    switch (state) {
      case ParserState.MemoryMap:
        parseMemoryMapLine(line, result);
        break;
      case ParserState.ComponentSizes:
        parseComponentLine(line, result);
        break;
    }
  }

  // 计算 grandTotals（如果文件中没有，则手动汇总）
  return result;
}

function detectCompilerVersion(firstLine: string): CompilerVersion {
  if (firstLine.includes('Arm Compiler for Embedded') || firstLine.match(/Compiler.*6\.\d/)) {
    return 'AC6';
  }
  return 'AC5'; // 默认 AC5
}
```

### 5.2 Memory Map 解析细节

```typescript
// src/parser/memoryMapParser.ts

let currentLoadRegion: LoadRegion | null = null;
let currentExecRegion: ExecutionRegion | null = null;

function parseMemoryMapLine(line: string, result: MapFileData): void {
  // 1. 检测 Load Region 头
  const loadMatch = line.match(
    /Load Region (\S+) \(Base: (0x[\da-f]+), Size: (0x[\da-f]+), Max: (0x[\da-f]+)/i
  );
  if (loadMatch) {
    currentLoadRegion = {
      name: loadMatch[1],
      baseAddr: parseInt(loadMatch[2], 16),
      size: parseInt(loadMatch[3], 16),
      maxSize: parseInt(loadMatch[4], 16),
      executionRegions: [],
    };
    result.loadRegions.push(currentLoadRegion);
    return;
  }

  // 2. 检测 Execution Region 头
  const execMatch = line.match(
    /Execution Region (\S+) \(Exec base: (0x[\da-f]+), Load base: (0x[\da-f]+), Size: (0x[\da-f]+), Max: (0x[\da-f]+)/i
  );
  if (execMatch) {
    currentExecRegion = {
      name: execMatch[1],
      execBase: parseInt(execMatch[2], 16),
      loadBase: parseInt(execMatch[3], 16),
      size: parseInt(execMatch[4], 16),
      maxSize: parseInt(execMatch[5], 16),
      sections: [],
    };
    currentLoadRegion?.executionRegions.push(currentExecRegion);
    return;
  }

  // 3. 解析数据行
  const dataMatch = line.match(
    /^\s*(0x[\da-f]+)\s+(0x[\da-f]+|-)\s+(0x[\da-f]+)\s+(Code|Data|Zero|PAD)\s+(RO|RW)\s+(\d+)\s+(\*?)\s*(\S+)\s+(\S+)/i
  );
  if (dataMatch) {
    const sectionName = dataMatch[8];
    const section: MemorySection = {
      execAddr: parseInt(dataMatch[1], 16),
      loadAddr: dataMatch[2] === '-' ? null : parseInt(dataMatch[2], 16),
      size: parseInt(dataMatch[3], 16),
      type: dataMatch[4] as SectionType,
      attr: dataMatch[5] as SectionAttr,
      sectionName,
      objectName: dataMatch[9],
      functionName: extractFunctionName(sectionName, result.compilerVersion),
      isOutlinedFunction: /^\.text\.OUTLINED_FUNCTION_\d+$/.test(sectionName),
    };
    currentExecRegion?.sections.push(section);
  }
}

/**
 * 从 Section Name 中提取函数名
 * AC5: "i.main" → "main", "i.At32UsbInit" → "At32UsbInit"
 * AC6: ".text.main" → "main", ".text.system_clock_config" → "system_clock_config"
 * 其他段（.data, .bss, RESET 等）返回 undefined
 */
function extractFunctionName(sectionName: string, version: CompilerVersion): string | undefined {
  if (version === 'AC5') {
    const m = sectionName.match(/^i\.(.+)$/);
    return m ? m[1] : undefined;
  } else {
    // AC6: .text.xxx 但排除 .text.OUTLINED_FUNCTION_N
    const m = sectionName.match(/^\.text\.(.+)$/);
    if (m && !m[1].startsWith('OUTLINED_FUNCTION_')) {
      return m[1];
    }
    return undefined;
  }
}
```

### 5.3 Component Sizes 解析

```typescript
// src/parser/componentParser.ts

enum ComponentSubState {
  ObjectNames,       // 解析 Object Name 列表
  LibraryMembers,    // 解析 Library Member Name 列表（AC6 特有独立段）
  LibraryNames,      // 解析 Library Name 汇总
  GrandTotals,       // 解析汇总
}

let subState = ComponentSubState.ObjectNames;

function parseComponentLine(line: string, result: MapFileData): void {
  // 跳过空行和分隔线
  if (line.trim() === '' || line.includes('---')) return;

  // 子状态切换
  if (line.includes('Library Member Name')) {
    subState = ComponentSubState.LibraryMembers; return;
  }
  if (line.includes('Library Name')) {
    subState = ComponentSubState.LibraryNames; return;
  }
  if (line.includes('Grand Totals')) {
    subState = ComponentSubState.GrandTotals;
    // 解析同一行的汇总数据
    parseGrandTotals(line, result);
    return;
  }

  // 跳过表头行
  if (line.includes('Code (inc. data)') || line.includes('Object Totals')
      || line.includes('(incl. Generated)') || line.includes('(incl. Padding)')
      || line.includes('Library Totals')) {
    return;
  }

  // 解析数据行: "   4028   266   0   29   336   26376   digital_show.o"
  const match = line.match(
    /^\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s*$/
  );
  if (!match) return;

  const objectName = match[7];
  const libMatch = objectName.match(/^(\S+)\((\S+)\)$/);

  const component: ComponentSize = {
    objectName: libMatch ? libMatch[2] : objectName,
    code: parseInt(match[1]),
    codeIncData: parseInt(match[2]),
    roData: parseInt(match[3]),
    rwData: parseInt(match[4]),
    ziData: parseInt(match[5]),
    debug: parseInt(match[6]),
    library: libMatch ? libMatch[1] : undefined,
    member: libMatch ? libMatch[2] : undefined,
  };

  switch (subState) {
    case ComponentSubState.ObjectNames:
      result.componentSizes.push(component);
      break;
    case ComponentSubState.LibraryMembers:
      result.libraryMembers.push(component);
      break;
    case ComponentSubState.LibraryNames:
      result.librarySizes.push(component);
      break;
  }
}

function parseGrandTotals(line: string, result: MapFileData): void {
  const m = line.match(/^\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
  if (m) {
    result.grandTotals.code = parseInt(m[1]);
    result.grandTotals.roData = parseInt(m[3]);
    result.grandTotals.rwData = parseInt(m[4]);
    result.grandTotals.ziData = parseInt(m[5]);
    result.grandTotals.totalRO = result.grandTotals.code + result.grandTotals.roData;
    result.grandTotals.totalRW = result.grandTotals.rwData + result.grandTotals.ziData;
    result.grandTotals.totalROM = result.grandTotals.totalRO + result.grandTotals.rwData;
  }
}
```

---

## 六、Treemap 数据转换

### 6.1 树结构构建

```typescript
// src/transformer/treeBuilder.ts

/**
 * Region View: 按内存区域组织
 * Root
 * ├── ER_IROM1 (Flash)
 * │   ├── main.o
 * │   │   ├── i.main (Code, 120B)
 * │   │   └── .constdata (RO Data, 40B)
 * │   ├── at32_usb.o
 * │   │   ├── i.At32UsbInit (Code, 72B)
 * │   │   └── i.At32UsbSend (Code, 296B)
 * │   └── [Library] mc_w.l
 * │       ├── memcpya.o (Code, 36B)
 * │       └── uldiv.o (Code, 98B)
 * └── RW_IRAM1 (RAM)
 *     ├── soft_timer.o (.bss, ZI, 576B)
 *     └── custom_hid_class.o (.bss, ZI, 272B)
 */
export function buildRegionTree(data: MapFileData): TreeNode {
  const root: TreeNode = { name: 'root', children: [] };

  for (const loadRegion of data.loadRegions) {
    for (const execRegion of loadRegion.executionRegions) {
      const regionNode: TreeNode = {
        name: execRegion.name,
        children: [],
      };

      // 按 objectName 分组
      const groups = groupBy(execRegion.sections, s => s.objectName);

      for (const [objName, sections] of Object.entries(groups)) {
        // 检测库成员
        const libMatch = objName.match(/^(\S+)\((\S+)\)$/);
        const displayName = libMatch ? `[${libMatch[1]}] ${libMatch[2]}` : objName;

        const objNode: TreeNode = {
          name: displayName,
          children: sections
            .filter(s => s.size > 0)
            .map(s => ({
              name: s.sectionName,
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

      root.children!.push(regionNode);
    }
  }

  return root;
}

/**
 * Module View: 按源文件模块组织
 * Root
 * ├── User Code
 * │   ├── main.o (Code: 120B, RO: 0, RW: 0, ZI: 0)
 * │   ├── digital_show.o (Code: 4028B, RO: 0, RW: 29B, ZI: 336B)
 * │   └── fan_pwm.o (Code: 444B, ...)
 * ├── Chip Library
 * │   ├── at32f425_crm.o
 * │   └── at32f425_tmr.o
 * ├── USB Middleware
 * │   └── usb_core.o
 * └── Compiler Library
 *     ├── mc_w.l
 *     └── mf_w.l
 */
export function buildModuleTree(data: MapFileData): TreeNode {
  const root: TreeNode = { name: 'root', children: [] };

  // 按模块分类（可根据命名规则自动分组）
  const categories = categorizeComponents(data.componentSizes);

  for (const [category, components] of Object.entries(categories)) {
    const catNode: TreeNode = { name: category, children: [] };

    for (const comp of components) {
      const totalSize = comp.code + comp.roData + comp.rwData + comp.ziData;
      if (totalSize === 0) continue;

      const moduleNode: TreeNode = {
        name: comp.objectName,
        children: [
          { name: 'Code', size: comp.code, category: 'code' },
          { name: 'RO Data', size: comp.roData, category: 'rodata' },
          { name: 'RW Data', size: comp.rwData, category: 'rwdata' },
          { name: 'ZI Data', size: comp.ziData, category: 'zidata' },
        ].filter(n => n.size! > 0),
      };
      catNode.children!.push(moduleNode);
    }

    if (catNode.children!.length > 0) {
      root.children!.push(catNode);
    }
  }

  return root;
}

function classifySection(s: MemorySection): string {
  if (s.type === 'Code') return 'code';
  if (s.type === 'Zero') return 'zidata';
  if (s.attr === 'RO') return 'rodata';
  return 'rwdata';
}

function categorizeComponents(components: ComponentSize[]): Record<string, ComponentSize[]> {
  // 自动分类规则 — 通用逻辑，同时兼容 AC5 和 AC6 的命名
  const result: Record<string, ComponentSize[]> = {
    'User Code': [],
    'Chip Library': [],
    'USB/Middleware': [],
    'Compiler Library': [],
    'Third Party': [],
  };

  for (const comp of components) {
    if (comp.library) {
      result['Compiler Library'].push(comp);
    } else if (comp.objectName.match(/^at32f\d+_/)) {
      // 匹配 at32f425_xxx.o, at32f402_405_xxx.o 等雅特力芯片库
      result['Chip Library'].push(comp);
    } else if (comp.objectName.match(/usb|hid|winusb|usbd_/i)) {
      result['USB/Middleware'].push(comp);
    } else if (comp.objectName.match(/^lv_|^lfs|lvgl/)) {
      // LVGL 图形库、LittleFS 文件系统等第三方库
      result['Third Party'].push(comp);
    } else {
      result['User Code'].push(comp);
    }
  }

  // 移除空分类
  for (const key of Object.keys(result)) {
    if (result[key].length === 0) delete result[key];
  }

  return result;
}
```

---

## 七、可视化方案

### 7.1 Webview 中的 D3 Treemap 渲染

```javascript
// media/treemap.js

// 接收来自 Extension Host 的数据
window.addEventListener('message', event => {
  const { type, data } = event.data;
  if (type === 'updateTreemap') {
    renderTreemap(data.tree, data.summary, data.viewMode);
  }
});

function renderTreemap(treeData, summary, viewMode) {
  const container = document.getElementById('treemap-container');
  const width = container.clientWidth;
  const height = container.clientHeight;

  // 清空旧内容
  d3.select('#treemap-container').selectAll('*').remove();

  // 构建层级结构
  const root = d3.hierarchy(treeData)
    .sum(d => d.size || 0)
    .sort((a, b) => b.value - a.value);

  // Treemap 布局
  d3.treemap()
    .size([width, height])
    .paddingTop(20)        // 为分组标题留空间
    .paddingInner(2)
    .paddingOuter(4)
    .round(true)
    (root);

  // 渲染 SVG
  const svg = d3.select('#treemap-container')
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  // 绘制叶子节点矩形
  const leaves = svg.selectAll('g')
    .data(root.leaves())
    .join('g')
    .attr('transform', d => `translate(${d.x0},${d.y0})`);

  leaves.append('rect')
    .attr('width', d => d.x1 - d.x0)
    .attr('height', d => d.y1 - d.y0)
    .attr('fill', d => getColor(d.data.category))
    .attr('stroke', '#fff')
    .attr('stroke-width', 0.5)
    .style('opacity', 0.85);

  // 添加文本标签（仅当矩形足够大时）
  leaves.append('text')
    .filter(d => (d.x1 - d.x0) > 40 && (d.y1 - d.y0) > 14)
    .attr('x', 4)
    .attr('y', 14)
    .text(d => d.data.name)
    .attr('font-size', '11px')
    .attr('fill', '#fff');

  // 添加大小标签
  leaves.append('text')
    .filter(d => (d.x1 - d.x0) > 50 && (d.y1 - d.y0) > 28)
    .attr('x', 4)
    .attr('y', 28)
    .text(d => formatSize(d.value))
    .attr('font-size', '10px')
    .attr('fill', 'rgba(255,255,255,0.7)');

  // 分组标题（父节点）
  const parents = svg.selectAll('.parent-label')
    .data(root.descendants().filter(d => d.depth === 1))
    .join('text')
    .attr('class', 'parent-label')
    .attr('x', d => d.x0 + 4)
    .attr('y', d => d.y0 + 14)
    .text(d => `${d.data.name} (${formatSize(d.value)})`)
    .attr('font-size', '12px')
    .attr('font-weight', 'bold')
    .attr('fill', 'var(--vscode-foreground)');

  // Tooltip
  setupTooltip(leaves);

  // 更新内存使用率显示
  updateSummaryBar(summary);
}
```

### 7.2 颜色方案

```javascript
const COLOR_MAP = {
  code:   '#4A90D9',  // 蓝色 — 代码段
  rodata: '#50B86C',  // 绿色 — 只读数据
  rwdata: '#E8943A',  // 橙色 — 读写数据
  zidata: '#E05252',  // 红色 — 零初始化数据
  pad:    '#888888',  // 灰色 — 填充
};

function getColor(category) {
  return COLOR_MAP[category] || '#666';
}
```

### 7.3 交互功能

```javascript
// Tooltip 悬停提示
function setupTooltip(selection) {
  const tooltip = d3.select('#tooltip');

  selection
    .on('mouseover', (event, d) => {
      tooltip.style('display', 'block')
        .html(`
          <strong>${d.data.name}</strong><br/>
          Object: ${d.data.objectFile || d.parent?.data.name}<br/>
          Size: ${formatSize(d.value)}<br/>
          Type: ${d.data.category}<br/>
          ${d.data.address ? 'Address: 0x' + d.data.address.toString(16).padStart(8, '0') : ''}
        `);
    })
    .on('mousemove', event => {
      tooltip
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px');
    })
    .on('mouseout', () => {
      tooltip.style('display', 'none');
    });
}

// 搜索高亮
function searchHighlight(keyword) {
  d3.selectAll('rect')
    .style('opacity', function(d) {
      if (!keyword) return 0.85;
      const match = d.data.name.toLowerCase().includes(keyword.toLowerCase())
        || (d.data.objectFile || '').toLowerCase().includes(keyword.toLowerCase());
      return match ? 1.0 : 0.2;
    });
}

// 点击下钻
function setupDrillDown(svg, root) {
  svg.selectAll('g').on('click', (event, d) => {
    if (d.children) {
      // 下钻到子节点
      zoomTo(d);
    }
  });
}

// 格式化大小
function formatSize(bytes) {
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}
```

### 7.4 内存使用率条

```html
<!-- 顶部工具栏 -->
<div id="toolbar">
  <div class="memory-bar">
    <span>ROM/Flash:</span>
    <div class="progress-bar">
      <div class="progress-fill rom-fill" style="width: 28%"></div>
    </div>
    <span class="usage-text">18.18 KB / 64 KB (28.4%)</span>
  </div>
  <div class="memory-bar">
    <span>RAM:</span>
    <div class="progress-bar">
      <div class="progress-fill ram-fill" style="width: 18%"></div>
    </div>
    <span class="usage-text">3.75 KB / 20 KB (18.8%)</span>
  </div>
  <div class="controls">
    <select id="view-mode">
      <option value="region">Region View</option>
      <option value="module">Module View</option>
    </select>
    <input type="text" id="search" placeholder="Search module/function..." />
  </div>
</div>
```

---

## 八、VSCode 插件配置

### 8.1 package.json

```json
{
  "name": "keil-map-heatmap",
  "displayName": "Keil MAP Heatmap",
  "description": "Visualize Keil ARM Compiler .map files as interactive treemap heatmaps",
  "version": "0.1.0",
  "publisher": "your-publisher-id",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Visualization"],
  "keywords": ["keil", "arm", "map", "memory", "heatmap", "treemap", "embedded"],
  "activationEvents": [
    "onLanguage:map",
    "workspaceContains:**/*.map"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "keilMapHeatmap.openFile",
        "title": "Open MAP Heatmap",
        "category": "Keil MAP"
      },
      {
        "command": "keilMapHeatmap.openActive",
        "title": "Show Heatmap for Current File",
        "category": "Keil MAP"
      }
    ],
    "menus": {
      "explorer/context": [
        {
          "command": "keilMapHeatmap.openFile",
          "when": "resourceExtname == .map",
          "group": "navigation"
        }
      ],
      "editor/title": [
        {
          "command": "keilMapHeatmap.openActive",
          "when": "resourceExtname == .map",
          "group": "navigation"
        }
      ]
    },
    "languages": [
      {
        "id": "map",
        "extensions": [".map"],
        "aliases": ["Keil MAP File"]
      }
    ]
  },
  "scripts": {
    "build": "esbuild src/extension.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs --platform=node",
    "watch": "npm run build -- --watch",
    "package": "vsce package",
    "test": "vitest"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "@vscode/vsce": "^2.22.0",
    "esbuild": "^0.19.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  },
  "dependencies": {
    "d3-hierarchy": "^3.1.2",
    "d3-treemap": "^3.1.2"
  }
}
```

### 8.2 插件入口

```typescript
// src/extension.ts
import * as vscode from 'vscode';
import { parseMapFile } from './parser';
import { buildRegionTree, buildModuleTree } from './transformer/treeBuilder';
import { WebviewProvider } from './webview/WebviewProvider';

export function activate(context: vscode.ExtensionContext) {
  // 命令：通过文件选择器打开
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

  // 命令：打开当前编辑器中的 .map 文件
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
  const content = await vscode.workspace.fs.readFile(uri);
  const text = Buffer.from(content).toString('utf-8');

  const mapData = parseMapFile(text);
  const regionTree = buildRegionTree(mapData);
  const moduleTree = buildModuleTree(mapData);

  const summary = {
    rom: {
      used: mapData.grandTotals.totalROM,
      total: mapData.loadRegions[0]?.executionRegions[0]?.maxSize || 0,
      percent: 0,
    },
    ram: {
      used: mapData.grandTotals.totalRW,
      total: mapData.loadRegions[0]?.executionRegions[1]?.maxSize || 0,
      percent: 0,
    },
  };
  summary.rom.percent = summary.rom.total > 0
    ? (summary.rom.used / summary.rom.total) * 100 : 0;
  summary.ram.percent = summary.ram.total > 0
    ? (summary.ram.used / summary.ram.total) * 100 : 0;

  const provider = new WebviewProvider(context.extensionUri);
  provider.show(uri.fsPath, { regionTree, moduleTree, summary });
}

export function deactivate() {}
```

### 8.3 Webview Provider

```typescript
// src/webview/WebviewProvider.ts
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

    this.panel.webview.html = this.getHtml(this.panel.webview);

    // 等 Webview 加载完成后发送数据
    this.panel.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'ready') {
        this.panel!.webview.postMessage({
          type: 'updateTreemap',
          data: {
            tree: data.regionTree,
            summary: data.summary,
            viewMode: 'region',
          },
        });
      }
      if (msg.type === 'switchView') {
        const tree = msg.viewMode === 'module' ? data.moduleTree : data.regionTree;
        this.panel!.webview.postMessage({
          type: 'updateTreemap',
          data: { tree, summary: data.summary, viewMode: msg.viewMode },
        });
      }
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const d3Uri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'd3.min.js')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'treemap.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'style.css')
    );

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="toolbar">
    <div class="memory-bars">
      <div class="memory-bar" id="rom-bar"></div>
      <div class="memory-bar" id="ram-bar"></div>
    </div>
    <div class="controls">
      <select id="view-mode">
        <option value="region">Region View</option>
        <option value="module">Module View</option>
      </select>
      <input type="text" id="search" placeholder="Search..." />
    </div>
  </div>
  <div id="treemap-container"></div>
  <div id="tooltip"></div>
  <script src="${d3Uri}"></script>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
```

---

## 九、Webview 样式

```css
/* media/style.css */
:root {
  --bg: var(--vscode-editor-background);
  --fg: var(--vscode-editor-foreground);
  --border: var(--vscode-panel-border);
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: var(--bg);
  color: var(--fg);
  font-family: var(--vscode-font-family);
  font-size: 13px;
  overflow: hidden;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

#toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.memory-bars { display: flex; gap: 16px; flex: 1; }

.memory-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-bar {
  width: 120px;
  height: 8px;
  background: var(--vscode-progressBar-background, #333);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s;
}

.rom-fill { background: #4A90D9; }
.ram-fill { background: #E05252; }

.controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

#view-mode, #search {
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  padding: 4px 8px;
  border-radius: 3px;
  font-size: 12px;
}

#search { width: 180px; }

#treemap-container {
  flex: 1;
  overflow: hidden;
  position: relative;
}

#tooltip {
  display: none;
  position: absolute;
  background: var(--vscode-editorHoverWidget-background);
  border: 1px solid var(--vscode-editorHoverWidget-border);
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.5;
  pointer-events: none;
  z-index: 1000;
  max-width: 300px;
}
```

---

## 十、分阶段实现计划

### Phase 1 — MVP（核心可用）

1. 初始化项目：`npm init`、安装依赖、配置 esbuild
2. 实现 MAP 文件解析器（同时支持 AC5 和 AC6，Memory Map 段 + Component Sizes 段）
3. 实现 Region View 的 treemap 数据转换
4. 创建 Webview，用 D3.js 渲染基础 treemap
5. 实现 tooltip 悬停提示
6. 显示 ROM/RAM 使用率进度条
7. 注册命令和右键菜单

### Phase 2 — 增强交互

8. 添加 Module View 视图切换
9. 实现搜索高亮功能
10. 添加点击下钻/缩放
11. 响应窗口大小变化重新布局
12. 添加图例（颜色含义说明）

### Phase 3 — 高级功能

13. 文件变化自动刷新（FileSystemWatcher）
14. 导出为 PNG/SVG 图片
15. 多 MAP 文件对比（diff 视图，显示大小变化）
16. 状态栏显示当前项目内存使用概要
17. AC6 OUTLINED_FUNCTION 归并显示（将同一 .o 的多个 OUTLINED_FUNCTION 合并为一个节点）

---

## 十一、测试验证

### 单元测试

```typescript
// test/parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseMapFile } from '../src/parser';
import { readFileSync } from 'fs';

describe('MAP Parser - AC5', () => {
  const content = readFileSync('test/fixtures/AK620-GEN2.map', 'utf-8');
  const result = parseMapFile(content);

  it('should detect AC5 compiler', () => {
    expect(result.compilerVersion).toBe('AC5');
  });

  it('should parse load regions', () => {
    expect(result.loadRegions).toHaveLength(1);
    expect(result.loadRegions[0].name).toBe('LR_IROM1');
    expect(result.loadRegions[0].baseAddr).toBe(0x08000000);
    expect(result.loadRegions[0].maxSize).toBe(0x00010000); // 64KB
  });

  it('should parse execution regions', () => {
    const regions = result.loadRegions[0].executionRegions;
    expect(regions).toHaveLength(2);
    expect(regions[0].name).toBe('ER_IROM1');
    expect(regions[1].name).toBe('RW_IRAM1');
  });

  it('should parse AC5 section names (i.xxx format)', () => {
    const sections = result.loadRegions[0].executionRegions[0].sections;
    const usbInit = sections.find(s => s.sectionName === 'i.At32UsbInit');
    expect(usbInit).toBeDefined();
    expect(usbInit?.functionName).toBe('At32UsbInit');
  });

  it('should parse component sizes', () => {
    const digitalShow = result.componentSizes.find(c => c.objectName === 'digital_show.o');
    expect(digitalShow?.code).toBe(4028);
  });

  it('should calculate grand totals', () => {
    expect(result.grandTotals.totalROM).toBe(18620);
    expect(result.grandTotals.totalRW).toBe(3840);
  });
});

describe('MAP Parser - AC6', () => {
  const content = readFileSync('test/fixtures/LM_Series_APP.map', 'utf-8');
  const result = parseMapFile(content);

  it('should detect AC6 compiler', () => {
    expect(result.compilerVersion).toBe('AC6');
  });

  it('should parse AC6 section names (.text.xxx format)', () => {
    const sections = result.loadRegions[0].executionRegions[0].sections;
    const clockConfig = sections.find(s => s.sectionName === '.text.system_clock_config');
    expect(clockConfig).toBeDefined();
    expect(clockConfig?.functionName).toBe('system_clock_config');
  });

  it('should detect OUTLINED_FUNCTION sections', () => {
    const sections = result.loadRegions[0].executionRegions[0].sections;
    const outlined = sections.filter(s => s.isOutlinedFunction);
    expect(outlined.length).toBeGreaterThan(0);
  });

  it('should parse library members', () => {
    expect(result.libraryMembers.length).toBeGreaterThan(0);
  });

  it('should calculate grand totals', () => {
    expect(result.grandTotals.totalROM).toBe(185532);
    expect(result.grandTotals.totalRW).toBe(91400);
  });
});
```

### 手动验证步骤

1. `npm run build` 编译无错误
2. 按 F5 启动 Extension Development Host
3. 打开包含 `.map` 文件的文件夹
4. 右键 `.map` 文件 → "Open MAP Heatmap"
5. 分别用 AC5 文件（AK620-GEN2.map）和 AC6 文件（LM_Series_APP.map）测试
6. 验证 treemap 正确渲染，颜色区分正确
7. 悬停查看 tooltip 信息（AC6 应显示 .text.xxx 格式的函数名）
8. 切换 Region/Module 视图
9. 搜索框输入模块名，验证高亮效果
10. 检查 ROM/RAM 使用率数值是否与 .map 文件末尾的 Grand Totals 一致

---

## 十二、注意事项

1. **D3.js 需要本地打包**：Webview 无法访问 CDN，需将 `d3.min.js` 放在 `media/` 目录下。推荐使用 d3 v7 的自定义 bundle（仅包含 d3-hierarchy、d3-selection、d3-scale、d3-color）以减小体积。

2. **编码处理**：部分 MAP 文件可能是 GBK 编码（中文路径），需要检测并转换。

3. **大文件性能**：AC6 项目的 MAP 文件可能超过 25000 行（如 LM_Series_APP.map 有 24837 行），解析器应避免不必要的正则回溯，使用逐行流式处理。

4. **AC5 vs AC6 关键差异总结**：
   - AC5 函数段: `i.函数名`，AC6 函数段: `.text.函数名`
   - AC6 有 `.ARM.exidx.text.xxx` 异常处理索引段（通常很小，8字节），可在 treemap 中合并或隐藏
   - AC6 有 `OUTLINED_FUNCTION_N`（编译器提取的公共代码片段），同名段可出现在不同 .o 文件中
   - AC6 标准库名为 `c_w.l`、`m_wm.l`、`fz_wm.l`；AC5 为 `mc_w.l`、`mf_w.l`
   - AC6 Component Sizes 段有独立的 "Library Member Name" 子段

5. **Webview 安全**：使用 `nonce` 限制脚本执行，遵循 VSCode Webview 安全最佳实践。

6. **测试数据**：项目目录下有两个真实 MAP 文件可用于测试：
   - `AK620-GEN2.map` — AC5 编译，AT32F425 芯片，2912 行，ROM 18KB/64KB
   - `LM_Series_APP.map` — AC6 编译，AT32F402/405 芯片，24837 行，ROM 181KB/220KB
