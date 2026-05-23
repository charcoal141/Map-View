# Map View

<p align="center">
  <img src="https://raw.githubusercontent.com/charcoal141/Map-View/main/screenshots/logo.png" width="400" alt="Map View Logo">
</p>

[English](README.md) | [中文](README_CN.md)

嵌入式 `.map` 文件的 Treemap 可视化 VS Code 插件 — 一眼看清固件内存和flash分布。

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
- **超级轻量** — 总共仅 ~100 KB，秒装秒开

![下钻视图](https://raw.githubusercontent.com/charcoal141/Map-View/main/screenshots/2.png)

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

1. 打开 VS Code
2. 进入扩展面板（`Ctrl+Shift+X`）
3. 搜索 **"Map View Embedded"**
4. 点击 **安装**

## 快速开始

1. 使用 `Ctrl+P` 搜索定位项目中的 `map` 文件
2. 右键 → **Open Map View**
3. 点击模块下钻查看详情，点击 "Back" 返回上层

![快速开始](https://raw.githubusercontent.com/charcoal141/Map-View/main/screenshots/5.png)


## 注意事项

- 显示的 ROM/RAM 用量完全基于 `.map` 文件中的信息。外部存储（如片外 Flash、外部 SRAM）或链接器未报告的区域不会自动显示。
- 如果显示的总量不准确，请点击工具栏齿轮图标手动配置目标硬件的实际 ROM/RAM 大小。

## License

MIT
