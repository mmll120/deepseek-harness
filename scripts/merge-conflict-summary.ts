/**
 * Emit one structured, token-frugal report for an in-progress branch merge.
 *
 * The report replaces the exploratory command sequence an agent otherwise runs
 * before touching conflicts: branch topology, the unmerged file list, and a
 * per-file classification that says which conflicts are mechanically
 * resolvable (pairing records, the lockfile) and which need a human read.
 *
 * Run: `pnpm run merge-conflict-summary` (or `tsx scripts/merge-conflict-summary.ts`).
 * @module scripts/merge-conflict-summary
 */

import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

const UNMERGED_ENTRY = /^(\d+) ([0-9a-f]+) ([123])\t([\s\S]+)$/

/** One conflicted path and the blob object ids Git staged for it. */
interface UnmergedPath {
  path: string
  stages: Partial<Record<'ancestor' | 'current' | 'other', string>>
}

/** A classified conflict row for the report. */
interface ConflictRow {
  path: string
  kind: 'pairing-record' | 'lockfile' | 'manual'
  /** Blob line counts keyed by stage, present only for stages that exist. */
  lines: Partial<Record<'ancestor' | 'current' | 'other', number>>
}

/** Run one git command against the repository root, failing loud on errors. */
function runGit(args: string[]): string {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`git ${args.join(' ')} failed: ${detail}`)
  }
}

/** Read the current branch name from HEAD, or '(detached)' when not on a branch. */
function currentBranch(): string {
  try {
    const symbolic = execFileSync('git', ['-C', root, 'symbolic-ref', '--short', '-q', 'HEAD'], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    })
    return symbolic.trim() || '(detached)'
  } catch {
    return '(detached)'
  }
}

/** Count lines in one git blob without materializing it on disk. */
function blobLineCount(objectId: string): number {
  const content = execFileSync('git', ['-C', root, 'cat-file', 'blob', objectId], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return content.split('\n').length - (content.endsWith('\n') ? 1 : 0)
}

/** Parse `git ls-files --unmerged` output into per-path stage maps. */
function unmergedPaths(): Map<string, UnmergedPath> {
  const records = new Map<string, UnmergedPath>()
  const output = runGit(['ls-files', '--unmerged', '-z'])
  for (const entry of output.split('\0')) {
    if (entry === '') continue
    const match = UNMERGED_ENTRY.exec(entry)
    if (match?.[2] === undefined || match[3] === undefined || match[4] === undefined) {
      throw new Error(`git ls-files returned a malformed unmerged entry: ${JSON.stringify(entry)}`)
    }
    const path = match[4]
    const record = records.get(path) ?? { path, stages: {} }
    const field = match[3] === '1' ? 'ancestor' : match[3] === '2' ? 'current' : 'other'
    record.stages[field] = match[2]
    records.set(path, record)
  }
  return records
}

/** Classify one conflicted path by its mechanical resolution surface. */
function classify(path: string): ConflictRow['kind'] {
  if (path.endsWith('.i18n.yaml')) return 'pairing-record'
  if (path === 'pnpm-lock.yaml') return 'lockfile'
  return 'manual'
}

/** Line counts for every stage a path has, tolerating incomplete stages. */
function stageLineCounts(stages: UnmergedPath['stages']): ConflictRow['lines'] {
  const lines: ConflictRow['lines'] = {}
  for (const field of ['ancestor', 'current', 'other'] as const) {
    const objectId = stages[field]
    if (objectId !== undefined) lines[field] = blobLineCount(objectId)
  }
  return lines
}

/** A compact "<oid> <short-message>" line for one commit, or a marker when missing. */
function describeCommit(objectId: string | undefined): string {
  if (objectId === undefined || objectId.length === 0) return '(none)'
  const log = runGit(['log', '-1', '--oneline', objectId]).trim()
  return log === '' ? objectId.slice(0, 12) : log
}

/** The actionable next step for one conflict kind. */
function remedyFor(kind: ConflictRow['kind']): string {
  switch (kind) {
    case 'pairing-record':
      return 'run `pnpm run resolve-translation-pairing-conflicts`; re-record edited owners with `pnpm run verify-translation-pairing --write <pair>`'
    case 'lockfile':
      return 'merge the alphabetical snapshot hunks, then verify with `pnpm install` (a lockfile already up to date means the union was exact)'
    case 'manual':
      return 'read ours and theirs, then merge semantics (usually the union)'
  }
}

/** Report an in-progress merge, or the plain branch state when no merge exists. */
export function renderMergeReport(): string {
  let mergeHead = ''
  try {
    mergeHead = execFileSync('git', ['-C', root, 'rev-parse', '-q', '--verify', 'MERGE_HEAD'], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    }).trim()
  } catch (error) {
    // `-q --verify` exits 1 when MERGE_HEAD is absent; any other exit is a real failure.
    if ((error as { status?: number }).status !== 1) throw error
  }

  if (mergeHead === '') {
    const head = runGit(['rev-parse', 'HEAD']).trim()
    return [
      '=== no merge in progress ===',
      `  HEAD        ${head.slice(0, 12)} on ${currentBranch()}`,
      '  start one with `git merge --no-ff <src>`; conflicts are expected and this report classifies them.',
    ].join('\n')
  }

  const head = runGit(['rev-parse', 'HEAD']).trim()
  const base = runGit(['merge-base', head, mergeHead]).trim()
  const aheadOfBase = runGit(['rev-list', '--count', `${base}..${mergeHead}`]).trim()
  const behindBase = runGit(['rev-list', '--count', `${mergeHead}..${head}`]).trim()

  const unmerged = [...unmergedPaths().values()].sort((left, right) => left.path.localeCompare(right.path))
  const rows: ConflictRow[] = unmerged.map(entry => ({
    path: entry.path,
    kind: classify(entry.path),
    lines: stageLineCounts(entry.stages),
  }))

  const counts: Record<ConflictRow['kind'], number> = { 'pairing-record': 0, lockfile: 0, manual: 0 }
  for (const row of rows) counts[row.kind] += 1

  const lines: string[] = [
    '=== merge in progress ===',
    `  HEAD        ${describeCommit(head)} (${behindBase} commit(s) ahead of the merge base)`,
    `  MERGE_HEAD  ${describeCommit(mergeHead)} (${aheadOfBase} commit(s) ahead of the merge base)`,
    `  base        ${base.slice(0, 12)}`,
    '  commit      run `git commit --no-edit` after every conflict is staged',
    '',
    `=== ${String(rows.length)} unmerged file(s) ===`,
  ]
  for (const row of rows) {
    const lineCounts = ['ancestor', 'current', 'other']
      .map(field => `${field[0]}${String(row.lines[field as keyof ConflictRow['lines']] ?? '?')}L`)
      .join(' ')
    lines.push(`  [${row.kind}] ${row.path}`)
    lines.push(`      ${lineCounts}`)
  }
  lines.push(
    '',
    '=== next steps by kind ===',
    `  ${String(counts['pairing-record'])} pairing-record  → ${remedyFor('pairing-record')}`,
    `  ${String(counts.lockfile)} lockfile      → ${remedyFor('lockfile')}`,
    `  ${String(counts.manual)} manual        → ${remedyFor('manual')}`,
    '  Order rule: resolve pairing records BEFORE hand-editing their owner documents.',
  )
  return lines.join('\n')
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  process.stdout.write(`${renderMergeReport()}\n`)
}
