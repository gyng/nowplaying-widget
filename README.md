# np-widget

Shows the currently playing track in a themable widget on Windows.

Download: check the [releases page](https://github.com/gyng/np-widget/releases).

|                                                       |                                                       |
| ----------------------------------------------------- | ----------------------------------------------------- |
| ![np/docs/screenshot-a.jpg](np/docs/screenshot-a.jpg) | ![np/docs/screenshot-a.jpg](np/docs/screenshot-b.jpg) |

## Features/support/limitations

- Windows RT media API (Global System Media Transport Controls (GSMTC), [support table](https://github.com/ModernFlyouts-Community/ModernFlyouts/blob/main/docs/GSMTC-Support-And-Popular-Apps.md))
  - Anything that shows up in the Windows audio flyout works: Spotify/Foobar2000/Chrome/Firefox
- User CSS theming
- Priority list for audio sources
- Draggable and resizable. Saves location and size.
- Works with OBS
- Tauri + Svelte

## Theming

Insert your CSS styles into the "Style override" textarea.

Eg, to turn images grayscale

```css
img {
  filter: grayscale(1);
}
```

## Autostart

Add it to Startup apps in Task Manager.

## Feature ideas

- More widgets (CPU, memory, network, lyrics, spectrogram)
- Widget bundles (JS/HTML/CSS)
- Dynamic Svelte component loading

## Links

- https://rfdonnelly.github.io/posts/tauri-async-rust-process/#the-async-process
- https://github.com/Nerixyz/current-song2

## Development

Contributions welcome.

### Getting started

> **Note**  
> np-widget has to be built on Windows.

Install [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites) first.


```sh
$ cargo tauri dev
$ cargo test
$ cargo clippy

# If needed; output is target/release/np.exe
$ cargo tauri build

# Run JS/client tests
$ (cd client; npm i; npm run test; npm run check)
$ npm run test:unit
$ npm run check:watch
```

### Release

1. Bump the version in [tauri.conf.json](np/tauri.conf.json)
2. Create a new release on the [releases](https://github.com/gyng/np-widget/releases) page.
