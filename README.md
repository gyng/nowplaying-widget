# np-widget

WIP Now Playing desktop widget using Tauri.

Download: check the [releases page](https://github.com/gyng/np-widget/releases).

|                                                       |                                                       |
| ----------------------------------------------------- | ----------------------------------------------------- |
| ![np/docs/screenshot-a.jpg](np/docs/screenshot-a.jpg) | ![np/docs/screenshot-a.jpg](np/docs/screenshot-b.jpg) |

## Features/support/limitations

- Svelte client
- (Only) Windows RT media API (Global System Media Transport Controls (GSMTC), [support](https://github.com/ModernFlyouts-Community/ModernFlyouts/blob/main/docs/GSMTC-Support-And-Popular-Apps.md))
- Draggable and resizable. Saves location and size.
- Priority list

## Feature ideas

- More widgets (CPU, memory, network, lyrics, spectrogram)
- Widget bundles (JS/HTML/CSS)
- Dynamic Svelte component loading

## Links

- https://rfdonnelly.github.io/posts/tauri-async-rust-process/#the-async-process
- https://github.com/Nerixyz/current-song2

## Development

```sh
$ cargo tauri dev
$ cargo test
$ cargo clippy

$ (cd client; npm i; npm test; npm check)
```
