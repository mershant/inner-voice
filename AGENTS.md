# Inner Voice

A SillyTavern extension: a private chat between the Inner Voice and {{user}},
who experiences it as their own mind. Forked from ST-Copilot (see docs/adr/0001).

Read /home/opc/projects/st-extensions/AGENTS.md before working here, and load
the global `sillytavern-extension` skill for any extension work. Domain
vocabulary lives in CONTEXT.md; decisions live in docs/adr/. The concept
descends from the Self family in /home/opc/rp-prompting/prompts/perspective.

## Development environment

All live testing runs in the isolated STD installation at
`/home/opc/SillyTavern-Dev` (`http://127.0.0.1:8001`), never in main
SillyTavern. The extension kit at
`/home/opc/projects/st-extensions/sillytavern-extension-kit` owns the
deterministic checker, the STD installer, and the no-model smoke test
(`tools/st-extension check` / `smoke-std`); its `okf/index.md` documents the
environment contract. The upstream fork source (ST-Copilot) with its existing
unit tests lives at
`/home/opc/rp-prompting/workbench/extensions/st-copilot-image-generation/ST-Copilot`.

## Agent skills

### Issue tracker

Issues and PRDs are tracked as GitHub issues using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage labels are used without overrides. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo. See `docs/agents/domain.md`.
