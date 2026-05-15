#!/usr/bin/env tsx
/**
 * Supplier Dedup Classifier (P3 / #28)
 *
 * Pre-cutover classifier that pairs each incoming TES supplier (from
 * suppliers.json) against existing TF suppliers and emits a tier verdict:
 *
 *   T0  exact case-insensitive name match                → auto-merge
 *   T1  curated alias whitelist match                    → auto-merge
 *   T2  safe fuzzy (JW ≥ 0.95) + no business-class word
 *       divergence + not in must_not_merge guard list    → auto-merge
 *   T3  high similarity WITH business-class divergence
 *       (e.g. "Air Canada" vs "Air Canada Vacations")    → human review (AI tiebreaker)
 *   T4  no candidate                                     → create new
 *
 * Outputs a CSV of decisions for human review. T3 rows are the only ones
 * that require attention — they include the top similar TF candidates and
 * the reason the auto-tier was blocked.
 *
 * The AI tiebreaker for T3 is intentionally NOT bundled with this script
 * (Codex SMALL FIX from 2026-05-15: the runtime importer should not
 * depend on an LLM SDK). The intended flow is:
 *
 *   1. supplier-dedup.ts → supplier-merge-decisions.csv
 *   2. Operator runs a separate Claude-driven step on the T3 rows offline
 *      and writes decisions back into the CSV.
 *   3. The signed CSV is committed back as supplier-aliases-signed.json.
 *   4. Importer Step 1 reads supplier-aliases-signed.json BEFORE calling
 *      POST /suppliers, looking up the TF UUID for any TES name in the map.
 *
 * Usage:
 *   tsx scripts/migration/supplier-dedup.ts \
 *     --tes data/migration/suppliers.json \
 *     --tf-source api \
 *     --out scripts/migration/output/supplier-merge-decisions.csv
 *
 * --tf-source api    fetch from API_BASE/suppliers (auth via SUPABASE_*)
 * --tf-source db     read suppliers table via DATABASE_URL (faster)
 *
 * See docs/runbooks/tes-cutover-backfill-plan.md (Phase 3) and the
 * "Air Canada ≠ Air Canada Vacations" memory note.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

// ============================================================================
// TYPES
// ============================================================================

interface TesSupplier {
  TourOperatorID: number
  TourOperatorName: string
}

interface TfSupplier {
  id: string
  name: string
}

interface AliasEntry {
  canonical: string
  aliases: string[]
}

interface MustNotMergePair {
  pair: [string, string]
  reason: string
}

interface AliasConfig {
  aliases: AliasEntry[]
  must_not_merge: MustNotMergePair[]
}

type Tier = 'T0' | 'T1' | 'T2' | 'T3' | 'T4'

interface Decision {
  tesId: number
  tesName: string
  tier: Tier
  action: 'merge' | 'human_review' | 'create_new'
  tfId: string | null
  tfName: string | null
  similarity: number | null
  reasoning: string
  alternateCandidates: Array<{ id: string; name: string; similarity: number }>
}

// ============================================================================
// NORMALIZATION + DISTANCE
// ============================================================================

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[‘’“”]/g, "'")
    .replace(/\s+/g, ' ')
}

/**
 * Jaro-Winkler similarity in [0, 1]. Returns 1 for identical, 0 for fully
 * dissimilar. Implementation per Winkler 1990 (prefix scaling factor 0.1,
 * max prefix length 4).
 */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1
  if (!a.length || !b.length) return 0

  const matchWindow = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1)
  const aMatches = new Array(a.length).fill(false)
  const bMatches = new Array(b.length).fill(false)
  let matches = 0
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow)
    const end = Math.min(i + matchWindow + 1, b.length)
    for (let j = start; j < end; j++) {
      if (bMatches[j]) continue
      if (a[i] !== b[j]) continue
      aMatches[i] = true
      bMatches[j] = true
      matches++
      break
    }
  }
  if (matches === 0) return 0

  let transpositions = 0
  let k = 0
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue
    while (!bMatches[k]) k++
    if (a[i] !== b[k]) transpositions++
    k++
  }
  transpositions /= 2

  const jaro = (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3

  // Winkler prefix bonus
  let prefix = 0
  const maxPrefix = Math.min(4, a.length, b.length)
  for (let i = 0; i < maxPrefix; i++) {
    if (a[i] === b[i]) prefix++
    else break
  }
  return jaro + prefix * 0.1 * (1 - jaro)
}

// ============================================================================
// BUSINESS-CLASS WORD GUARD
// ============================================================================

// Words whose presence/absence between two names indicates the names refer
// to legally-distinct entities (e.g. an airline vs its vacation subsidiary).
// If either name contains one of these and the other doesn't, refuse to
// auto-merge at T2 — route to T3 for human review.
const BUSINESS_CLASS_WORDS = new Set([
  'vacations',
  'holidays',
  'tours',
  'airlines',
  'airways',
  'air',
  'cruises',
  'cruise',
  'travel',
  'holidays',
])

export function hasBusinessClassDivergence(a: string, b: string): boolean {
  const tokensA = new Set(normalize(a).split(' '))
  const tokensB = new Set(normalize(b).split(' '))
  for (const w of BUSINESS_CLASS_WORDS) {
    if (tokensA.has(w) !== tokensB.has(w)) return true
  }
  return false
}

// ============================================================================
// CLASSIFIER
// ============================================================================

export function classify(
  tesName: string,
  tfSuppliers: TfSupplier[],
  config: AliasConfig
): Omit<Decision, 'tesId' | 'tesName'> {
  const tesNorm = normalize(tesName)

  // T0 exact match
  const exact = tfSuppliers.find((s) => normalize(s.name) === tesNorm)
  if (exact) {
    return {
      tier: 'T0',
      action: 'merge',
      tfId: exact.id,
      tfName: exact.name,
      similarity: 1,
      reasoning: 'exact (case-insensitive trimmed) name match',
      alternateCandidates: [],
    }
  }

  // T1 alias whitelist match — tes name is an alias of some canonical TF entry
  for (const entry of config.aliases) {
    const aliasMatch = entry.aliases.some((a) => normalize(a) === tesNorm)
    const canonicalMatch = normalize(entry.canonical) === tesNorm
    if (aliasMatch || canonicalMatch) {
      const tfMatch = tfSuppliers.find((s) => normalize(s.name) === normalize(entry.canonical))
      if (tfMatch) {
        return {
          tier: 'T1',
          action: 'merge',
          tfId: tfMatch.id,
          tfName: tfMatch.name,
          similarity: 1,
          reasoning: `alias whitelist → canonical "${entry.canonical}"`,
          alternateCandidates: [],
        }
      }
    }
  }

  // Compute JW against all TF suppliers
  const scored = tfSuppliers
    .map((s) => ({ tf: s, similarity: jaroWinkler(tesNorm, normalize(s.name)) }))
    .filter((c) => c.similarity >= 0.85) // soft floor before fuzzy gates
    .sort((a, b) => b.similarity - a.similarity)

  if (scored.length === 0) {
    return {
      tier: 'T4',
      action: 'create_new',
      tfId: null,
      tfName: null,
      similarity: null,
      reasoning: 'no candidate above 0.85 JW similarity',
      alternateCandidates: [],
    }
  }

  const top = scored[0]!

  // must_not_merge guard — if the (tes, top.tf) pair is in the deny list, refuse
  // to auto-merge under any fuzzy tier and route to human review.
  const isGuarded = config.must_not_merge.some((entry) => {
    const [a, b] = entry.pair.map(normalize)
    const topNorm = normalize(top.tf.name)
    return (
      (tesNorm === a && topNorm === b) ||
      (tesNorm === b && topNorm === a)
    )
  })

  if (isGuarded) {
    return {
      tier: 'T3',
      action: 'human_review',
      tfId: null,
      tfName: null,
      similarity: top.similarity,
      reasoning: `must_not_merge guard hit (top candidate: "${top.tf.name}")`,
      alternateCandidates: scored.slice(0, 3).map((c) => ({
        id: c.tf.id,
        name: c.tf.name,
        similarity: c.similarity,
      })),
    }
  }

  // T2 safe fuzzy: JW ≥ 0.95 AND no business-class divergence
  if (top.similarity >= 0.95 && !hasBusinessClassDivergence(tesName, top.tf.name)) {
    return {
      tier: 'T2',
      action: 'merge',
      tfId: top.tf.id,
      tfName: top.tf.name,
      similarity: top.similarity,
      reasoning: `safe fuzzy JW=${top.similarity.toFixed(3)}`,
      alternateCandidates: scored.slice(1, 4).map((c) => ({
        id: c.tf.id,
        name: c.tf.name,
        similarity: c.similarity,
      })),
    }
  }

  // T3 borderline: high similarity but blocked by business-class divergence
  // OR JW between 0.85 and 0.95
  if (top.similarity >= 0.85) {
    const reason = hasBusinessClassDivergence(tesName, top.tf.name)
      ? `business-class word divergence (top candidate: "${top.tf.name}")`
      : `mid-range similarity JW=${top.similarity.toFixed(3)} below auto-merge threshold`
    return {
      tier: 'T3',
      action: 'human_review',
      tfId: null,
      tfName: null,
      similarity: top.similarity,
      reasoning: reason,
      alternateCandidates: scored.slice(0, 3).map((c) => ({
        id: c.tf.id,
        name: c.tf.name,
        similarity: c.similarity,
      })),
    }
  }

  // Defensive fallthrough (shouldn't reach here given the filter at 0.85 above)
  return {
    tier: 'T4',
    action: 'create_new',
    tfId: null,
    tfName: null,
    similarity: top.similarity,
    reasoning: 'no candidate above 0.85 JW similarity',
    alternateCandidates: [],
  }
}

// ============================================================================
// IO HELPERS
// ============================================================================

async function fetchTfSuppliersFromApi(apiBase: string, token: string): Promise<TfSupplier[]> {
  // Page through GET /suppliers (limit max 100 per page typically)
  const all: TfSupplier[] = []
  let page = 1
  for (;;) {
    const resp = await fetch(`${apiBase}/suppliers?limit=100&page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!resp.ok) {
      throw new Error(`GET /suppliers page=${page} failed (${resp.status}): ${await resp.text()}`)
    }
    const body = (await resp.json()) as { suppliers: TfSupplier[]; totalPages: number }
    all.push(...body.suppliers.map((s) => ({ id: s.id, name: s.name })))
    if (page >= body.totalPages) break
    page++
  }
  return all
}

function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function writeCsv(decisions: Decision[], outPath: string): void {
  mkdirSync(dirname(outPath), { recursive: true })
  const header = [
    'tes_id',
    'tes_name',
    'tier',
    'action',
    'tf_id',
    'tf_name',
    'similarity',
    'reasoning',
    'alternates',
    'final_decision_human',
    'approver_human',
  ].join(',')

  const rows = decisions.map((d) =>
    [
      d.tesId,
      csvEscape(d.tesName),
      d.tier,
      d.action,
      d.tfId ?? '',
      csvEscape(d.tfName ?? ''),
      d.similarity !== null ? d.similarity.toFixed(4) : '',
      csvEscape(d.reasoning),
      csvEscape(d.alternateCandidates.map((c) => `${c.name} (${c.similarity.toFixed(3)})`).join(' | ')),
      '',
      '',
    ].join(',')
  )

  writeFileSync(outPath, [header, ...rows].join('\n') + '\n', 'utf-8')
}

function summary(decisions: Decision[]): Record<Tier, number> {
  const counts: Record<Tier, number> = { T0: 0, T1: 0, T2: 0, T3: 0, T4: 0 }
  for (const d of decisions) counts[d.tier]++
  return counts
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs(argv: string[]): {
  tesPath: string
  tfSource: 'api' | 'db'
  outPath: string
  aliasesPath: string
} {
  const args: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a.startsWith('--')) {
      args[a.slice(2)] = argv[i + 1] ?? ''
      i++
    }
  }
  return {
    tesPath: args.tes ?? 'data/migration/suppliers.json',
    tfSource: (args['tf-source'] as 'api' | 'db') ?? 'api',
    outPath: args.out ?? 'scripts/migration/output/supplier-merge-decisions.csv',
    aliasesPath: args.aliases ?? 'scripts/migration/supplier-aliases.json',
  }
}

async function main(): Promise<void> {
  const { tesPath, tfSource, outPath, aliasesPath } = parseArgs(process.argv.slice(2))

  console.log(`Loading TES suppliers from ${tesPath}`)
  const tes = JSON.parse(readFileSync(resolve(tesPath), 'utf-8')) as TesSupplier[]
  console.log(`  ${tes.length} TES suppliers loaded`)

  console.log(`Loading alias config from ${aliasesPath}`)
  const config = JSON.parse(readFileSync(resolve(aliasesPath), 'utf-8')) as AliasConfig
  console.log(`  ${config.aliases.length} alias entries, ${config.must_not_merge.length} must-not-merge guards`)

  let tf: TfSupplier[] = []
  if (tfSource === 'api') {
    const apiBase = process.env.API_BASE ?? ''
    const token = process.env.AUTH_TOKEN ?? ''
    if (!apiBase || !token) {
      throw new Error('--tf-source api requires API_BASE + AUTH_TOKEN env vars')
    }
    console.log(`Fetching TF suppliers from ${apiBase}`)
    tf = await fetchTfSuppliersFromApi(apiBase, token)
  } else {
    throw new Error('--tf-source db not yet implemented (use api for now)')
  }
  console.log(`  ${tf.length} TF suppliers loaded`)

  const decisions: Decision[] = tes.map((t) => {
    const result = classify(t.TourOperatorName, tf, config)
    return {
      tesId: t.TourOperatorID,
      tesName: t.TourOperatorName,
      ...result,
    }
  })

  writeCsv(decisions, resolve(outPath))
  console.log(`\nWrote ${decisions.length} decisions to ${outPath}`)
  console.log('Tier breakdown:')
  for (const [tier, count] of Object.entries(summary(decisions))) {
    console.log(`  ${tier}: ${count}`)
  }
  console.log(
    '\nT3 rows require human review (AI tiebreaker) before signing the alias map.'
  )
}

// Only run main when invoked as a script, not when imported by tests
if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
