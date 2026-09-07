# Design: burger list is clipped by the toolbar

## User outcome

The burger is a real menu. The list hangs under the bar the way Copilot’s does.

## Cause

Click handlers already toggle `.iv-menu-panel.open`. The panel is `position: absolute; top: calc(100% + 5px)` under `.iv-menu-dropdown`. Inner Voice `.iv-toolbar` uses `overflow: hidden` (ticket #9). Copilot `.scp-toolbar` uses `overflow: visible`. The open list is drawn inside the toolbar’s ~38px box and cut off. From the user: press burger, nothing.

`.iv-window` also has `overflow: hidden`, but the list hangs over the messages area still inside the window. The clip that hides it is the toolbar.

`.iv-messages` comes later in the flex column and uses `overflow-y: auto`, so it can paint over a visible list unless the dropdown stacks above it.

## Contract

1. `.iv-toolbar` overflow matches Copilot: `visible`.
2. `.iv-menu-dropdown` has a z-index above `.iv-messages` so the open list is not covered.
3. Do not restyle the menu, move it to settings, or portal it to `document.body`.
4. Do not change lorebook overlay behavior beyond being reachable.

## Verification

Live STD, authenticated Playwright, `http://127.0.0.1:8001`.

1. Open Inner Voice window.
2. Click `#iv-menu-trigger`.
3. `#iv-menu-panel` has class `open` and a bounding box with height > 8 and width > 8, not clipped to the toolbar.
4. Click `#iv-menu-lb-item`.
5. `#iv-lb-overlay` is displayed (not `none`).
6. Save a screenshot of the open menu and of the open overlay under this run directory.

Unit tests do not accept this task.

## Failure

If STD is down or auth is dead, return `BLOCKED` with the exact check that failed. Do not claim the CSS change is enough.
