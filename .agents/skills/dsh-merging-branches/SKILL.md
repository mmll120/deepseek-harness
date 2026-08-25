---
name: dsh-merging-branches
description: Use when merging one branch into the current branch and resolving conflicts on a deepseek-harness checkout, including "merge X into Y", "pull master into desktop", or any request that lands an updated trunk into a feature branch with conflict resolution. Prescribes the repository-owned conflict pipeline so the agent reads only the conflicts that need judgment.
---

# DSH Merging Branches

Merge one branch into the current branch and resolve conflicts with the repository's own tools. The goal is a valid merge commit with a clean worktree, not a rebase; desktop-style feature branches keep their history. The [pre-push checks](../dsh-pre-push-checks/SKILL.md) skill owns the push-side gate selection and the [stack landing skill](../dsh-merging-stacked-prs/SKILL.md) owns GitHub PR stacks; this skill stops at the merge commit and its validation.

## 0. Preflight — one pass, no retries

Establish topology and worktree state before touching anything:

```sh
git fetch origin
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD <src> origin/<src> origin/<current>
git merge-base HEAD <src>
git rev-list --count <base>..<src>     # src commits coming in
git rev-list --count <src>..HEAD       # current-branch commits preserved
```

Require a clean worktree (tracked and untracked) before merging. On a slow Windows checkout, `git status` can hang on untracked enumeration; use `git status -uno --short` and `git ls-files --others --exclude-standard` when the full form stalls. Abort if `origin/<current>` moved: fetch first, then compare `HEAD` to `origin/<current>`.

## 1. Run the merge

```sh
git merge --no-ff <src>
```

A non-zero exit with `MERGE_HEAD` present is the expected conflict outcome, not a failure. Do not abort; proceed to classification.

## 2. Classify conflicts — run the summary script first

```sh
pnpm run merge-conflict-summary
```

The script prints topology, the unmerged file list, and per-file classification (`pairing-record` / `lockfile` / `manual`) with blob line counts. Read manual conflicts only; do not open pairing records or the lockfile for line-by-line reading. The classification rule, also enforced by the script: `*.i18n.yaml` is a pairing record, `pnpm-lock.yaml` is the lockfile, everything else is manual.

## 3. Resolve by kind, in this order

### Pairing records (`*.i18n.yaml`)

Run the repository resolver first — before hand-editing any owner document:

```sh
pnpm run resolve-translation-pairing-conflicts
```

It recomposes records whose owner documents merged cleanly and stages them. It reports any pair whose owner has content conflicts (typically a README pair); those need a hand merge of the owner documents, then a re-record:

```sh
pnpm run verify-translation-pairing --write <owner>.md
```

Order rule: the resolver verifies the staged owner merge equals its own computation, so it must run before the owner files are hand-edited. After hand-editing an owner pair, always re-record with `--write`; never leave a stale record.

### Lockfile (`pnpm-lock.yaml`)

Conflicts are alphabetically adjacent additions in the `packages:` and `snapshots:` sections. Merge the union of both sides in sorted key order, then prove correctness:

```sh
pnpm install
```

An install that reports the lockfile "up to date" with no changes confirms the union was exact. Do not hand-fabricate entries beyond the two sides' union; the merged `package.json` files' dependency sets are covered by both sides' already-consistent lockfiles.

### Generated documents (`docs/tool-catalog.md`, `docs/module-graph.md`, …)

Generated docs auto-merge without conflict most of the time. Do not hand-edit them. Verify freshness against the merged sources and regenerate only when stale:

```sh
pnpm run verify-tool-catalog
pnpm run verify-module-graph
```

A stale check means a generated file needs `pnpm run gen-tool-catalog` / `pnpm run gen-module-graph`, followed by `pnpm run verify-translation-pairing --write <generated>.md` when the pairing record must follow.

### Manual conflicts

Read the current and other versions (conflict markers or `git show :2:<path>` / `git show :3:<path>`), then merge semantics: independent additions are usually a union, overlapping edits need the intent of both sides. Tests and spec expectation lists must reflect the merged catalog, not either parent alone. When both sides added whole test blocks, keep both. Stage each resolved file with `git add`.

## 4. Post-merge consistency — check before validating

The merged tree combines two independently green branches; invariants that held on each parent can break on the union. Fix these before running gates:

- **Workspace versions**: `pnpm run constraints` fails when a branch-only package (a feature branch's new package) keeps the old root version. Bump branch-only `package.json` versions to the merged root version.
- **Residue directories**: merge-deleted packages leave ignored `lib/`/`node_modules/` residue on disk; `constraints` reports them as "expected a package here". Delete those directories.
- **Redundant file extras**: when one parent declares `dsh.bundle.patch` and the other added the same file to `packageFileExtras`, the expected `files` list duplicates; drop the redundant extras entry.
- **Dependency sync**: run `pnpm install` so `node_modules` matches the merged lockfile (new transitive dependencies are common after a large merge).

## 5. Validate — fixed order, focused evidence

```sh
pnpm run verify-translation-pairing      # corpus-wide pairing consistency
pnpm run constraints                     # workspace invariants (versions, files, residue)
pnpm run verify-tool-catalog
pnpm run verify-module-graph
pnpm run verify-cordis-config
pnpm run verify-package-invariants
pnpm exec vitest run <resolved-spec-files>   # every conflict-adjacent spec
pnpm run typecheck                       # both tsconfig faces; heavy but required for merges
git diff --cached --check
```

Select further evidence through [dsh-pre-push-checks](../dsh-pre-push-checks/SKILL.md). Do not skip the focused vitest run: the merged catalog expectation and the client-modules graph are exactly where a resolved conflict regresses silently.

## 6. Commit and push

```sh
git commit --no-edit          # uses the merge message Git prepared
git push origin <current>
git rev-parse HEAD origin/<current>   # must match
```

The pre-commit hook checks staged pairing records and whitespace; the pre-push hook runs the incremental repository typecheck. Both already ran in the validation step above, so a push failure here means the remote moved — fetch and re-examine, never force-push.

## 7. Repository quirks that cost time

- Windows git can hang on `git status` in a large checkout; prefer targeted commands (`git diff --name-only --diff-filter=U`, `git ls-files --deleted`) and short timeouts with retry.
- `sh.exe ... fatal error - couldn't create signal pipe` noise during a merge is benign on Windows; the merge state on disk and in the index is authoritative.
- The agent sandbox blocks child-process spawns with piped stdio (EPERM): `tsx`, esbuild, vitest, and `pnpm` fail under confinement. Retry the exact command with the narrowest wider sandbox mode per repository policy; approval-prompt-free sessions reject escalation outright.
- pnpm writes lifecycle banners to stderr, which PowerShell surfaces as `NativeCommandError`; read `$LASTEXITCODE` and redirect output to a file (`*> out.txt`) instead of trusting the error records.
- `git show ":N:path"` (index stage syntax) can mis-resolve under PowerShell argument passing; use `git ls-files -s <path>` for stage object ids.
