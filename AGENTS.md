# AGENTS.md

## What this is

`@moritakaaz/opencode-apc` — an opencode plugin that wraps `@tarquinen/opencode-dcp` with aggressive auto-compression defaults (15k token trigger). It ensures DCP config files exist before delegating all hook behavior to DCP.

## Commands

```bash
npm run build        # tsc → dist/
npm run prepublishOnly  # same as build (runs before npm publish)
```

No test suite exists. Verify changes by running `npm run build` and confirming zero TypeScript errors.

## Workflow for agents

When implementing a feature or fix:
1. Make the code change.
2. Update `README.md` if user-facing behaviour changes.
3. Update `AGENTS.md` if the change affects CLI surface, conventions,
   or anything an agent would need to know.
4. Commit all related files together and push.

Each logical change (feature, bugfix, doc improvement) gets its own
commit. Do not batch unrelated changes.

## Context management

Conversations with AI agents are token-limited. **Compress immediately
after every completed task or user prompt** — do not wait until the
context window is nearly full or until a "major transition" occurs.
This is non-negotiable; failing to compress promptly degrades retrieval
quality and wastes token budget on stale content.

Rules:
1. After finishing a task (commit pushed, question answered, etc.),
   compress all conversation content related to that task before
   responding to the next prompt.
2. Keep raw context only for the actively in-progress step; everything
   else must be crystallised into summaries.
3. If a single task spans many tool calls, compress intermediate
   exploration noise (failed attempts, verbose outputs) as soon as
   the exploration phase concludes and you have clear findings.
4. Never rely on "I'll compress later" — later never comes when
   context runs out mid-task.

## Git

Commit messages follow conventional-prose style (subject line + body).
Default branch is `master`. Remote is SSH
(`git@github.com:moritakaaz/opencode-auto-context-pruning.git`); the repo's local git config
sets `pushInsteadOf` so pushes go via SSH even when `git remote -v`
prints the HTTPS URL — this works around a global `insteadOf` rule.

## Architecture

Single-file plugin at `src/index.ts`:
1. `ensureGlobalConfig()` — writes `~/.config/opencode/dcp.jsonc` if missing
2. `ensureApcConfig(projectDir)` — writes `.opencode/dcp.jsonc` if missing
3. Dynamically imports and delegates to `@tarquinen/opencode-dcp`

Config is never overwritten if it already exists — user preferences always win.

## Key constraints

- DCP does not accept options via the plugin tuple. Config must live in `dcp.jsonc` files (global or project-level).
- `package.json` `files` array includes `dist/` and `dcp.jsonc` — keep these in sync if adding distributable assets.
- Peer dependency: `@opencode-ai/plugin >=1.4.3`. Do not import runtime code from it (types only).
- Module system: ESM (`"type": "module"`), `moduleResolution: "bundler"` in tsconfig.

## Publishing

```bash
npm publish --access public
```

Users install via: `opencode plugin @moritakaaz/opencode-apc@latest --global`

## DCP config values (in `.opencode/dcp.jsonc`)

| Setting | Value | Why |
|---------|-------|-----|
| maxContextLimit | 15000 | Triggers compression early to save tokens |
| minContextLimit | 8000 | Floor for compression target |
| nudgeFrequency | 3 | Nudge model to compress every 3 turns |
| nudgeForce | "strong" | Assertive system prompt nudging |
| deduplication | enabled | Removes duplicate tool calls |
| purgeErrors | turns: 2 | Prunes errored tool inputs after 2 turns |
