# Task 1: Make the burger list visible and prove it in STD

## Deliverable

Toolbar burger shows a visible Lorebook Manager row. That row opens the lorebook manager overlay. Live STD evidence (measurements + screenshots) in this run directory.

## Why this task exists

#26 shipped the menu HTML/JS into a toolbar that clips overflow. The user cannot open the manager. Unit tests cannot see that.

## Authority

- `.opencode/plans/20260908-024814-burger-menu-visible/charter.md`
- `.opencode/plans/20260908-024814-burger-menu-visible/design.md`
- Copilot toolbar: `/home/opc/rp-prompting/workbench/extensions/st-copilot-image-generation/ST-Copilot/style.css` lines 179–187 (`overflow: visible`)
- Inner Voice toolbar: `style.css` lines 179–187 (`overflow: hidden`)
- Menu rules: `style.css` `.iv-menu-dropdown` / `.iv-menu-panel` (near end of file)
- Click handlers already in `src/index.js` (`#iv-menu-trigger`, `#iv-menu-lb-item`)

## Read first

1. `charter.md` and `design.md` in this run directory — contract
2. `style.css` `.iv-toolbar` and `.iv-menu-*` — the clip
3. Copilot `.scp-toolbar` — the required overflow

## Starting state

- Recovery checkpoint: `f28aa3b`
- `style.css` is tracked and clean at HEAD
- Menu click JS already toggles `.open`
- Prior worker transcripts: not authority and not provided

## Allowed changes

- Modify: `style.css` (toolbar overflow / stacking, menu-dropdown z-index only)
- Create: files under `.opencode/plans/20260908-024814-burger-menu-visible/` for screenshots and a short evidence note
- Do not touch: `src/`, `index.js`, `window.html`, lorebook manager internals, tests, other CSS except the two rules named

## Fixed contract

- Required result: burger click shows Lorebook Manager on screen; row click shows `#iv-lb-overlay`
- Scope: access only
- Constraints: match Copilot hang-below-bar menu; no redesign; no paid generation
- Interfaces: existing `#iv-menu-trigger`, `#iv-menu-panel`, `#iv-menu-lb-item`, `#iv-lb-overlay`
- Authority: Copilot `overflow: visible` on the toolbar
- Acceptance: live STD click proof, not unit tests

## Implementation latitude

CSS stacking details that keep the list visible over `.iv-messages` are yours, as long as the menu still hangs under the burger.

## Required implementation

### `style.css`

1. Set `.iv-toolbar` to `overflow: visible` (Copilot). Keep the rest of that rule.
2. Give `.iv-toolbar` and/or `.iv-menu-dropdown` a z-index above `.iv-messages` so the open panel is not covered.
3. Do not change `.iv-menu-panel` display/open rules unless live proof shows they are wrong.

### Live STD

URL `http://127.0.0.1:8001`. Storage state `/home/opc/.local/share/openchamber/playwright/std-storage-state.json`. Python `/usr/bin/python3`.

1. Wait for `#send_textarea`; `#loader` detached.
2. Show `#iv-window` (`display: flex`).
3. Click `#iv-menu-trigger`.
4. Assert `#iv-menu-panel` has class `open` and `getBoundingClientRect()` height > 8 and width > 8.
5. Screenshot the open menu into this run directory.
6. Click `#iv-menu-lb-item`.
7. Assert `#iv-lb-overlay` computed display is not `none`.
8. Screenshot the overlay into this run directory.
9. Do not fill `#iv-input` or press send. Do not call `/generate`.

If STD or auth is down, return `BLOCKED` with the exact error. Do not report CSS-only success.

## Verification

1. Command/check: Playwright measurements after burger click
   - Expected: panel box height > 8, width > 8, class `open`
2. Command/check: overlay after Lorebook Manager click
   - Expected: `#iv-lb-overlay` display not `none`
3. Artifact evidence: two screenshots in this run directory
   - Expected: list visible in first; manager overlay visible in second

## Stop conditions

Return `NEEDS_CONTEXT` or `BLOCKED` when STD is unreachable, auth expired, `#iv-menu-trigger` is missing, or the overlay element is missing from the page.

## Return contract

- Status: `DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED`
- Changed files: exact paths or `none`
- Evidence: commands/checks and actual output
- Artifact evidence: screenshot paths and measured boxes
- Concerns/blocker: exact wall, or `none`
- Successor handoff: or `N/A`
