# Inner Voice — exact source messages

Exact user messages from the founding grilling session (2026-09-03) and its follow-ups, preserved
byte-for-byte. `[pasted-context-1.txt]` markers are the messages' own attachment references,
preserved as written; the attachments' contents and trailing system-generated tool-call notes are
not user-authored and are not part of the source payloads.

## IV-S-001

- State: `recorded`
- Author: `user`
- Locator: `2026-09-03, session-opening message of the founding grilling session (skill-invocation preamble omitted)`

````
/sillytavern-extension  Extension Idea. Extensionifying this:

```
<private_reply>
## DEFINITION AND PURPOSE

`/selfq` and `sq:` ask {{user}} for a usually brief first-person private reply while external reality remains frozen.

## CONDITION

When the current input begins with exact `/selfq` or `sq:`, write only the private reply. No external time, body, object, environment, NPC, or World state changes during it.

## PROCEDURE

Write {{user}}'s private answer in first person. A blank command returns what {{user}} privately knows now. The private answer only reveals what {{user}} has shown to express, it does not add or assume opinions that haven't been proven. A style tag shapes only the private voice. An answer tag resolves only a private inner choice. Nothing becomes perceptible outside {{user}}. This condition overrides length policies, and can be short. Do not repeat what `sq:` already says.

## BROAD EXAMPLES

Scene: The established promise included returning home and several commitments {{user}} no longer fully believes.

Input: `sq: Which part of the promise still matters to me?`

`The part about returning. I don't know whether I still believe the rest.`
</private_reply>
```

Which is a child of this concept:

```
[pasted-context-1.txt]
```

Im thinking the ui should be similar to copilot's so we dont reinvent the wheel. but clean it up to something we'll only need. 

basically. the goal is, that this is a separate chat in which we can talk to {{user}} using the principles of s:. and another is the ability to keep an interaction at a certain message, so let's have a live take:

Eloise = {{user}}


Idea: the concept is that {{user}} believes that User is.... them, and like thinking that you are you, sometimes, you can argue with yourself, etc etc stuff like that. it can also feel like you are backseating {{user}}'s life but {{user}} believes that the backseat driver is.... themselves.

Terms:
User: the guiding thought / second voice to {{user}} (the character)
Simulation: Don't call it a roleplay, call it a simulation.
Main chat: the chat that is happening in the sillytavern simulation, outside the extension
Outgoing prompt: what the main chat sees.
exchange: One whole chat at a message. imagine like a checkpoint where User and {{user}} can think / chat, UNDER ONE MAIN CHAT MESSAGE.

Msg #1 
Kyrine, Eloise's sister  scenario

User Msg #2
User:
Eloise approaches and is talking to Kyrine, her sister, about a new friend

Msg #3 (Kyrine)
Kyrine teases eloise

Extension exchanges at msg #3:
talking to {{user}}. idk, imagine like a voice / guiding thing in {{user}}'s head. anything related to talking to yourself or thinking can happen here, it can be against you, with you, planning, etc etc.  whats great is the fact that by default, this can be in the outgoing prompt of the main chat at that specific non-hidden message (messages can be hidden in sillytavern. and i propose there should be an option in which you can settle how much depth these exchanges can be seen by the outgoing prompt of the main chat), there should be an easy hide button for a specific exchange so that the main chat doesn't see it.  

But here, User can be like "wtf? how can she talk to you/us/me like that?", {{user}} responds like you know, a realistic thought or something. i wouldnt put a limit to how long, but naturally it shouldnt be too long, it can be longer if needed.

It can be off topic like "what did we do yesterday? did we talk to kyrine about something", {{user}} won't find this question weird, it's like retrieving a memory that {{user}} experienced BUT User did not see but you know, have {{user}} recall something, the AI can answer that naturally.

The fun part and the selling point: so say, you have like a long exchange or even a short one... you can make {{user}} actually write and send a user input to the chat. yup. this should be some kind of tool call-like ability (which can be turned off, or made manually triggered), but the fun part is that you can be like "alright, TELL HER!" then the opinion formed from {{user}} with User, the stuff that {{user}} felt / planned or whatever from that exchange, will do a {{user}} input at msg #4  in which {{user}} acts. (There should be  options in the drawer on how it can be written. RP-style like you can see the actual dialogue, action, like an rp. Written summary style, doesn't write "qutation" dialogue, but emits the feeling. then you can choose the perspective like first person second person third person. the scope is {{user}}'s actions and dialogue only, not other characters.) this is similar to the impersonate feature in sillytavern but... MUCH MUCH feature rich. there should be a button for this in the chat pop-up of the extension for the impersonate feature, not the sillytavern impersonate, but the extension one, which i'll dub: portray, instead. this feature can be used even without an exchange, but carrying what {{user}} was already feeling. 

and another is like you can just go like: "you know what? i dont give a fuck." {{user}} can continue that line of thought like "This is bullshit anyway, bla bla bla...." 

or something like "Slap Kyrine." or "Twerk in front of kyrine" and {{user}} will be like what the fuck? because it'll be treated an intrusive thought as it's out of nowhere.

as for drawer design and the chat design, use /interface-design  skill.
````

## IV-S-002

- State: `recorded`
- Author: `user`
- Locator: `2026-09-03, answer to grilling Question 3 (exchange definition)`

````
A. yeah by exchange it is a conversation under one main chat message
````

## IV-S-003

- State: `recorded`
- Author: `user`
- Locator: `2026-09-03, correction during grilling Question 6/7 (live-linear exchanges)`
- Clarifies: IV-S-001; rejects the agent's reopenable-checkpoint reading

````
sounds about right. but question, what happens to an exchange when the next message starts? I was expecting one scrollable all in one, and you can navigate easily (intuitive UI design)  between exchanges indicating which exchanges occured on what message. 

i also think you might be misunderstanding how exchanges ac tually are. especially with that weird statement about msg #3 knowing about msg #7... like what are you talking about? this is something that the user goes through LIVE linearly. in sillytavern, you stop at an ai message, and at that ai message you can have an exchange in the extension.... so your msg 3 and msg 7 doesnt make sense t me
````

## IV-S-004

- State: `recorded`
- Author: `user`
- Locator: `2026-09-03, answer to grilling Question 7 (two context windows; confabulation caution)`
- Clarifies: IV-S-001

````
i mean obviously not? how would that be even possible at all? here's the thing: the extension can have the  option to remember all of the thoughts within that ui, but the main chat has a separate context window of what it can see. do you get me? 

Here's a glimpse of what it looks like:

msg #3 
<iv>
...


msg #5
<iv>
...


each exchange is right below the context. but wisely enough, i recommend that the main chat can only see one exchange, while the extension chat can see pretty much all exchanges. 

and also, caution: "hey, about what Kyrine said earlier" yes, we can callback to anything thought about, but we can also callback to anything that doesnt actual exist, like "hey remember that time you twerked in front of kyrine accidentally?" then that can be an actual thing that happened. and can also ask "hey what's our next class?" even though the sim hasnt established it.... it can make it up—but anyway, i dont think most of these should be mentioned in the system prompt since it might be natural behavior, the only danger is doing the opposite, like: "Only refer to the source...." dangerous prompts like that
````

## IV-S-005

- State: `recorded`
- Author: `user`
- Locator: `2026-09-03, answer to grilling Question 9 (portray routing and triggers)`

````
yeah, a as default but B as an option. it should accept inputs like "you sohuld probably tell her about...." and proper triggers, or even like say eloise is alone, plans aobut something in exchange and says: "...yeah. lets just do that." it triggers

and as i said, a manual button for portray.
````

## IV-S-006

- State: `recorded`
- Author: `user`
- Locator: `2026-09-03, correction during grilling Question 12 (hide semantics)`
- Clarifies: IV-S-001

````
yep thats good, but hiding also makes the exchange chat forget it ecause its hidden, not jsut from main chat.
````

## IV-S-007

- State: `recorded`
- Author: `user`
- Locator: `2026-09-04, complaint after ticket #4 live output (assistant register); attachment reference preserved as written`
- Clarifies: IV-S-001 (the model answers as {{user}})

````
Concerns. right now its talking like an assistant rather than {{user}}, but this is ticket 4. normal or no?

```
[pasted-context-1.txt]
```
````

Concept file: [`../concepts/inner-voice.md`](../concepts/inner-voice.md)
