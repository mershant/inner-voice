# Plan

## Files

| Path | Role |
|---|---|
| `style.css` `.iv-toolbar` | `overflow: visible`; `z-index` on the bar so its descendants can stack above messages |
| `style.css` `.iv-menu-dropdown` | `z-index` above `.iv-messages` |
| This run directory | screenshots / measurement log |

Do not change `src/index.js` menu listeners unless live evidence shows they never fire. Current diagnosis is clip, not missing click.

## Order

1. Change the two CSS rules.
2. Hard-reload Inner Voice in STD (`http://127.0.0.1:8001`). `style.css` is not bundled; no `npm run build`.
3. Click burger. Measure panel box. Screenshot.
4. Click Lorebook Manager. Confirm overlay. Screenshot.
5. Return evidence paths.

## Checks

- Playwright: panel open box height > 8px after burger click.
- Playwright: `#iv-lb-overlay` computed display is `flex` (or not `none`) after row click.
- Screenshots written under this run directory.

## Rollback

`style.css` at `f28aa3b` is clean. Revert those two rules if live proof fails.

## Acceptance map

Charter item 1 → burger screenshot + box measurement.
Charter item 2 → overlay screenshot + display value.
Charter item 3 → files in this run directory.
Charter item 4 → no `/generate` in the script.
