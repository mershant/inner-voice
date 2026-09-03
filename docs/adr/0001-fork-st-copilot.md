# Fork ST-Copilot instead of building from the kit starter

Inner Voice needs a full chat window (streaming, scroll behavior, message widgets, settings,
payload assembly, Summaryception integration), and ST-Copilot (MIT, ~19k lines) already ships all
of it proven by daily use — including invisible integration behavior like
stop-autoscroll-when-scrolled-up that a rebuild would silently regress. We fork ST-Copilot and
strip unneeded features rather than scaffolding fresh and salvaging modules, because the maintainer cannot
debug UI regressions himself: a rebuilt UI puts every unexpected bug on the critical path, while a
fork only breaks where we deliberately delete.

## Consequences

- The commodity layer (chat UI, generation pipeline, sessions, settings) is inherited, not rewritten.
- Stripping happens before new work: unneeded feature modules (lorebook, character manager, image,
  stats) are deleted feature-by-feature along Copilot's existing module seams.
- The one deep surgery is the same as in any option: replace the free-floating session spine with
  message-anchored exchanges, add outgoing-prompt injection, and add portray. Copilot solves none
  of these.
- MIT attribution to upstream (QQ-Corporation / Quaren) is preserved.
- We inherit unread code and upstream design decisions; mitigation is that what remains after
  stripping is what is already known to work from daily use.
