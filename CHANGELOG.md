# Changelog

All notable changes to JSON Explorer are documented here. Versions follow
[Semantic Versioning](https://semver.org/).

## [1.2.0] - 2026-10-05

### Added

- **Error visibility in the editor**: whole-line error/warning bands with a
  colored left border and `●` marker, plus full-lane overview-ruler/minimap
  ticks so issues stand out in large files.
- **Explorer tree issue badges**: the sidebar tree shows `❌ N errors` /
  `⚠ N warnings` per node (bubbled up through parents), and a clickable
  error row when the file can't be parsed instead of a blank tree.
- **Health indicator** status bar (`JSON: OK` / `JSON: 2 errors, 1 warning`,
  click to jump) with the **Check Sanity** report.
- **Issue navigation**: Go to Next Issue / Go to Previous Issue commands.
- **New diagnostics**: duplicate array values, missing keys across sibling
  objects (with typo hints), and friendlier parse errors with line/column
  and a nearby snippet.
- **New commands**: Find Duplicates, Check Sanity.
- **Empty-value highlights**: subtle inline badges for `null` / `""` / `[]` /
  `{}` (optionally also listed in Problems).
- **New settings**: `highlightEmptyValues`, `showEmptyDiagnostics`,
  `showDuplicateValueDiagnostics`, `showMissingKeyDiagnostics`,
  `showHealthIndicator`, `highlightIssues`.

## [1.1.1] - 2026-10-01

### Changed

- Marketplace icon, professional metadata (publisher, homepage, gallery
  banner), and release badge.

## [1.1.0] - 2026-10-01

### Added

- Inline count badges at the end of `{` / `[` lines.
- Find Empty Values command (jump to or prune `null` / `""` / `[]` / `{}`).
- Rename Key command (document-wide or scoped, collision-safe).

## [1.0.0] - 2026-10-01

### Added

- Initial release: native tree explorer with pagination, path breadcrumb,
  Copy JSON Path / Pointer, Go to JSON Path, structure-aware search, node
  inspector, schema generation and `$schema` validation, folding commands,
  Focus Mode, format/minify, sort keys, statistics, Outline integration,
  diagnostics (parse errors, duplicate keys) with quick fixes, CodeLens
  summaries, closing labels, and inline counts.
