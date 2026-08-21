# Agent Note: Token-frugal branch-merge workflow

Status: implemented

English | [中文](2026-08-20-token-frugal-branch-merge-workflow.zh.md)

## Problem

Merging an updated trunk into a feature branch and resolving conflicts spends most of an agent's budget on discovery rather than judgment: topology probing, retried commands on slow checkouts, locating the repository's own pairing resolver and verification gates, and reading generated conflicts line by line. Each merge repeats the same exploration, and the mechanical majority of conflicts (pairing records, the lockfile) is already handled by repository tools the agent only finds by trial.

## Decision

The repository ships a workflow skill plus one non-model-visible summary script so agents classify before they read.

`.agents/skills/dsh-merging-branches/SKILL.md` prescribes the full pipeline: preflight topology and worktree checks, `git merge --no-ff`, conflict classification by path pattern, per-kind resolution (pairing records through `resolve-translation-pairing-conflicts`, the lockfile as an alphabetical union verified by `pnpm install`, generated documents through their freshness gates), the post-merge consistency checklist (workspace versions, residue directories, redundant `packageFileExtras`, dependency sync), a fixed validation order, and commit/push.

`scripts/merge-conflict-summary.ts` (run as `pnpm run merge-conflict-summary`) emits one structured report for an in-progress merge: branch topology, the unmerged file list, and each file's classification (`pairing-record` / `lockfile` / `manual`) with blob line counts. The agent reads only `manual` conflicts; pairing records and the lockfile are resolved by repository tools, not by line-by-line reading.

The script is a plain repository script, not a model-visible tool package: no catalog registration, no Model Experience surface, no per-file coverage gate. Its classification rule matches the path filter the pairing resolver already encodes.

## Verification

The script's report was produced against a real conflicted merge (13 unmerged files: 7 pairing records, 1 lockfile, 5 manual) and matched the resolution path the merge actually took. `pnpm run verify-skill-invocation-metadata` keeps the skill's Claude/Codex invocation metadata aligned; the script typechecks under the host tsconfig face.

## Alternatives considered

**A model-visible tool package (`tool-git-merge`).** Highest token savings, but costs a package with per-file 100% coverage, catalog registration (including the generated tool catalog's expectation list), Model Experience documentation, and ongoing maintenance as a model-facing surface. The summary script captures most of the savings at a fraction of the cost.

**Skill only, no script.** Removes the discovery cost but keeps per-merge probing commands inside the agent's context; the script additionally collapses topology and classification into one read.

## Consequences

Agents handling merges read only manual conflicts and the fixed check list. The script is deliberately read-only: it classifies and reports, and never stages or edits, so a wrong classification cannot mutate the merge state. Repository gates remain the validation authority; the skill's check order exists to fail fast, not to replace `doc-sync` or CI.
