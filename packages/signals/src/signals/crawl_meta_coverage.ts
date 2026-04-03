import type { Signal, SignalResult, AuditContext } from '../types.js'

const META_MIN = 70
const META_MAX = 160

export const crawlMetaCoverage: Signal = {
  id: 'crawl_meta_coverage',
  category: 'seo_technique',
  weight: 2,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    if (!ctx.crawl) {
      return { score: 0, status: 'skipped', details: { reason: 'Aucun crawl Screaming Frog fourni' }, recommendations: [] }
    }

    const indexable = ctx.crawl.rows.filter(
      (r) => r.statusCode === 200 && r.indexable && r.contentType.includes('text/html'),
    )

    if (indexable.length === 0) {
      return { score: 100, status: 'good', details: { total: 0 }, recommendations: [], summary: 'Aucune page indexable à analyser' }
    }

    const total = indexable.length

    // ── Meta descriptions manquantes
    const missing = indexable.filter((r) => !r.metaDescription.trim())
    const missingRatio = missing.length / total

    // ── Trop courtes (présentes mais < 70 chars) — tronquées ou peu descriptives
    const tooShort = indexable.filter((r) => {
      const len = r.metaDescriptionLength
      return len > 0 && len < META_MIN
    })

    // ── Trop longues (> 160 chars) — tronquées dans les SERPs
    const tooLong = indexable.filter((r) => r.metaDescriptionLength > META_MAX)

    // ── Dupliquées (même contenu pour plusieurs pages)
    const metaMap = new Map<string, string[]>()
    for (const r of indexable) {
      const m = r.metaDescription.trim()
      if (!m) continue
      const existing = metaMap.get(m) ?? []
      existing.push(r.url)
      metaMap.set(m, existing)
    }
    const duplicateGroups = [...metaMap.entries()].filter(([, urls]) => urls.length > 1)
    const duplicatedUrls = duplicateGroups.reduce((s, [, u]) => s + u.length, 0)

    // ── H1 manquants (bonus, données disponibles)
    const missingH1 = indexable.filter((r) => !r.h1.trim())
    const multipleH1 = indexable.filter((r) => r.h1Count > 1)

    const recommendations: string[] = []

    if (missingRatio > 0.3) {
      recommendations.push(
        `${missing.length} pages (${Math.round(missingRatio * 100)}%) sans meta description — Google génère alors son propre extrait, souvent peu engageant. Rédiger des meta descriptions uniques améliore directement le CTR dans les SERPs.`,
      )
    } else if (missing.length > 0) {
      recommendations.push(
        `${missing.length} page${missing.length > 1 ? 's' : ''} sans meta description — compléter en priorité les pages à fort trafic potentiel.`,
      )
    }

    if (tooLong.length > 0) {
      recommendations.push(
        `${tooLong.length} meta description${tooLong.length > 1 ? 's' : ''} trop longue${tooLong.length > 1 ? 's' : ''} (> ${META_MAX} chars) — elles seront tronquées dans Google. Raccourcir tout en conservant le mot-clé et le CTA.`,
      )
    }

    if (tooShort.length > 0) {
      recommendations.push(
        `${tooShort.length} meta description${tooShort.length > 1 ? 's' : ''} trop courte${tooShort.length > 1 ? 's' : ''} (< ${META_MIN} chars) — elles n'exploitent pas l'espace disponible dans les SERPs pour convaincre l'internaute de cliquer.`,
      )
    }

    if (duplicateGroups.length > 0) {
      const ex = duplicateGroups.slice(0, 2).map(([text, urls]) =>
        `"${text.slice(0, 50)}…" → ${urls.length} pages`
      ).join(' ; ')
      recommendations.push(
        `${duplicateGroups.length} groupe${duplicateGroups.length > 1 ? 's' : ''} de meta descriptions dupliquées (${duplicatedUrls} pages) — chaque page doit avoir une description unique adaptée à son contenu. Ex : ${ex}.`,
      )
    }

    if (missingH1.length > 0) {
      recommendations.push(
        `${missingH1.length} page${missingH1.length > 1 ? 's' : ''} sans balise H1 — signal important pour Google sur le sujet principal de la page.`,
      )
    }

    if (multipleH1.length > 0) {
      recommendations.push(
        `${multipleH1.length} page${multipleH1.length > 1 ? 's' : ''} avec plusieurs H1 — une seule balise H1 par page, les autres niveaux de titre doivent être des H2/H3.`,
      )
    }

    // Score
    const issueRatio = (missing.length + tooLong.length + tooShort.length + duplicatedUrls) / (total * 2)
    const clampedRatio = Math.min(issueRatio, 1)

    let score: number
    let status: 'good' | 'warning' | 'critical'

    if (missingRatio > 0.4 || clampedRatio > 0.5)     { score = 10; status = 'critical' }
    else if (missingRatio > 0.2 || clampedRatio > 0.3) { score = 30; status = 'critical' }
    else if (missingRatio > 0.1 || clampedRatio > 0.15){ score = 55; status = 'warning'  }
    else if (clampedRatio > 0.05)                       { score = 75; status = 'warning'  }
    else                                                 { score = 95; status = 'good'     }

    const ok = total - missing.length - tooLong.length - tooShort.length

    return {
      score,
      status,
      details: {
        total,
        missing: { count: missing.length, ratio: Math.round(missingRatio * 100), pages: missing.slice(0, 10).map((r) => r.url) },
        tooShort: { count: tooShort.length, pages: tooShort.slice(0, 10).map((r) => ({ url: r.url, length: r.metaDescriptionLength })) },
        tooLong: { count: tooLong.length, pages: tooLong.slice(0, 10).map((r) => ({ url: r.url, length: r.metaDescriptionLength })) },
        duplicated: { groups: duplicateGroups.length, urls: duplicatedUrls, examples: duplicateGroups.slice(0, 5).map(([text, urls]) => ({ text: text.slice(0, 80), pages: urls.slice(0, 3) })) },
        h1: { missing: missingH1.length, multiple: multipleH1.length, missingPages: missingH1.slice(0, 10).map((r) => r.url) },
        ok,
      },
      recommendations: recommendations.length > 0 ? recommendations : ['Couverture des meta descriptions optimale — continuer à soigner les descriptions des nouveaux contenus.'],
      summary: recommendations.length === 0
        ? `${total} pages — meta descriptions optimales`
        : [
            missing.length > 0 && `${missing.length} manquantes`,
            tooLong.length > 0 && `${tooLong.length} trop longues`,
            tooShort.length > 0 && `${tooShort.length} trop courtes`,
            duplicateGroups.length > 0 && `${duplicateGroups.length} doublons`,
          ].filter(Boolean).join(' · '),
    }
  },
}
