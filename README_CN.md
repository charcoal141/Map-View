# Map View

<p align="center">
  <img src="https://raw.githubusercontent.com/charcoal141/Map-View/main/screenshots/logo.png" width="256" alt="Map View Logo">
</p>

[English](README.md) | [中文](README_CN.md)

嵌入式 `.map` 文件的交互式 Treemap 可视化工具 — 一眼看清固件内存和flash分布。

支持 **Keil MDK (ARM)**、**GCC (GNU ld)**、**ESP-IDF**、**匠芯创 (RISC-V)** 工具链。

![总览](https://raw.githubusercontent.com/charcoal141/Map-View/main/screenshots/1.png)

## 功能特性

- **Treemap 热力图** — 用色块大小直观展示 ROM/RAM 占用
- **下钻导航** — 点击模块查看内部函数和段的详细分布
- **多工具链支持** — Keil、GCC/ld、ESP-IDF、匠芯创 D13x 的 .map 文件通吃
- **颜色分类** — 蓝色 Code、绿色 RO-Data、橙色 RW-Data、红色 ZI-Data，一目了然
- **搜索功能** — 快速定位任意符号、模块或库
- **可配置内存大小** — 设置实际 ROM/RAM 总量，显示准确的使用百分比
- **零依赖** — 纯 TypeScript 实现，无外部运行时依赖

![下钻视图](https://raw.githubusercontent.com/charcoal141/Map-View/main/screenshots/2.png)

## 快速开始

1. 在 VS Code 中打开任意 `.map` 文件
2. 右键 → **Open Map View**，或点击编辑器标题栏按钮
3. 点击模块下钻查看详情，点击 "Back" 返回上层

## 支持的格式

| 工具链 | 编译器 | 示例芯片 |
|--------|--------|----------|
| Keil MDK | ARMCC / ARM Compiler 6 | STM32、AT32、GD32 |
| GCC (GNU ld) | arm-none-eabi-gcc、riscv-gcc | 任意 ARM/RISC-V |
| ESP-IDF | xtensa-gcc、riscv32-gcc | ESP32、ESP32-S3、ESP32-C3 |
| 匠芯创 | riscv64-unknown-elf-gcc | D13x、D12x |

![ESP-IDF 支持](https://raw.githubusercontent.com/charcoal141/Map-View/main/screenshots/3.png)

## 配置

点击工具栏齿轮图标设置 ROM/RAM 大小（单位 KB），用于计算准确的使用百分比。配置按文件名独立存储在 `.vscode/settings.json` 中。

![匠芯创 RISC-V 支持](https://raw.githubusercontent.com/charcoal141/Map-View/main/screenshots/4.png)

## 安装

```bash
# 从源码
git clone https://github.com/charcoal141/Map-View.git
cd map-view
npm install
npm run build
# 在 VS Code 中按 F5 启动扩展开发宿主
```

## 命令

| 命令 | 说明 |
|------|------|
| `Map View: Open Map View` | 通过文件选择器打开 .map 文件 |
| `Map View: Show Map View for Current File` | 可视化当前编辑器中的 .map 文件 |

## License

MIT
