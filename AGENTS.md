# Inner Voice

A SillyTavern extension: a private chat between the Inner Voice and {{user}},
who experiences it as their own mind. Forked from ST-Copilot (see docs/adr/0001).

Read /home/opc/projects/st-extensions/AGENTS.md before working here, and load
the global `sillytavern-extension` skill for any extension work. Domain
vocabulary lives in CONTEXT.md; decisions live in docs/adr/. The concept
descends from the Self family in /home/opc/rp-prompting/prompts/perspective.

## Agent skills

### Issue tracker

Issues and PRDs are tracked as GitHub issues using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage labels are used without overrides. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo. See `docs/agents/domain.md`.
