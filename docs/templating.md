# Templating & formulas

> **Generated** from the code that defines the language — do not hand-edit. Run `npm run gen:docs`
> (in `client/`) to regenerate. Sources of truth: `client/src/lib/core/templateFns.ts` (helper
> functions), `client/src/lib/core/format.ts` (named formats), `client/src/lib/formula/engine.ts`
> (the sandbox), and the widget registry (`core/widget.ts`).

Many widget fields accept a small expression language so a value can be **computed** or **composed**
from live sensors instead of bound 1:1. There are two flavours, both built on the same expressions:

- **Formula** — a single expression that evaluates to a **number**, used to override a numeric field
  (a gauge/bar `value`, `min`, `max`). Example: `clamp(cpu.total, 0, 100)` or `mem.used.bytes / mem.total * 100`.
- **Template** — literal text interleaved with `{ expression }` segments that evaluates to a
  **string** (the Text widget's `value`). Example: `CPU {round(cpu.total)}% · {bytes(mem.used.bytes)}`.

## Template syntax

A template is plain text with `{ … }` holes; each hole is an expression evaluated against the live
sensor values, and its result is substituted in. Everything outside the braces is literal.

- `{{` and `}}` produce literal `{` and `}`.
- Braces and quotes **inside** an expression are balanced/skipped, so `{ round(x, 2) + ' }' }` is one hole.
- A hole whose expression is `null`, errors, or is non-finite renders as **`–`** (an en dash) —
  never the literal `null` or `NaN`. A formula field that fails simply falls back to its plain value.

## Expressions

Each `{ … }` (and each formula) is **real JavaScript**, evaluated in a sandboxed QuickJS interpreter:

- **Sensors are namespaced globals.** A dotted sensor id reads as ordinary member access:
  `cpu.total`, `mem.used`, `net.down`, `gpu.util`, `ha.<entity_id>`. (The studio **Sensors**
  section lists what's available; the full id reference is in [widgets.md](widgets.md).)
- **Standard JavaScript works:** arithmetic and comparisons, `Math.*`, `Number`, `String`,
  `(x).toFixed(2)`, ternaries (`cpu.total > 90 ? 'HOT' : 'ok'`), string concatenation (`cpu.total + '%'`).
- **Plus the helper functions below.**
- **It is a true sandbox:** no DOM, no Tauri, no network, no host globals (`typeof fetch` is
  `'undefined'`) — formulas travel inside shared sacks, so they can't do more than compute. Each eval
  is bounded (~50 ms + ~16 MiB); a runaway or oversized expression is killed and renders as `–`.
- **A sensor that hasn't emitted yet is absent**, so referencing it makes the expression fail (→ `–`)
  rather than coercing to `0` — a fresh widget shows `–`, not a misleading zero.

## Helper functions

Available in every expression, on top of native JavaScript:

| function | description | example |
| --- | --- | --- |
| `round(x, places = 0)` | Round `x` to `places` decimal places. | `{round(cpu.total, 1)}` |
| `toDecimalPlace(x, places = 0)` | Alias of `round`. | `{toDecimalPlace(mem.used / 3, 1)}` |
| `clamp(x, lo, hi)` | Constrain `x` to the range `[lo, hi]`. | `{clamp(cpu.total, 0, 100)}` |
| `bytes(x, places = 1)` | Bytes as a binary-scaled size, e.g. `16.0 GiB`. | `{bytes(mem.used.bytes)}` |
| `rate(x, places = 1)` | Bytes/second as a size with a `/s` suffix, e.g. `1.0 KiB/s`. | `{rate(net.down)}` |
| `percent(x, places = 0)` | A number with a trailing `%`. | `{percent(cpu.total)}` |

## Named value formats

A scalar widget's `format` field is a quicker alternative to a template when you just want one value
shown nicely. It names how the bound sensor's number is rendered; any unlisted value renders the raw
number. (For anything fancier — labels, maths, multiple sensors — use a template in the `value` field.)

| format | description | example |
| --- | --- | --- |
| `integer` | Rounded to a whole number. | 37 |
| `percent` | A whole-number percentage with a `%` suffix. | 37% |
| `rate` | Bytes/second, binary-scaled, with a `/s` suffix. | 1.0 KiB/s |
| `bytes` | Binary-scaled bytes (B / KiB / MiB / GiB / TiB). | 16.0 GiB |
| `duration` | A whole-seconds duration, two most-significant units. | 3d 4h |

## Where formulas & templates are accepted

Config fields that take an expression (the studio Inspector marks them “(formula)”):

| widget | field | accepts | notes |
| --- | --- | --- | --- |
| `gauge` | `value` | formula → number | overrides the sensor, e.g. round(mem.used, 0) or cpu.total / 2 |
| `gauge` | `minExpr` | formula → number | overrides `min` |
| `gauge` | `maxExpr` | formula → number | overrides `max` |
| `bar` | `value` | formula → number | overrides the sensor, e.g. clamp(cpu.total, 0, 100) |
| `bar` | `minExpr` | formula → number | overrides `min` |
| `bar` | `maxExpr` | formula → number | overrides `max` |
| `text` | `value` | template → text | template: text + {expressions}, e.g. CPU {round(cpu.total)}% · {bytes(mem.used.bytes)} |

## Examples

```text
{round(cpu.total)}%                            → 37%
CPU {round(cpu.total)}% · {bytes(mem.used.bytes)}   → CPU 37% · 12.4 GiB
↓ {rate(net.down)}  ↑ {rate(net.up)}           → ↓ 1.2 MiB/s  ↑ 64.0 KiB/s
{round(mem.used)}% of {bytes(mem.total)} used  → 37% of 32.0 GiB used
{cpu.total > 90 ? 'HOT' : 'ok'}                → conditional text
{{literal braces}}                             → {literal braces}
```

Formula fields (numeric) take just the expression — no braces:

```text
clamp(cpu.total, 0, 100)
mem.used.bytes / mem.total * 100
```
