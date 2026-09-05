# Inner Voice — concept

Sources: [`../sources/inner-voice.md`](../sources/inner-voice.md)

## Current

*(Empty — no proposal accepted yet.)*

## Proposals

### IV-P-001 — 2026-09-04

- State: `proposed`
- Wording: `agent-authored interpretation`
- Idea provenance: `user-derived`
- Operation: `add`
- Sources: [IV-S-001](../sources/inner-voice.md#iv-s-001), [IV-S-007](../sources/inner-voice.md#iv-s-007)

#### Exact proposed canonical change

The extension chat is a conversation between two participants: the player speaks as the Inner Voice
(the guiding thought / second voice), and the model answers **as {{user}}** — a realistic thought
in the established persona's first-person voice, never as an assistant, narrator, or briefing
copilot describing {{user}} from outside. {{user}} believes the second voice is themselves:
arguing, planning, and recall all read as talking to yourself. Guidance can be with {{user}},
against {{user}}, or out of nowhere — an out-of-nowhere command is received as an intrusive
thought {{user}} reacts to. Replies are naturally short but can run longer when needed.

#### Ambiguity and open questions

None identified.

### IV-P-002 — 2026-09-04

- State: `proposed`
- Wording: `agent-authored interpretation`
- Idea provenance: `user-derived`
- Operation: `add`
- Sources: [IV-S-001](../sources/inner-voice.md#iv-s-001), [IV-S-002](../sources/inner-voice.md#iv-s-002), [IV-S-003](../sources/inner-voice.md#iv-s-003)

#### Exact proposed canonical change

An exchange is one conversation under one main-chat message. The player moves through the story
LIVE and linearly: you stop at an AI message, and at that message you can hold an exchange. There
is no returning to think inside a past message. The extension UI is one scrollable conversation
with easy navigation indicating which exchanges occurred on which message.

#### Ambiguity and open questions

None identified.

### IV-P-003 — 2026-09-04

- State: `proposed`
- Wording: `agent-authored interpretation`
- Idea provenance: `user-derived`
- Operation: `add`
- Sources: [IV-S-001](../sources/inner-voice.md#iv-s-001), [IV-S-004](../sources/inner-voice.md#iv-s-004), [IV-S-006](../sources/inner-voice.md#iv-s-006)

#### Exact proposed canonical change

Two separate context windows. The extension chat can remember all thoughts within that UI; the
main chat sees exchanges placed right below their messages in the outgoing prompt, but only one
exchange by default (configurable depth). Hiding an exchange removes it from **both** windows —
the exchange chat forgets it too, not just the main chat — while it stays readable in the UI.

#### Ambiguity and open questions

None identified.

### IV-P-004 — 2026-09-04

- State: `proposed`
- Wording: `agent-authored interpretation`
- Idea provenance: `user-derived`
- Operation: `add`
- Sources: [IV-S-004](../sources/inner-voice.md#iv-s-004)

#### Exact proposed canonical change

The Inner Voice may recall real memories and may also invent — callbacks to things that never
happened and answers the simulation never established can become actually true. This is natural
behavior and must mostly stay unmentioned in the system prompt. The one named danger is the
opposite instruction: source-fidelity clauses like "Only refer to the source...." are dangerous
prompts and must not be added.

#### Ambiguity and open questions

None identified.

### IV-P-005 — 2026-09-04

- State: `proposed`
- Wording: `agent-authored interpretation`
- Idea provenance: `user-derived`
- Operation: `add`
- Sources: [IV-S-001](../sources/inner-voice.md#iv-s-001), [IV-S-005](../sources/inner-voice.md#iv-s-005)

#### Exact proposed canonical change

Portray writes a {{user}} input to the main chat from what {{user}} felt, planned, or formed with
the Inner Voice — usable even without an exchange, carrying what {{user}} was already feeling.
Scope is {{user}}'s actions and dialogue only. A manual button always exists; the tool-call-like
auto ability can be turned off or made manual, and fires on natural cues from either side —
directive guidance ("you should probably tell her about....") or {{user}} resolving alone ("...yeah.
lets just do that."). Default routing fills the input box; immediate send is an option. Writing
options: RP-style or written-summary style, and first/second/third person.

#### Ambiguity and open questions

Superseded in part by IV-P-006: "from what {{user}} felt, planned, or formed" understated the
scene's role and licensed restaging the exchange as the turn (IV-S-008).

### IV-P-006 — 2026-09-05

- State: `proposed`
- Wording: `agent-authored interpretation`
- Idea provenance: `user-derived`
- Operation: `replace` (the portray-relationship sentence of IV-P-005)
- Sources: [IV-S-008](../sources/inner-voice.md#iv-s-008), [IV-S-001](../sources/inner-voice.md#iv-s-001)

#### Exact proposed canonical change

A portray turn is an action responding to the world given the present circumstances. The exchange
is a supporting opinion — it tilts how {{user}} acts, and is never material to restage, summarize,
or synthesize into the turn. The scene supplies what the turn answers; the inner life only shapes
the answer. Without an exchange, the turn comes from {{user}}'s standing state.

#### Ambiguity and open questions

None identified.

## History

*(No accepted, rejected, or superseded proposals yet.)*
