# Third-party plugin packages

A **plugin package** is a folder you drop into the app-config `plugins/` directory that adds
templates (ready-made widget clusters) and optionally a theme — **declarative data only, no
code**. Packages show up in the studio's **Plugins** section under *Packages*, where each one is
enabled per-machine (everything starts **disabled** — installing a folder runs nothing until you
flip its toggle).

```
%APPDATA%\com.widgetsack.app\plugins\
  ha.json, llm.json, …            ← first-party plugin configs (files — not packages)
  my-pack\                        ← a package is a DIRECTORY
    plugin.json                   ← the manifest (required)
    sky.css                       ← assets the manifest declares (optional)
```

> Phase 1 is data-only on purpose: a package cannot run JavaScript or render its own components.
> A planned Phase 2 adds sandboxed sensor sources (QuickJS, capability-gated network access). The
> one sharp edge today is **theme CSS** — see Security below.

## plugin.json

```json
{
	"manifestVersion": 1,
	"id": "my-pack",
	"name": "My pack",
	"version": "1.0.0",
	"description": "A clock cluster and a sky theme.",
	"author": "you",
	"homepage": "https://github.com/you/my-pack",
	"templates": [
		{
			"id": "big-clock",
			"name": "Big clock",
			"description": "HH:mm over a date line.",
			"size": { "w": 200, "h": 96 },
			"params": [
				{
					"key": "hour",
					"label": "Hour format",
					"default": "HH:mm",
					"targets": ["children.0.unit.config.format"],
					"choices": [
						{ "value": "HH:mm", "label": "24-hour" },
						{ "value": "h:mm A", "label": "12-hour" }
					]
				}
			],
			"tree": {
				"id": "bc-root",
				"kind": "col",
				"align": "stretch",
				"gap": 2,
				"children": [
					{
						"id": "bc-time",
						"unit": {
							"id": "bc-time",
							"type": "clock",
							"rect": { "x": 0, "y": 0, "w": 200, "h": 60 },
							"config": { "format": "HH:mm" }
						}
					},
					{
						"id": "bc-date",
						"unit": {
							"id": "bc-date",
							"type": "clock",
							"rect": { "x": 0, "y": 0, "w": 200, "h": 24 },
							"config": { "format": "ddd D MMMM" }
						}
					}
				]
			}
		}
	],
	"theme": { "name": "Sky", "file": "sky.css" }
}
```

Field rules:

- **`manifestVersion`** must be `1`.
- **`id`** must equal the folder name — 1–64 chars of `A–Z a–z 0–9 space _ -`. Template ids use
  the same alphabet; the registry namespaces them as `pkg:<id>:<templateId>` so packages can
  never collide with built-ins or each other.
- **`templates[].tree`** is a layout node in the same JSON grammar as `widgets.json` (a
  container with `children`, or a leaf wrapping a widget `unit`). It goes through the layout
  file's structural whitelist — unknown fields are stripped, a malformed template is **dropped
  with a warning** (shown on the package's row) while the rest of the package still loads.
  Widget `type`s must be registered types (see [the widget reference](widgets.md)); a leaf with
  an unknown type renders as missing.
- **`templates[].params`** are insert-time options using the same `ParamSpec` grammar as the
  built-in templates and the widget designer: `key`, optional `label`/`default`, `target` or
  `targets` (dotted index paths into the tree, e.g. `children.0.unit.config.format`), and
  optional `choices` (rendering a select). See [templating & formulas](templating.md) for what
  config fields accept.
- **`theme.file`** must be a plain `<name>.css` filename inside the package folder (no
  subdirectories). The CSS is injected globally while the package is enabled — set `--np-*` /
  `--ui-*` tokens or target the stable widget hooks, exactly like a user theme
  ([theming reference](theming.md)).

## How templates surface

An enabled package's templates appear under the package's name in two places: the **Layouts →
Add palette** ("Templates · My pack" — inserts a standalone copy onto the canvas) and the
**widget designer's** template list (preview, or ⎘-clone into an editable library widget that
keeps your `params` as instance params).

## Security model

- **Opt-in:** discovered packages register nothing until enabled; the toggle is a per-machine
  allowlist.
- **Structural validation:** manifests are parsed fail-closed; trees go through the layout
  whitelist; param paths that walk `__proto__`/`constructor`/`prototype` are rejected.
- **Theme CSS is the trust boundary:** it runs with full access to the studio's DOM, so it is
  scanned (remote `url()`/`@import`, viewport overlays — the same scan sack imports get) and a
  flagged theme asks for explicit confirmation on first enable. Don't enable packages from
  sources you don't trust.
- **No code:** there is no JavaScript surface in a Phase 1 package at all.

## Updating / removing

Replace or delete the folder and reopen the Plugins section (it re-scans on open). Disabling a
package live-removes its palette group and theme; other windows pick the change up on their next
reload.
