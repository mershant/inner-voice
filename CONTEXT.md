# Inner Voice

This context names the entities and boundaries of the Inner Voice SillyTavern extension: a private
chat where the Inner Voice and {{user}} think together under main-chat checkpoints.

The concept descends from the Self family (`/self`, `s:`, `/selfq`, `sq:`, `sr:`) defined in
`/home/opc/rp-prompting/prompts/perspective/prompt.md`.

## Language

**Inner Voice**:
The guiding second voice that speaks privately with {{user}}. {{user}} experiences the Inner Voice as their own mind — arguing with it, planning with it, or recalling with it is talking to themselves. NPCs and the World never perceive it. The extension carries the same name. In the extension chat, the player speaks as the Inner Voice and the model answers as {{user}} in first person — never as an assistant describing {{user}} from outside.

**Simulation**:
The living scene the main chat runs. Inner Voice work always says simulation, never roleplay.

**Main chat**:
The ordinary SillyTavern chat where the simulation happens, outside the Inner Voice extension.

**Outgoing prompt**:
What the main chat's model actually receives when generating. Exchanges may enter it or be hidden from it.

**Exchange**:
The single private conversation between the Inner Voice and {{user}} anchored under one main-chat message. A main-chat message holds at most one exchange, which grows as that checkpoint's conversation continues.

**Exchange block**:
The form a visible exchange takes inside the outgoing prompt: the full transcript wrapped in an `<inner-exchange>` frame whose opening explanation states that this is {{user}}'s private inner exchange, imperceptible to NPCs and the World, and defines the speaker labels (`IV:` for the Inner Voice, `{{user}}:` for {{user}}). It sits directly below its anchor message.

**Live edge**:
The latest main-chat message — the only place a new exchange turn can occur. {{user}} thinks through the story linearly; older exchanges remain readable and hideable but never extendable.

**Inner memory**:
What the extension chat's model sees: the depth-limited main chat with the summary integration covering older parts, and the non-hidden exchanges whose anchor messages are inside that visible slice, each placed directly below its anchor. A thought is visible to a model only where its anchor message is visible to that model — hidden or out-of-depth messages take their exchanges with them. The UI keeps every exchange readable regardless. The Inner Voice may recall, answer, or invent from it freely; invented callbacks can become true.

**Hide**:
A reversible per-exchange toggle that makes both models forget the exchange: it leaves the outgoing prompt and the extension chat's own context, and stops counting toward depth. It stays readable in the UI. Unhiding restores it everywhere. An exchange whose anchor message is hidden in the main chat is hidden with it automatically. Hiding is not deletion.

**Portray**:
The extension's impersonate: it writes {{user}}'s next main-chat input from what {{user}} presently holds — the feelings, plans, and conclusions of the live exchange, or {{user}}'s standing state when no exchange exists. Scope is {{user}}'s actions and dialogue only, never other characters. By default the result lands editable in the main-chat input box for the player to send; an option sends it immediately.

**Inner connection**:
The extension's own API and model settings, inherited from Copilot and separate from the main chat's connection. The inner life can run on a different model than the simulation; changing the main chat's model never silently changes the Inner Voice.

**Portray form**:
Global set-and-forget settings shaping how a portray is written, overridable in the drawer at fire time. Style: RP-style (actual dialogue and action, the default) or written summary (emits the feeling without quoted dialogue). Perspective: first person (default), second, or third. Scope is fixed and not a setting: {{user}}'s actions and dialogue only.

**Portray trigger**:
What fires a portray. A manual button always exists. Auto-trigger, when enabled, fires from natural conclusion cues inside the exchange — the Inner Voice directing ("you should probably tell her about...") or {{user}} resolving ("...yeah, let's just do that.") — in a tool-call-like way that can be turned off or set to manual-only. Firing and landing are independent settings: auto-trigger alone still drafts into the input box, and only deliberately enabling immediate send as well produces the fully hands-off mode. Defaults are manual trigger and input-box landing.

**Simulation view**:
What the outgoing prompt carries from the inner life. Exchange depth is a setting defaulting to 1: the most recent non-hidden exchanges up to that count appear, each placed below its anchor message. Hide always overrides. The main chat receives {{user}}'s present private state, not the whole inner history.
