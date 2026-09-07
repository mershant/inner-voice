# Charter: burger menu must show its list

## Outcome

Pressing the Inner Voice toolbar burger shows the Lorebook Manager row on screen. Clicking that row opens the lorebook manager overlay. The user can reach the manager without guessing.

## Authority (precedence)

1. User, this session: the burger does nothing visible; #26 was closed without that ordinary path.
2. Upstream Copilot `style.css` `.scp-toolbar { overflow: visible; }` at `/home/opc/rp-prompting/workbench/extensions/st-copilot-image-generation/ST-Copilot/style.css` lines 179–187.
3. Current Inner Voice `.iv-toolbar { overflow: hidden; }` in `style.css` lines 179–187 — this is the clip. Menu CSS already exists at `.iv-menu-panel` / `.iv-menu-panel.open`.
4. ADR 0003: restores match upstream behavior. Do not redesign the menu.

## Workspace

`/home/opc/projects/st-extensions/inner-voice` on `dev` at `f28aa3b`.

## In scope

- Make the burger list visible.
- Prove it in STD at `http://127.0.0.1:8001` by clicking, not by unit tests.
- Keep Copilot’s hang-below-the-bar menu.

## Out of scope

- Lorebook manager internals, write path, AI-manage.
- Character manager.
- Ticket campaign 24–28 except this access bug.
- Paid model calls.
- Pushing to GitHub.

## Worker / audit

Campaign standing instruction: implementation child is General/Grok, not `worker`. Audit: `audit-smart`.

## Constraints

- Do not treat tests as proof the menu is usable.
- Do not ask the user to switch modes.
- Orchestrator does not edit product files.

## Acceptance

1. Burger click shows a visible “Lorebook Manager” row (non-zero on-screen box).
2. That row opens `#iv-lb-overlay` (`display` not `none`).
3. Screenshot or playwright measurements exist for both.
4. No paid generation.
