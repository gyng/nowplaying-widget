# widgetsack

A themable, Rainmeter-style desktop widget overlay for Windows. Put system meters
(CPU, per-core, GPU/VRAM, memory, network), clocks, and the currently-playing track on a
transparent, click-through overlay across all your monitors — and arrange them with a
built-in visual editor.

> Evolved from `nowplaying-widget`; the now-playing widget is still built in.

[.msi download for the latest release](https://github.com/gyng/nowplaying-widget/releases/latest)

|                                                             |                                                             |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| ![screenshot-a](widgetsack/docs/screenshot-a.jpg)           | ![screenshot-b](widgetsack/docs/screenshot-b.jpg)           |

## Features

- **Meters:** radial gauges, bars, sparklines, text readouts, clocks, and a now-playing
  widget — driven by a sensor + meter model (à la Rainmeter measures/meters).
- **Sensors:** CPU total + per-core, memory, swap, network up/down (bytes/sec), and
  NVIDIA GPU util / VRAM / temp (via NVML; degrades gracefully without an NVIDIA GPU).
- **Now playing:** Windows media (GSMTC) — anything in the Windows audio flyout
  (Spotify / foobar2000 / Chrome / Firefox)
  ([GSMTC support table](https://github.com/ModernFlyouts-Community/ModernFlyouts/blob/main/docs/GSMTC-Support-And-Popular-Apps.md)).
- **Overlay:** transparent, always-on-top, click-through window filling each monitor.
  Multi-monitor (one overlay per monitor; widgets are bound to a monitor).
- **Visual editor:** toggle edit mode (tray menu or `Ctrl+Alt+E`) to drag, resize,
  snap-to-grid, add/remove widgets, and edit their config — saved to `widgets.json` with
  live reload.
- **Theming:** per-widget user CSS; system fonts.
- Built with Tauri + React.

## Usage

Download the installer msi from the [latest release](https://github.com/gyng/nowplaying-widget/releases/latest).

The overlay starts passive (click-through). To arrange widgets:

1. **Enter edit mode** — the tray icon's **"Edit layout"**, or press **`Ctrl+Alt+E`**.
2. Drag widgets to move, drag the handles to resize. Use the **palette** (bottom-left) to
   add widgets and the **inspector** to edit a selected widget's sensor / position / config.
3. **Exit edit mode** the same way. The layout saves to `widgets.json` (in the app config
   dir) and reloads automatically if you hand-edit that file.

### Theming

Each widget can take a CSS override. Eg, to turn images grayscale:

```css
img {
  filter: grayscale(1);
}
```

### Now playing — source priority

If multiple audio sources are active, a priority list of executable names decides which to
show (reachable in edit mode; "All media" lists the current sources).

### Autostart

Add `widgetsack.exe` to Startup apps in Task Manager.

## Feature ideas

- Desktop-pinned widget layer (behind windows, à la wallpaper engines)
- Editor alignment guides / snap-to-other-widgets
- Widget bundles (JS/HTML/CSS); more sensors (lyrics, spectrogram, temps/fans)

## Development

Contributions welcome. The architecture and roadmap live in
[docs/widget-platform.md](docs/widget-platform.md).

### Getting started

> **Note**  
> widgetsack has to be built on Windows.

Install [Tauri prerequisites](https://tauri.app/start/prerequisites/) first, plus a current
**v2** Tauri CLI (the project uses tauri 2.11):

```sh
# if `cargo tauri` is missing or older than 2.x:
$ cargo install tauri-cli --version "^2" --locked
```

```sh
# Install client dependencies first
$ (cd client && npm i)

# Run the full app in dev (Tauri starts the Vite dev server for you)
$ cargo tauri dev

# Build the frontend before the Rust checks — Tauri embeds client/build,
# so cargo test/clippy fail if it is missing
$ (cd client && npm run build)
$ cargo test
$ cargo clippy

# If needed; output is target/release/widgetsack.exe
$ cargo tauri build

# Client tests and checks (run from client/)
$ (cd client && npm run test:unit)   # Vitest unit/component tests
$ (cd client && npm run check)       # tsc --noEmit type checking
$ (cd client && npm run lint)        # Prettier + ESLint
```

### Release

1. Bump the version in [widgetsack/tauri.conf.json](widgetsack/tauri.conf.json)
2. Create a new release on the [releases](https://github.com/gyng/nowplaying-widget/releases) page.

## Links

- https://rfdonnelly.github.io/posts/tauri-async-rust-process/#the-async-process
- https://github.com/Nerixyz/current-song2
