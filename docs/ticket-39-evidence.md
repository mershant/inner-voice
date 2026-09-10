# Ticket #39 evidence

## Scope and artifact

IV / Chat pages within existing named sessions, implemented on `dev` from
`01610349b0791677436cf65b491331bce917e22d`. This records the local working-tree
build, not a fresh GitHub download. Nothing was pushed or released.

The mode-aware saved turn list is the only canonical conversation. The host's
temporary prompt copies carry ordered exchange blocks; visible/saved main-chat
bubbles do not contain a second copy. ST skips generation interceptors in dry-run
previews, so a dry preview is not evidence of main-model inclusion.

## Deterministic and browser checks

- Focused Node tests exercised migration, page-scoped operations, retention beyond
  400 turns / 30 Chat exchanges, chronological context, private framing, prompt
  identity, reasoning dispatch, and unchanged IV depth.
- Repeated `npm run build` succeeded. This JavaScript repository has no separate
  typecheck command. Rollup still reports the pre-existing circular dependencies.
- Extension kit `check` passed without errors or warnings.
- Kit `smoke-std` passed for `inner-voice` and `foreign-inner-voice-check` in
  `/home/opc/SillyTavern-Dev`, `http://127.0.0.1:8001`, account `default-user`.
  Optional-absence case removed both `Extension-Summaryception` and its installed
  stock rollback copy. All three smoke cases made **zero model requests**.
- `scripts/live-acceptance-chat.py --banter --styles --without-summaryception`
  exercised the built bundle through the actual window. It used a fresh test chat,
  a card-less named NPC, and the existing persona. Separate histories survived
  switching/reopening; editable prompts synchronized and persisted; Chat → IV →
  Chat order and persona consultation passed. Chat regenerate/edit/delete preserved
  both private pages. Desktop (1280×900) and narrow (390×844) screenshots were
  visually inspected, including the compact picker and its IV / Chat controls.
- Eight mocked provider responses exercised UI and ordinary host preparation
  without upstream generation. The main-chat tests covered chronological injection,
  a hidden anchor, and an anchor actually omitted by token selection. The omission
  test temporarily used 65,536 context / 128 output tokens and restored these
  values before real Chat. The newest main message survived while the oversized
  old anchor and all its raw exchanges were absent.

## Real model evidence

Four real requests with Summaryception disabled: two ordinary banter replies and
two editable-style tests. No main-chat generation, Portray, tool round, or recap
was dispatched for these Chat turns. Main preset settings were compared before
and after; connection, model selection, IV prompts, and reasoning settings were
not changed to improve speed. Temporary Chat prompt edits and the neighbor's
enabled state were restored afterward.

- Model: `gemini-3.8-flash`.
- Inner connection: Current Connection (`default`); no explicit profile override.
- Reasoning: Unset. Streaming: Off. Max response tokens: 8,048. Main-chat slice
  setting: 8 (the fixture itself has one main-chat message).

| Case | First visible text | Completion | Upstream requests |
|---|---:|---:|---:|
| Ask the lantern's price | 3.440 s | 3.487 s | 1 |
| Joke about a tiny sun | 15.942 s | 15.972 s | 1 |
| Edited dialogue-only prompt | 3.604 s | 3.629 s | 1 |
| Edited asterisk-actions prompt | 4.166 s | 4.186 s | 1 |

With streaming off, first visible text naturally arrives near completion. These
are observations, not a fixed-seconds guarantee. The responses stayed in the
conversation; the style change took effect without application code or an action
ban. The actions were retained in the Chat transcript.

Local detailed captures are under `.playwright-mcp/chat-acceptance.json`,
`chat-host-*.json`, `chat-desktop.png`, and `chat-narrow.png` (ignored by Git because
request context can include personal persona/card material). There were no browser
page errors in the successful run.

## Final verification and review

- Final full suite: **200 tests passed, zero failed** (`npm test`).
- `git diff --check` passed.
- Standards review: **0 remaining breaches**. Its initial wording concerns were
  re-evaluated against the actual prompt-craft standard and retracted; the privacy
  distinction is required reinforcement, not an unrelated instruction.
- Spec review: **0 remaining findings** after follow-up. An inherited resend
  duplication was fixed because this ticket explicitly forbids duplicate context.
  Toolbar regeneration uses the existing message-regeneration path. Page navigation
  skips the other page's checkpoints, and closed checkpoints cannot regrow via Edit.
- The final no-model STD rerun (`--without-summaryception`) passed with **nine
  mocked responses and zero upstream requests**, covering these fixes as well as
  the main host's token omission. `chat-acceptance-no-model.json` keeps that result
  separate from the four-real-request banter/style capture. A focused streaming
  dispatch test also retained the original owner, mode, and anchor when selection
  and the live edge changed between chunks.
- Final browser regression check retained command-like and tool-code text in Chat
  as ordinary transcript text, not IV controls. The independent spec reviewer
  rechecked the corresponding normal, swipe, and continuation render paths.

## Evidence boundaries

Written and checked locally; ordinary behavior exercised in STD. This is not a
claim that a fresh GitHub-distributed checkout was live-tested or that release was
approved. No Chat summarization claim is made: that integration remains ticket #40.
