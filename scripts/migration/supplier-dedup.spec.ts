/**
 * Unit tests for the supplier dedup classifier (P3 / #28).
 *
 * Focus: the tiered classification rules. The canonical test cases protect
 * against regressions on the "Air Canada ≠ Air Canada Vacations" pattern
 * which we have explicit feedback memory about (see
 * feedback_supplier_dedup_ai_required.md).
 *
 * Note: tests use `classify()` directly with in-memory inputs; no DB or API.
 */

import {
  classify,
  normalize,
  jaroWinkler,
  hasBusinessClassDivergence,
} from './supplier-dedup'

const ALIASES = {
  aliases: [
    { canonical: 'Carnival Cruise Line', aliases: ['CCL', 'Carnival', 'Carnival Cruise Lines'] },
    { canonical: 'Air Canada', aliases: ['AC'] },
  ],
  must_not_merge: [
    {
      pair: ['Air Canada', 'Air Canada Vacations'] as [string, string],
      reason: 'Different IATA codes (AC airline vs ACV tour operator).',
    },
    {
      pair: ['WestJet', 'WestJet Vacations'] as [string, string],
      reason: 'WS airline vs vacations brand are different legal entities.',
    },
  ],
}

const TF_SUPPLIERS = [
  { id: 'uuid-1', name: 'Carnival Cruise Line' },
  { id: 'uuid-2', name: 'Air Canada' },
  { id: 'uuid-3', name: 'Air Canada Vacations' },
  { id: 'uuid-4', name: 'WestJet' },
  { id: 'uuid-5', name: 'Iberostar Hotels' },
  { id: 'uuid-6', name: 'Sunwing Airlines' },
]

describe('normalize', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalize('  Air   Canada  ')).toBe('air canada')
  })
  it('normalizes curly quotes', () => {
    expect(normalize('McDonald’s')).toBe("mcdonald's")
  })
})

describe('jaroWinkler', () => {
  it('returns 1 for identical strings', () => {
    expect(jaroWinkler('air canada', 'air canada')).toBe(1)
  })
  it('returns ~0.96 for one-letter typo on short strings', () => {
    expect(jaroWinkler('martha', 'marhta')).toBeGreaterThan(0.95)
  })
  it('returns lower score for very different strings', () => {
    expect(jaroWinkler('abc', 'xyz')).toBeLessThan(0.5)
  })
})

describe('hasBusinessClassDivergence', () => {
  it('flags "Air Canada" vs "Air Canada Vacations"', () => {
    expect(hasBusinessClassDivergence('Air Canada', 'Air Canada Vacations')).toBe(true)
  })
  it('flags WestJet vs WestJet Vacations', () => {
    expect(hasBusinessClassDivergence('WestJet', 'WestJet Vacations')).toBe(true)
  })
  it('does NOT flag two cruise lines that both have "Cruise"', () => {
    expect(hasBusinessClassDivergence('Carnival Cruise Line', 'Royal Caribbean Cruise')).toBe(false)
  })
  it('does NOT flag identical names', () => {
    expect(hasBusinessClassDivergence('Iberostar Hotels', 'Iberostar Hotels')).toBe(false)
  })
})

describe('classify — T0 exact match', () => {
  it('matches case-insensitive trimmed identical names', () => {
    const r = classify('  carnival cruise line  ', TF_SUPPLIERS, ALIASES)
    expect(r.tier).toBe('T0')
    expect(r.action).toBe('merge')
    expect(r.tfId).toBe('uuid-1')
  })
})

describe('classify — T1 alias whitelist', () => {
  it('merges "CCL" → "Carnival Cruise Line"', () => {
    const r = classify('CCL', TF_SUPPLIERS, ALIASES)
    expect(r.tier).toBe('T1')
    expect(r.tfId).toBe('uuid-1')
    expect(r.tfName).toBe('Carnival Cruise Line')
  })
  it('merges canonical name input that has alias entries', () => {
    // Even when input IS the canonical name, T0 catches it first
    const r = classify('Carnival Cruise Line', TF_SUPPLIERS, ALIASES)
    expect(r.tier).toBe('T0')
  })
  it('does not match aliases not in the whitelist', () => {
    const r = classify('UnknownAirline', TF_SUPPLIERS, ALIASES)
    expect(r.tier).toBe('T4')
  })
})

describe('classify — T2 safe fuzzy', () => {
  it('merges minor typo with high JW similarity and no business-class divergence', () => {
    const r = classify('Iberostar Hotel', TF_SUPPLIERS, ALIASES)
    expect(r.tier).toBe('T2')
    expect(r.tfId).toBe('uuid-5')
    expect(r.similarity).toBeGreaterThan(0.95)
  })
})

describe('classify — T3 business-class divergence (CRITICAL)', () => {
  it('routes "Air Canada Vacations" → T3 instead of merging to "Air Canada"', () => {
    const r = classify('Air Canada Vacations', TF_SUPPLIERS, ALIASES)
    expect(r.tier).toBe('T3')
    expect(r.action).toBe('human_review')
    expect(r.tfId).toBeNull()
    // Alternate candidates should surface Air Canada (and Air Canada Vacations itself
    // is in the TF list — so T0 would have caught it first if input matched. This test
    // simulates the case where ONLY Air Canada exists in TF and a new TES record is
    // "Air Canada Vacations". Force the test by excluding the Vacations row.)
    const tfWithoutVacations = TF_SUPPLIERS.filter((s) => s.id !== 'uuid-3')
    const r2 = classify('Air Canada Vacations', tfWithoutVacations, ALIASES)
    expect(r2.tier).toBe('T3')
    expect(r2.alternateCandidates.some((c) => c.name === 'Air Canada')).toBe(true)
  })

  it('routes "WestJet Vacations" → T3 instead of merging to "WestJet"', () => {
    const r = classify('WestJet Vacations', TF_SUPPLIERS, ALIASES)
    expect(r.tier).toBe('T3')
    expect(r.action).toBe('human_review')
    expect(r.tfId).toBeNull()
  })

  it('respects must_not_merge guard even with high JW', () => {
    // If TF has "Air Canada Vacations" and we lookup "Air Canada", the guard should
    // refuse to merge. With both names present in TF, the exact match for "Air Canada"
    // wins (T0). To exercise the guard, we need a TF where "Air Canada" is absent
    // but "Air Canada Vacations" is present, and we look up "Air Canada".
    const tfOnlyAcv = [{ id: 'uuid-3', name: 'Air Canada Vacations' }]
    const r = classify('Air Canada', tfOnlyAcv, ALIASES)
    expect(r.tier).toBe('T3')
    expect(r.action).toBe('human_review')
    expect(r.reasoning).toMatch(/must_not_merge guard/)
  })
})

describe('classify — T4 no match', () => {
  it('marks completely unknown names for create_new', () => {
    const r = classify('Some Totally New Tour Co', TF_SUPPLIERS, ALIASES)
    expect(r.tier).toBe('T4')
    expect(r.action).toBe('create_new')
  })
})
