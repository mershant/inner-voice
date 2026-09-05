# Restores are verbatim restores

When reinstating anything the #2 strip removed, the upstream ST-Copilot implementation in fork
history — including its settings surface, field selection, defaults, and UI affordances — is the
spec. Port it, subtracting only the parts that belong to deleted features (editors, managers,
writing paths). Do not redesign, simplify, merge settings, or re-decide defaults: the upstream
version shipped, was used daily by the maintainer, and is the approved design. A restore ticket
names the fork-history commit and module it ports from. This exists because three restores in a
row (voice register #11, card block #21, seed source #22) replaced proven upstream behavior with
session-invented designs the maintainer never approved.
