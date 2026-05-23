# Map View 项目架构文档

本文档面向不熟悉前端开发的读者，用通俗的语言解释这个项目是什么、怎么工作的。

---

## 一、这个项目是什么

Map View 是一个 **VS Code 插件**。它的作用是：把嵌入式编译器生成的 `.map` 文件，用**热力图（Treemap）**的方式可视化展示出来。

### 什么是 .map 文件？

当你用 Keil、GCC、ESP-IDF 等工具链编译嵌入式程序时，链接器会生成一个 `.map` 文件。这个文件是纯文本，记录了：
- 每个函数占了多少字节
- 每个变量占了多少 RAM
- 每个库用了多少 Flash
- 各个内存区域的分布情况

但 `.map` 文件动辄几千行，人眼很难快速看出"哪个模块最占空间"。

### Map View 做了什么？

它把 `.map` 文件解析成结构化数据，然后用**面积代表大小**的方块图展示出来。方块越大，占的内存越多。颜色代表类型：
- 蓝色 = 代码（Code）
- 绿色 = 只读数据（RO-Data）
- 橙色 = 读写数据（RW-Data）
- 红色 = 零初始化数据（ZI-Data）

---

## 二、项目文件结构

```
├── src/                    # TypeScript 源代码（插件逻辑）
│   ├── extension.ts        # 插件入口，注册命令
│   ├── parser/             # 解析器：把 .map 文本变成结构化数据
│   │   ├── index.ts        # Keil/GCC 解析器主逻辑
│   │   ├── esp32Parser.ts  # ESP-IDF/GNU ld 格式专用解析器
│   │   └── types.ts        # 数据类型定义
│   ├── transformer/        # 转换器：把解析结果变成树形结构
│   │   └── treeBuilder.ts  # 构建 Treemap 需要的树
│   └── webview/            # 界面提供者：生成 HTML 页面
│       └── WebviewProvider.ts
├── media/                  # 前端资源（在 VS Code 内部网页中运行）
│   ├── treemap.js          # Treemap 渲染逻辑（纯 JS，无框架）
│   └── style.css           # 样式
├── dist/                   # 编译输出（被 .gitignore 忽略）
├── package.json            # 插件配置 + npm 依赖
└── screenshots/            # README 用的截图
```

---

## 三、核心流程（数据怎么从文件变成图）

```
.map 文件（纯文本）
    │
    ▼
┌─────────────────────────┐
│  Parser（解析器）         │  逐行读取文本，用正则表达式提取信息
│  src/parser/index.ts     │  输出：MapFileData（结构化数据）
└─────────────────────────┘
    │
    ▼
┌─────────────────────────┐
│  TreeBuilder（树构建器）  │  把扁平数据组织成父子层级
│  src/transformer/        │  输出：TreeNode（树形结构）
└─────────────────────────┘
    │
    ▼
┌─────────────────────────┐
│  WebviewProvider         │  生成一个 HTML 页面，把树数据注入进去
│  src/webview/            │  输出：HTML + 内嵌 JSON 数据
└─────────────────────────┘
    │
    ▼
┌─────────────────────────┐
│  treemap.js（前端渲染）   │  在 VS Code 内嵌浏览器中运行
│  media/treemap.js        │  用 Squarify 算法把树画成方块图
└─────────────────────────┘
```

---

## 四、各模块详解

### 4.1 Parser（解析器）

**位置**：`src/parser/index.ts` + `src/parser/esp32Parser.ts`

**作用**：读取 `.map` 文件的文本内容，逐行匹配正则表达式，提取出内存分布信息。

**支持的格式**：
| 格式 | 识别方式 | 解析器 |
|------|----------|--------|
| Keil MDK (AC5/AC6) | 首行包含 "Arm Compiler" | `parseMapFile()` |
| GCC / ESP-IDF / ArtInChip | 包含 "Memory Configuration" | `parseEsp32MapFile()` |

**输出数据结构**（`MapFileData`）：
- `loadRegions` — 加载区域 → 执行区域 → 各个内存段（函数、变量等）
- `componentSizes` — 每个 .o 文件占了多少 Code/RO/RW/ZI
- `grandTotals` — 总计：ROM 用了多少、RAM 用了多少

### 4.2 TreeBuilder（树构建器）

**位置**：`src/transformer/treeBuilder.ts`

**作用**：把解析器输出的扁平数据，组织成 Treemap 需要的**树形结构**。

提供两种视图：
- **Region View**（区域视图）：按内存区域 → 模块 → 函数 的层级展示
- **Module View**（模块视图）：按分类（用户代码/芯片库/第三方库）→ 模块 → Code/RO/RW/ZI 展示

还负责计算 **ROM/RAM 使用率**（百分比进度条的数据来源）。

### 4.3 WebviewProvider（界面提供者）

**位置**：`src/webview/WebviewProvider.ts`

**作用**：在 VS Code 中打开一个内嵌网页面板（Webview），把树数据以 JSON 形式注入到 HTML 中。

关键点：
- VS Code 插件本身运行在 Node.js 环境，不能直接画图
- 所以它生成一个 HTML 页面，在 VS Code 内部的浏览器中渲染
- 数据通过 `window.__DATA__ = {...}` 传递给前端 JS

### 4.4 treemap.js（前端渲染）

**位置**：`media/treemap.js`

**作用**：接收树数据，用 **Squarify 算法**计算每个方块的位置和大小，然后用 DOM 元素画出来。

核心功能：
- **Squarify 布局**：一种让方块尽量接近正方形的算法（避免出现又长又窄的条）
- **下钻导航**：点击模块可以看到内部函数的分布
- **搜索高亮**：输入关键词，匹配的方块保持不透明，其余变淡
- **Tooltip**：鼠标悬停显示详细信息（名称、大小、地址）

---

## 五、技术栈

| 技术 | 用途 |
|------|------|
| TypeScript | 插件主逻辑（解析、构建树、生成 HTML） |
| esbuild | 把 TypeScript 编译打包成单个 JS 文件 |
| VS Code Extension API | 注册命令、打开 Webview、读取配置 |
| 原生 JavaScript | 前端 Treemap 渲染（无 React/Vue 等框架） |
| CSS | 样式（进度条、方块颜色、Tooltip） |

**零运行时依赖**：打包后的插件不依赖任何第三方库，所有逻辑都是自己实现的。

---

## 六、构建和运行

```bash
# 安装开发依赖
npm install

# 编译 TypeScript → dist/extension.js
npm run build

# 在 VS Code 中按 F5 启动调试（打开 Extension Development Host）
```

编译过程：`src/extension.ts` → (esbuild 打包) → `dist/extension.js`

`media/` 目录下的文件不需要编译，直接被 Webview 加载。

---

## 七、数据流示意（以打开一个 Keil .map 文件为例）

1. 用户在 VS Code 中右键点击 `.map` 文件 → "Open Map View"
2. `extension.ts` 读取文件内容（纯文本）
3. 调用 `parseMapFile(text)` → 得到 `MapFileData`
4. 调用 `buildRegionTree(data)` → 得到区域视图的树
5. 调用 `buildModuleTree(data)` → 得到模块视图的树
6. 调用 `buildMemorySummary(data)` → 得到 ROM/RAM 使用率
7. `WebviewProvider.show()` 生成 HTML，把三份数据注入 `window.__DATA__`
8. VS Code 打开 Webview 面板，加载 HTML
9. `treemap.js` 读取 `window.__DATA__`，执行 Squarify 布局，渲染方块图
10. 用户可以切换视图、搜索、下钻、配置内存大小

---

## 八、关键概念解释

### Treemap（树形图/热力图）
一种用嵌套矩形表示层级数据的可视化方式。每个矩形的面积与其数值成正比。

### Squarify 算法
Treemap 的布局算法。目标是让每个矩形尽量接近正方形（而不是细长条），这样更容易阅读。

### Webview
VS Code 提供的一种机制，允许插件在编辑器中嵌入一个网页。类似于在 VS Code 里开了一个浏览器标签页。

### ROM vs RAM
- **ROM（Flash）**：存储程序代码和常量，断电不丢失。对应 Code + RO-Data + RW-Data 的初始值。
- **RAM**：运行时使用的内存，存储变量。对应 RW-Data + ZI-Data。

### 内存段类型
- **Code**：机器指令（函数编译后的二进制）
- **RO-Data**：只读数据（字符串常量、查找表等）
- **RW-Data**：有初始值的全局/静态变量
- **ZI-Data**：零初始化的全局/静态变量（不占 Flash，只占 RAM）
