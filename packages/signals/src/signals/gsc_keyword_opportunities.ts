import type { Signal, SignalResult, AuditContext } from '../types.js'

interface GscRow {
  keys: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

function dateStr(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().split('T')[0]
}

function rootDomain(hostname: string): string {
  const parts = hostname.split('.')
  if (parts.length <= 2) return hostname
  const secondToLast = parts[parts.length - 2]
  if (secondToLast.length <= 3 && parts.length >= 3) return parts.slice(-3).join('.')
  return parts.slice(-2).join('.')
}

async function findGscSiteUrl(siteUrl: string, accessToken: string): Promise<string | null> {
  const res = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return null
  const data = await res.json() as { siteEntry?: Array<{ siteUrl: string }> }
  const sites = (data.siteEntry ?? []).map((s) => s.siteUrl)
  let hostname: string
  try { hostname = new URL(siteUrl).hostname.replace(/^www\./, '') } catch { return null }
  const candidates = [
    `sc-domain:${hostname}`,
    `https://www.${hostname}/`,
    `https://${hostname}/`,
    `http://www.${hostname}/`,
    `http://${hostname}/`,
  ]
  const exact = candidates.find((c) => sites.includes(c))
  if (exact) return exact
  const root = rootDomain(hostname)
  if (root !== hostname) {
    const rootCandidates = [
      `sc-domain:${root}`,
      `https://www.${root}/`,
      `https://${root}/`,
    ]
    return rootCandidates.find((c) => sites.includes(c)) ?? null
  }
  return null
}

export const gscKeywordOpportunities: Signal = {
  id: 'gsc_keyword_opportunities',
  category: 'opportunites',
  weight: 2,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const accessToken = ctx.integrations.gsc?.accessToken
    if (!accessToken) {
      return {
        score: 0,
        status: 'skipped',
        details: { reason: 'Intégration GSC non configurée' },
        recommendations: ['Connecter Google Search Console dans Paramètres → Intégrations pour analyser les opportunités de mots-clés.'],
      }
    }

    try {
      const gscSiteUrl = await findGscSiteUrl(ctx.site.url, accessToken)
      if (!gscSiteUrl) {
        return {
          score: 0,
          status: 'skipped',
          details: { gscNotFound: true },
          recommendations: [],
          summary: 'Domaine introuvable dans GSC',
        }
      }

      // Récupérer les 500 meilleures requêtes sur 90 jours, triées par impressions
      const res = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(gscSiteUrl)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startDate: dateStr(93),
            endDate: dateStr(3),
            dimensions: ['query'],
            rowLimit: 500,
            orderBy: [{ fieldName: 'impressions', sortOrder: 'DESCENDING' }],
          }),
          signal: AbortSignal.timeout(20_000),
        },
      )
      if (!res.ok) {
        return { score: 0, status: 'skipped', details: { error: `GSC API ${res.status}` }, recommendations: [] }
      }

      const data = await res.json() as { rows?: GscRow[] }
      const rows = data.rows ?? []

      if (rows.length === 0) {
        return {
          score: 50,
          status: 'warning',
          details: { noData: true },
          recommendations: ['Aucune donnée de requête disponible dans GSC — le site manque peut-être de visibilité ou les données sont trop récentes.'],
          summary: 'Aucune donnée de requête GSC',
        }
      }

      // — Quick wins : position 4–10, impressions ≥ 20 (quasi page 1, peut passer top 3)
      const quickWins = rows
        .filter((r) => r.position >= 4 && r.position <= 10 && r.impressions >= 20)
        .slice(0, 10)
        .map((r) => ({
          query: r.keys[0],
          position: Math.round(r.position * 10) / 10,
          impressions: r.impressions,
          clicks: r.clicks,
          ctr: Math.round(r.ctr * 1000) / 10,
        }))

      // — Opportunités moyen terme : position 11–20, impressions ≥ 30 (proche page 1)
      const mediumTerm = rows
        .filter((r) => r.position >= 11 && r.position <= 20 && r.impressions >= 30)
        .slice(0, 10)
        .map((r) => ({
          query: r.keys[0],
          position: Math.round(r.position * 10) / 10,
          impressions: r.impressions,
          clicks: r.clicks,
          ctr: Math.round(r.ctr * 1000) / 10,
        }))

      // — Requêtes à CTR faible malgré bonne position (top 10, CTR < 2%)
      const lowCtr = rows
        .filter((r) => r.position <= 10 && r.ctr < 0.02 && r.impressions >= 50)
        .slice(0, 5)
        .map((r) => ({
          query: r.keys[0],
          position: Math.round(r.position * 10) / 10,
          impressions: r.impressions,
          ctr: Math.round(r.ctr * 1000) / 10,
        }))

      const recommendations: string[] = []

      if (quickWins.length > 0) {
        recommendations.push(`${quickWins.length} quick win${quickWins.length > 1 ? 's' : ''} — requêtes en positions 4–10 à optimiser en priorité :`)
        for (const q of quickWins) {
          recommendations.push(`"${q.query}" — pos. ${q.position} · ${q.impressions} impressions · CTR ${q.ctr}%`)
        }
        recommendations.push('Action : enrichir le contenu de la page cible, renforcer les liens internes, améliorer le title et la meta description.')
      }

      if (mediumTerm.length > 0) {
        recommendations.push(`${mediumTerm.length} opportunité${mediumTerm.length > 1 ? 's' : ''} moyen terme (positions 11–20) :`)
        for (const q of mediumTerm.slice(0, 5)) {
          recommendations.push(`"${q.query}" — pos. ${q.position} · ${q.impressions} impressions · CTR ${q.ctr}%`)
        }
      }

      if (lowCtr.length > 0) {
        recommendations.push(`CTR faible sur des requêtes bien positionnées — optimiser les snippets (title + meta description) :`)
        for (const q of lowCtr) {
          recommendations.push(`"${q.query}" — pos. ${q.position} · ${q.impressions} impressions · CTR ${q.ctr}%`)
        }
      }

      // — Score : basé sur le potentiel de quick wins non exploité
      let score: number
      let status: 'good' | 'warning' | 'critical'

      if (quickWins.length === 0 && mediumTerm.length === 0) {
        score = 90
        status = 'good'
        recommendations.push('Aucune opportunité évidente détectée — les mots-clés proches de la page 1 semblent déjà optimisés.')
      } else if (quickWins.length >= 5) {
        score = 30
        status = 'critical'
      } else if (quickWins.length >= 2) {
        score = 55
        status = 'warning'
      } else if (quickWins.length >= 1) {
        score = 70
        status = 'warning'
      } else {
        // Seulement des opportunités moyen terme
        score = 80
        status = 'good'
      }

      const summaryParts: string[] = []
      if (quickWins.length > 0) summaryParts.push(`${quickWins.length} quick win${quickWins.length > 1 ? 's' : ''} (pos. 4–10)`)
      if (mediumTerm.length > 0) summaryParts.push(`${mediumTerm.length} moyen terme (pos. 11–20)`)
      if (lowCtr.length > 0) summaryParts.push(`${lowCtr.length} CTR faible`)

      return {
        score,
        status,
        details: {
          gscSiteUrl,
          totalQueries: rows.length,
          quickWins,
          mediumTerm,
          lowCtr,
        },
        recommendations,
        summary: summaryParts.length > 0
          ? summaryParts.join(' · ')
          : `${rows.length} requêtes analysées — aucune opportunité évidente`,
      }
    } catch (err) {
      return { score: 0, status: 'skipped', details: { error: String(err) }, recommendations: [] }
    }
  },
}
