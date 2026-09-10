# Inner Voice

This context names the entities and boundaries of the Inner Voice SillyTavern extension: private
thinking and in-scene conversations under main-chat checkpoints.

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

**Voice session**:
A session belonging to one named character. The default session is {{user}}'s private thinking. Additional sessions are created by typing a name; a matching character card is optional. Each named character has IV and Chat pages within the same session.

**Page**:
The displayed IV or Chat history inside a character session. A page determines who is speaking in the next response and which editable instructions apply. Separate displayed histories do not mean separate model context. Switching pages changes neither the main-chat checkpoint nor what saved turns mean.

**Chat**:
An actual conversation in the scene: the player speaks as the active persona ({{user}}) to the named character ({{voice}}), and the model answers as that character. Dialogue and any actions written under the editable Chat instructions have happened in the simulation. Who heard or witnessed them follows the scene. Chat is not private IV, a proposal to act later, or self-chat for the persona.

**Exchange**:
One voice's IV or Chat conversation anchored under one main-chat message. A main-chat message can hold both kinds for each voice. Their turns share the order in which they occurred, including switches between pages or characters within that checkpoint. Legacy exchanges are IV.

**Exchange block**:
The framed transcript beside its main-chat anchor. An IV block names its owning mind and says the thoughts are private, not speech anyone else heard. A Chat block names the persona and character and says the conversation and its actions have happened; the simulation continues after its last turn. Interleaved exchanges appear in chronological portions, not sorted by page or character.

**Live edge**:
The latest main-chat message — the only place a new exchange turn can occur. {{user}} thinks through the story linearly; older exchanges remain readable and hideable but never extendable.

**Inner memory**:
What the extension's model sees: the selected main-chat slice with its available summary, eligible exchanges beside their anchors, and the enabled character, world, and persona knowledge. Each character's IV and Chat can read that character's exchanges in both modes. The persona's IV also sees the conversations the persona has had in named characters' Chat pages, but not those characters' private IV. Reading history does not import another page's system or post-history instructions. Hidden or out-of-context anchors take their exchanges with them; the UI keeps them readable. The Inner Voice may recall, answer, or invent freely; invented callbacks can become true.

**Hide**:
A reversible per-exchange toggle that removes that voice's IV or Chat exchange from both models' context while keeping it readable. The other page is unaffected. IV stops counting toward its depth. An exchange whose anchor is hidden in main chat is hidden with it automatically. Unhiding restores eligibility, not a new copy; hiding is not deletion or a change to what happened.

**Portray**:
The extension's impersonate: it writes {{user}}'s next main-chat input as an action responding to the world given the present circumstances. The seed is the extension's own input box beside the Portray button: text there has already decided what {{user}} does — pressing Portray consumes it as authored conduct (it does not become an exchange turn), and the turn performs that conduct first, at the same scale and substance, in {{user}}'s established voice. The live exchange is a supporting opinion that tilts how {{user}} acts — never material to restage, summarize, or synthesize into the turn. With an empty seed box and no exchange, the turn comes from {{user}}'s standing state. Scope is {{user}}'s actions and dialogue only, never other characters. The main-chat input box is only where the result lands — editable for the player to send by default, sent immediately as an option — and is never read as a seed.

**Inner connection**:
The extension's own API and model settings, inherited from Copilot and separate from the main chat's connection. The inner life can run on a different model than the simulation; changing the main chat's model never silently changes the Inner Voice. Reasoning level is one of those settings: Unset leaves the request alone; any other choice overrides thinking on Inner Voice requests only and never edits the selected SillyTavern preset.

**Portray form**:
Global set-and-forget settings shaping how a portray is written, overridable in the drawer at fire time. Style: RP-style (actual dialogue and action, the default) or written summary (emits the feeling without quoted dialogue). Perspective: first person (default), second, or third. Scope is fixed and not a setting: {{user}}'s actions and dialogue only.

**Portray trigger**:
What fires a portray. A manual button always exists. Auto-trigger, when enabled, fires from natural conclusion cues inside the exchange — the Inner Voice directing ("you should probably tell her about...") or {{user}} resolving ("...yeah, let's just do that.") — in a tool-call-like way that can be turned off or set to manual-only. Firing and landing are independent settings: auto-trigger alone still drafts into the input box, and only deliberately enabling immediate send as well produces the fully hands-off mode. Defaults are manual trigger and input-box landing.

**Simulation view**:
What the outgoing prompt carries from the inner life. Two depth settings: exchange depth for {{user}} (default 1) and a separate exchange depth for all other voices (default 1). Depth is judged per voice: every voice whose non-hidden exchange falls within its applicable depth shows at its anchor. Voices never compete for slots, so one talkative mind cannot crowd another out. Multiple voices' blocks coexist under the same anchor. Hide always overrides. The main chat receives each mind's present private state, not the whole inner history.

Chat does not use these IV depth slots. It stays included for as long as its anchor is visible and present in the actual receiving model's context, with no independent exchange-count expiry. This is permanent but anchor-bound, not a pin into every request. All eligible IV and Chat turns at an anchor retain their shared order, regardless of the open page. Inclusion in a main-model request does not mean a conversation has been summarized; Chat summary integration belongs to the companion work.
