# Example layouts

> **Easier path:** the studio has a **Template ▾ → Insert…** picker that drops these same presets
> (Rainmeter sidebar, System monitor, Network, Clock (JP), Now playing) straight onto the canvas as
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
- **Theme** — `tokens` pin the DIN Engschrift Std font and the accent/label/fg palette the skins
  used.

> `DIN Engschrift Std` must be installed for the webview to render it (it is on the author's
> machine). Otherwise it falls back to Arial Narrow; drop the `.otf` into a theme `@font-face` to
> bundle it.

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
