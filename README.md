# Map View

<p align="center">
  <img src="https://raw.githubusercontent.com/charcoal141/Map-View/main/screenshots/logo.png" width="128" alt="Map View Logo">
</p>

[English](README.md) | [中文](README_CN.md)

Interactive treemap visualization for embedded `.map` files — see where your firmware memory and flash goes at a glance.

Supports **Keil MDK (ARM)**, **GCC (GNU ld)**, **ESP-IDF**, and **ArtInChip (RISC-V)** toolchains.

![Overview](https://raw.githubusercontent.com/charcoal141/Map-View/main/screenshots/1.png)

## Features

- **Treemap heatmap** — visualize ROM/RAM usage as color-coded blocks, sized by bytes
- **Drill-down navigation** — click any module to explore its internal functions and sections
- **Multi-toolchain support** — Keil `.map`, GCC/ld `.map`, ESP-IDF `.map`, ArtInChip D13x `.map`
- **Color-coded categories** — instantly distinguish Code, RO-Data, RW-Data, and ZI-Data
- **Search** — find any symbol, module, or library across the entire map
- **Configurable memory size** — set actual ROM/RAM totals for accurate percentage display
- **Zero dependencies** — pure TypeScript, no external runtime libraries

![Drill-down view](https://raw.githubusercontent.com/charcoal141/Map-View/main/screenshots/2.png)

## Quick Start

1. Open any `.map` file in VS Code
2. Right-click → **Open Map View**, or click the title bar button
3. Click modules to drill down, click "Back" to navigate up

## Supported Formats

| Toolchain | Compiler | Example Chips |
|-----------|----------|---------------|
| Keil MDK | ARMCC / ARM Compiler 6 | STM32, AT32, GD32 |
| GCC (GNU ld) | arm-none-eabi-gcc, riscv-gcc | Any ARM/RISC-V with ld |
| ESP-IDF | xtensa-gcc, riscv32-gcc | ESP32, ESP32-S3, ESP32-C3 |
| ArtInChip | riscv64-unknown-elf-gcc | D13x, D12x |

![ESP-IDF support](https://raw.githubusercontent.com/charcoal141/Map-View/main/screenshots/3.png)

## Configuration

Click the gear icon in the toolbar to set ROM/RAM sizes (in KB) for accurate usage percentages. Settings are stored per-file in `.vscode/settings.json`.

![ArtInChip RISC-V support](https://raw.githubusercontent.com/charcoal141/Map-View/main/screenshots/4.png)

## Install

```bash
# From source
git clone https://github.com/charcoal141/Map-View.git
cd map-view
npm install
npm run build
# Then press F5 in VS Code to launch Extension Development Host
```

## Commands

| Command | Description |
|---------|-------------|
| `Map View: Open Map View` | Open a .map file via file picker |
| `Map View: Show Map View for Current File` | Visualize the active editor's .map file |

## License

MIT
