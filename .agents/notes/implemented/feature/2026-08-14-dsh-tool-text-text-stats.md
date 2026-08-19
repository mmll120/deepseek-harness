# Agent Note: dsh-tool-text — a minimal stateless tool package

Status: implemented

English | [中文](2026-08-14-dsh-tool-text-text-stats.zh.md)

## Problem

Adding a workspace package must follow the [adding-a-package checklist](../../../../docs/cookbook/adding-a-package.md): package scaffold, aggregate registration, README Model Experience, invariant companion, bilingual pairing, and regenerated catalogs. The checklist had no minimal tool-shaped walk-through in the tree to copy, and the product had no pure, stateless text-measurement tool for the model. One package can serve both: a genuinely minimal example of the full checklist and a small `wc`-like capability.

## Decision

New group `packages/text/` with one package `@deepseek-ai/dsh-tool-text` registering `text_stats(text)` on `ctx.tools`. The computation is pure and stateless — `lines` counts newline-separated segments (empty text is one line), `words` counts whitespace-delimited tokens of the trimmed input (empty is zero), `chars` counts UTF-16 code units, `nonWhitespaceChars` counts characters outside the Unicode `\s` class, and `bytes` is the UTF-8 byte length. The tool declares no `presentCall`, so UIs use the generic fallback card, and there is no Config: the package needs no deployment choice and depends only on `dsh-tools`, `dsh-invariants`, and Cordis.

The package follows the checklist end to end: the `text/` group README, a project reference in `tsconfig.host.json`, the `@deepseek-ai/dsh-*` and `@deepseek-ai/dsh-*/invariant` wildcard entries in `tsconfig.base.json`, the `./invariant` companion with its empty-installer reason, bilingual READMEs with the canonical Model Experience sections, and an entry in the tool-catalog boot manifest in `scripts/gen-tool-catalog.ts` — required because the generator's completeness guard globs every `packages/*/tool-*` leaf and fails an unlisted package. `docs/tool-catalog.md` and `docs/module-graph.md` are regenerated in the same change.

Tests drive the real plugin: the unit spec mounts the plugin on a real `ToolRuntime` and asserts schema, execution, render, and fiber-disposal unregistration; a Loader-composition spec boots a real `cordis.yml` through the Loader and executes through the loaded tree; an invariant spec proves the companion reserves its package name and releases it on dispose. Per-file 100% coverage holds for `src/`.

## Alternatives considered

**Place it under `packages/examples/` as a demo bundle.** Excluded from the shipped tool catalog and lighter on gates — but the point is to demonstrate the full in-repo checklist, which is exactly the shipped-package path; a demo bundle would not have forced the generator manifest, pairing, or invariant gates.

**Give the tool a Config field (for example a word-split pattern).** Would demonstrate adjusting via `cordis.yml`, but violates the minimal brief and the rule against configurability without a current consumer; a required Config with no default would force every composition to choose it.

**Reuse an existing group.** `util/` is the zero-dependency utilities group and a tool depends on `dsh-tools`; `todo/` owns the task-list tool family. A new `text/` group follows the one-package-group precedent (`todo/`) and keeps the tool's home honest.

**Export a public `computeTextStats` helper.** Directly unit-testable, but a tool package's surface is `name`/`inject`/`apply`; the helper stays module-private and is exercised through `ctx.tools.execute` like a real caller.

## Consequences

The model gains a `text_stats` tool and the repo gains a minimal end-to-end tool-package example — scaffold, gates, catalogs, and bilingual docs — that later tool packages can copy. The cost is shipped product surface: a new group and package, a generator manifest entry, and two regenerated catalogs, all removable by deleting the package, reverting the generator entry, and regenerating the catalogs if the example outlives its purpose. Word-split and Unicode semantics are documented as limitations rather than made configurable.
