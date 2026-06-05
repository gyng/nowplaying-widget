# Example layouts

> **Easier path:** the studio has a **Template ▾ → Insert…** picker that drops these same presets
> (System monitor, Network, Clock (JP), Now playing) straight onto the canvas as
> a draft — preview, then **Save**. The JSON below is the equivalent for manual install / reference.

## `rainmeter-port.widgets.json`

A starter layout that recreates the author's Rainmeter `gyng\*` skins (DateTime, System,
Network, Music) as widgetsack widgets on the **primary** monitor (`default` key). Everything is
placed as floating widgets so you can drag them around in the studio.

What it contains (46 widgets):

- **DateTime** — `HH:mm` time, **Japanese weekday glyph** (`ddd` + `locale: ja` → 月火水…), date,
  uppercased month.
- **System** — CPU / RAM / SWAP / GPU / VRAM as `text` widgets, plus an **8×4 grid of 32 per-core
  sparklines** (`cpu.core.0..31`).
- **Network** — NetOut / NetIn **histograms** (`sparkline` with `histogram: true`) + auto-scaled
  rate text.
- **Music** — a compact `nowplaying` widget (no progress bar — foobar2000 doesn't emit a timeline).
- **Theme** — `tokens` pin the Bahnschrift font and the accent/label/fg palette the skins used.

> `Bahnschrift` ships with Windows 10/11, so the webview renders it directly. The app also loads any
> installed font (incl. per-user "install for me only" fonts) by name via its system-fonts loader,
> so a custom `--np-font-display` resolves even when Chromium wouldn't otherwise enumerate it.

### Load it

The app reads `widgets.json` from its config dir
(`%APPDATA%\io.github.gyng\widgets.json` on Windows). To use this example, copy it there
(back up any existing one first):

```powershell
$dst = "$env:APPDATA\io.github.gyng\widgets.json"
if (Test-Path $dst) { Copy-Item $dst "$dst.bak" }
Copy-Item docs\examples\rainmeter-port.widgets.json $dst
```

Then launch the app (or the studio) — it loads on start, and you can rearrange/retarget monitors
from there. To edit a different monitor, use the studio's monitor switcher and move widgets via the
right-click **Move to** menu.
