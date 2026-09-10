# Inner Voice

A SillyTavern extension for private thinking and quick conversations inside the simulation.
In **IV**, the Inner Voice talks privately with one mind. In **Chat**, your persona talks to
the named character, and the conversation happens in the scene.

This repository is a fork of [ST-Copilot](https://github.com/QQ-Corporation/ST-Copilot)
(MIT, Quaren / QQ-Corporation). The chat window, streaming pipeline, scroll behavior,
message editing/regenerate/swipes, search, settings drawer, separate connection settings,
and Summaryception integration are inherited from that upstream. Copilot's other feature
modules (sessions UI, lorebook manager, character manager, image features, stats panel,
attachments, chat-edit tooling, starred messages) were removed; they remain recoverable
from this repository's history.

## Status

Exchange spine (issue #3), inner memory (issue #4 / #12), simulation view (issue #5),
hide (issue #6), and portray (issues #7 / #8 / #13 / #17 / #18) are in. Portray writes {{user}}'s next
main-chat input as an action answering the present scene. Text already in the extension's
think box is performed as that turn and does not become an exchange. By default the result
lands in the main-chat input box;
immediate send and auto-trigger are independent opt-in switches. When auto-trigger is on, the
ordinary {{user}} reply also decides whether the completed exchange should portray, so a
triggered exchange costs two model requests and an untriggered one costs one.
Remaining product behavior — the drawer cleanup — lands in a later issue.

## IV / Chat pages

Create a character by typing their name in **New Session**. A character card is not required.
Open that character's dropdown to choose **IV** or **Chat**. Each page keeps its own readable
history; the default persona session remains IV only.

The pages share eligible context beside their main-chat anchors in the order it happened.
Your own IV can remember your conversations with NPCs without hearing their private thoughts.
Main chat sees eligible IV and Chat together, even when another page is open.

Chat stays in context while its anchor does. Hiding the anchor or leaving the receiving model's
context removes its raw Chat too; restoring the anchor restores inclusion. There is no separate
30-exchange limit. IV depth settings still apply only to IV. Summaryception support for summarizing
Chat is separate work (#40); injecting a conversation does not mark it summarized.

Chat uses the existing independent connection and reasoning settings for one reply, without
automatically generating a main-chat response, Portray, or recap. IV command prefixes are ordinary
text on the Chat page.

## Writing prompts

`{{voice}}` is the session's named character (or your persona in the default IV session).
`{{user}}` always means the active persona. Use `{{voice}}` for the responding mind and keep
`{{user}}` for the persona; SillyTavern's global macros are not changed.

**Chat Prompts** in the extension drawer and window settings holds Chat's editable system and
post-history instructions, separate from IV. Blank post-history means no additional instruction.
Set dialogue-only or dialogue with `*asterisk actions*` in these prompts, not a mode setting.
The reply is this character's next conversational turn, not a full scene update. Dialogue and
actions in its transcript are already part of the scene; private IV history remains unspoken.
Existing IV customizations and its freedom to recall and invent remain intact (ADR 0002).

## Development

- Live testing runs only in the isolated SillyTavern-Dev install, never main SillyTavern.
- `npm run build` bundles `src/` into `index.js`.
- `npm test` runs the unit tests.
- There is no separate typecheck: this is JavaScript. Build and focused Node tests are the local checks.
- The simulation view uses SillyTavern's `generate_interceptor` to append context to **temporary
  prompt copies** of anchor messages before token selection, not saved or visible main-chat text.
  The host therefore keeps or drops the anchor and its context together. ST skips interceptors
  in dry-run previews; product acceptance must exercise the normal preparation path.
- `scripts/live-acceptance-chat.py` checks the distributed window and captured requests in STD.
  Its optional `--banter` run uses the configured connection without changing model/preset/reasoning settings.

## License

MIT — see [LICENSE](LICENSE). Upstream copyright (c) 2026 Quaren.
