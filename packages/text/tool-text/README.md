# @deepseek-ai/dsh-tool-text

English | [中文](README.zh.md)

The model-facing `text_stats` tool: pure, side-effect-free text measurements. It is the minimal in-repo tool-package example: one plugin file, one tool, no Config, no session or agent coupling.

## What it does

Registers one tool, `text_stats(text)`, on `ctx.tools`. The call is stateless — it measures the supplied string and returns the canonical result without touching a session, agent, file, or clock, so it needs no capability seam and no deployment configuration.

| Field | Semantics |
|---|---|
| `lines` | Newline-separated segment count (`text.split('\n').length`); empty text counts as one line. |
| `words` | Whitespace-delimited token count of the trimmed input; empty or whitespace-only text counts as zero. |
| `chars` | UTF-16 code-unit length of the input. |
| `nonWhitespaceChars` | Characters outside the Unicode `\s` class. |
| `bytes` | UTF-8 byte length (`TextEncoder`). |

## Export shape

A function/namespace plugin: it exports `name` / `inject` / `apply` and NO default. A stray `export default` would collapse the module via the Loader's `unwrapExports` and drop `inject` (see [docs/postmortem/0001](../../../docs/postmortem/0001-acp-default-export-drops-inject.md)).

## Rendering

The canonical result is the five counters; its Native renderer returns one compact summary line. The tool declares no `presentCall`/`presentResult`, so UIs fall back to the generic card — the honest render intent for a pure measurement with no file, command, or diff semantics.

## Model Experience

### Tool schema

#### What the model sees

The model sees the generated [`text_stats` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-text).

#### Token effect

Fixed schema cost on every request where the tool is visible.

#### KV Cache effect

Prefix-stable while the definition and visibility are unchanged. Plugin lifecycle or scoped restrictions may invalidate reuse from this schema.

### Tool-call history and result

#### What the model sees

Each assistant tool call retains the submitted `text` in its arguments. Success returns exactly `<lines> lines, <words> words, <chars> chars (<nonWhitespaceChars> non-whitespace), <bytes> bytes.` — for example `2 lines, 4 words, 22 chars (19 non-whitespace), 22 bytes.` The schema validates the required string before `execute` runs, and every string is measurable, so there are no domain failure paths.

#### Token effect

Token growth scales with the submitted `text`, which remains in call history until compaction. The result is fixed-shape and small.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

- **No file or stream input** — the tool measures only the submitted string; reading a file stays with the fs tools, and the caller supplies the text.
- **Plain Unicode semantics** — `chars` counts UTF-16 code units (a surrogate pair counts twice) and `nonWhitespaceChars` uses the `\s` class; grapheme-cluster counting is out of scope.
- **No Config surface** — the tool is deliberately configuration-free; a future deployment-varying option (for example a custom word-split pattern) would be added as a validated `Config` field, not a constant.
