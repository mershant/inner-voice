# Inner Voice

A SillyTavern extension hosting a private chat between the **Inner Voice** — the guiding second
voice {{user}} experiences as their own mind — and {{user}}. Nothing said here enters the scene:
NPCs and the World never perceive it.

This repository is a fork of [ST-Copilot](https://github.com/QQ-Corporation/ST-Copilot)
(MIT, Quaren / QQ-Corporation). The chat window, streaming pipeline, scroll behavior,
message editing/regenerate/swipes, search, settings drawer, separate connection settings,
and Summaryception integration are inherited from that upstream. Copilot's other feature
modules (sessions UI, lorebook manager, character manager, image features, stats panel,
attachments, chat-edit tooling, starred messages) were removed; they remain recoverable
from this repository's history.

## Status

Exchange spine (issue #3), inner memory (issue #4 / #12), simulation view (issue #5),
and hide (issue #6) are in. Inner memory places each in-slice non-hidden exchange as an
`<inner-exchange>` block directly below its anchor, the same form as the outgoing prompt.
Remaining product behavior — portray, and the drawer cleanup — lands in later issues.

## Development

- Live testing runs only in the isolated SillyTavern-Dev install, never main SillyTavern.
- `npm run build` bundles `src/` into `index.js`.
- `npm test` runs the unit tests.

## License

MIT — see [LICENSE](LICENSE). Upstream copyright (c) 2026 Quaren.
