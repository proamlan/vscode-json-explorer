# JSON Explorer

A native-feeling VS Code extension that makes JSON files easier to **understand, navigate, inspect, validate, and edit**.

> VS Code finally understands JSON properly — not a separate JSON app inside VS Code.

## Features

### Understand structure

- **JSON Explorer** sidebar tree with object/array counts (`{8}`, `[1,248]`), type icons, and lazy pagination for huge arrays — click any node to jump to it in the editor.
- **Item counts everywhere**: tree descriptions (`8 properties`, `1,248 items`), hover inspector, and breadcrumb tooltips.
- **Inline count badges**: dimmed `8 properties` / `1,248 items` at the end of each `{` / `[` line — counts you can't miss.
- **CodeLens summaries**: `8 properties` / `1,248 items` above every multi-line block — click to fold it.
- **Closing labels**: subtle inlay hints (`users`, `users[12]`) after long blocks so you always know which `}` you're looking at.
- **Statistics** status bar (`size • nodes • depth`) with a detail view.
- **Outline** integration with truncation for huge arrays.

### Navigate

- **Path breadcrumb** in the status bar (`root › users › 42 › …`), with counts and sizes in the tooltip.
- **Copy JSON Path** (`$.users[42].name`) / **Copy JSON Pointer** (`/users/42/name`), **Go to JSON Path** (accepts both).
- **Structure-aware search** over keys, values, paths, and types.
- **Folding**: collapse/expand all, collapse to level, collapse arrays/objects, **Focus Mode** for deep subtrees.

### Validate & edit

- **Schema validation** via local `$schema`, reported in the Problems panel.
- **Generate Schema** from a document or selection.
- **Diagnostics**: invalid JSON/JSONC, duplicate keys, schema violations — with safe quick fixes.
- **Find Empty Values**: jump to any `null` / `""` / `[]` / `{}` by path, or prune them all with confirmation.
- **Rename Key**: rename a property document-wide or within a scope (collision-safe, aborts on duplicates).
- **Format / Minify** (document + selection, respects indent settings, JSONC-safe), **Sort keys** (document, recursive, selection — never arrays).

## Install

### From GitHub Releases (recommended)

Download the latest `json-explorer-native-*.vsix` from
[Releases](https://github.com/proamlan/vscode-json-explorer/releases), then:

```sh
code --install-extension json-explorer-native-*.vsix
```

Or in VS Code: `Extensions (⇧⌘X) → … → Install from VSIX…`.

### From a local build

```sh
npm run vsix
code --install-extension json-explorer-native-*.vsix
```

### Requirements

- VS Code `^1.85.0`
- Node 18+ (only for building from source)

## Usage

Open any `.json` / `.jsonc` file:

- The **JSON Explorer** view appears in the Explorer sidebar.
- The status bar shows the **breadcrumb path** (left) and **document statistics** (right).
- Press `⌘⇧P` and type `JSON:` for all commands (search, paths, format, sort, schema, folding, focus…).
- Right-click in a JSON file for the compact **JSON** submenu.

## Settings

| Setting | Default | Description |
|---|---|---|
| `jsonExplorer.enabled` | `true` | Master switch |
| `jsonExplorer.showStatistics` | `true` | Status bar statistics |
| `jsonExplorer.showBreadcrumbs` | `true` | Status bar path breadcrumb |
| `jsonExplorer.showCodeLens` | `true` | Item-count CodeLens above blocks (click to fold) |
| `jsonExplorer.showInlineCounts` | `true` | Inline count badges at the end of `{` / `[` lines |
| `jsonExplorer.showClosingLabels` | `true` | Closing key labels after long blocks |
| `jsonExplorer.closingLabelMinLines` | `8` | Min block height (lines) for a closing label |
| `jsonExplorer.maxArrayItems` | `100` | Children per page in the explorer |
| `jsonExplorer.maxDepth` | `20` | Max depth for outline/analysis |
| `jsonExplorer.validateSchema` | `true` | `$schema` validation |

## Development

```sh
npm install
npm run compile   # typecheck
npm run test      # vitest
npm run lint
npm run build     # esbuild -> dist/extension.js
npm run vsix      # package json-explorer-native-<version>.vsix
```

Launch: open this folder in VS Code and press `F5` (Extension Development Host).

## Notes

- JSONC (`*.jsonc`) is parsed in comment-tolerant mode. Document-wide format/minify/sort are disabled for JSONC to preserve comments — use selection-based commands on pure-JSON ranges instead.
- Large files (10–50MB+): parsing is debounced and cached, the tree paginates, diagnostics are capped, and CodeLens/closing labels are bounded — editor responsiveness comes first.
- No network, no telemetry, works fully offline.

## License

MIT — see [LICENSE](LICENSE).
