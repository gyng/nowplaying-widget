# widgetsack MCP server

Lets an external agent (Claude Desktop, Claude Code, Cursor, ChatGPT developer-mode, …) read your
widget catalog + sensors and **edit your desktop layout** by reading/writing `widgets.json`. The
running widgetsack app's file watcher live-reloads the overlays on every write, so changes appear on
the desktop within a moment. No app changes, no backend coupling — and every edit goes through the
same validated op vocabulary the in-app AI assistant uses, so an agent can only emit real widget
types, real sensors, and well-formed edits.

## Tools

| Tool                | What it does                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `list_widget_types` | Every placeable widget type + its config keys + whether it binds a sensor.                            |
| `list_sensors`      | The bindable sensor ids (cpu/gpu/memory/network/…).                                                   |
| `read_sensors`      | The **live** readings the running app last reported (what's happening right now).                     |
| `describe_layout`   | The current layout: monitor keys + each monitor's placed widgets.                                     |
| `apply_layout_ops`  | Edit the layout: `addWidget` / `removeWidget` / `setConfig` / `setSensor` / `addContainer` / `clear`. |
| `list_themes`       | The available theme names + which is active.                                                          |
| `set_theme`         | Set the desktop's active theme by name (applied on reload).                                           |
| `now_playing`†      | What media is currently playing (title / artist / status).                                            |
| `media_control`†    | Control playback: play / pause / playpause / next / previous.                                         |
| `ha_call_service`†  | Call a Home Assistant service (e.g. `light.turn_on`).                                                 |

† **Actuation tools** need **agent control enabled**: in the app, _AI Provider → Advanced → "Enable
agent control"_ (off by default). That opens a **token-guarded, `127.0.0.1`-only** server (never
`0.0.0.0`); the token lives in `mcp/control.json` and is required on every request along with a JSON
content-type, which blocks drive-by web requests. Untoggle to close the port.

## Run

```sh
cd client
npm run mcp        # = vite-node mcp/server.ts
```

Override the layout file location with `WIDGETSACK_LAYOUT=/path/to/widgets.json` (default on Windows:
`%APPDATA%\io.github.gyng\widgets.json`).

## Connect an MCP client

The server speaks MCP over **stdio**, so the client launches it. It must run with the **client
directory as the working directory** (so `vite-node` finds the Vite config).

**Claude Desktop** — `claude_desktop_config.json`:

```json
{
	"mcpServers": {
		"widgetsack": {
			"command": "npx",
			"args": ["vite-node", "mcp/server.ts"],
			"cwd": "C:\\Users\\gng\\w\\npi\\client"
		}
	}
}
```

**Claude Code** (run from the `client/` directory):

```sh
claude mcp add widgetsack --scope user -- npx vite-node mcp/server.ts
```

**Cursor** — `.cursor/mcp.json` uses the same `command`/`args`/`cwd` shape as Claude Desktop.

## Notes / caveats

- Best used while the studio designer is **not** actively editing the same monitor — a studio save
  writes its in-memory layout and would clobber a concurrent agent edit. Overlay-only edits are safe.
- `apply_layout_ops` targets the first monitor key by default; pass `monitor` to choose another (see
  `describe_layout` for the keys). If no layout exists yet, run widgetsack once first, or pass a
  `monitor` key to create one.
- stdout is the JSON-RPC channel; the server logs only to stderr.
