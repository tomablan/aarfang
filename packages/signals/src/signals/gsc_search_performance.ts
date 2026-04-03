import type { Signal, SignalResult, AuditContext } from '../types.js'

interface SearchAnalyticsAggregate {
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

/**
 * Extrait le domaine racine (sans sous-domaine) — heuristique simple sans PSL.
 * shop.example.com → example.com
 * blog.example.co.uk → example.co.uk  (approximation : last 3 parts si le 2e est court)
 */
function rootDomain(hostname: string): string {
  const parts = hostname.split('.')
  if (parts.length <= 2) return hostname
  // Heuristique ccTLD : si l'avant-dernier segment fait ≤ 3 chars (co, com, net…) garder 3 parties
  const secondToLast = parts[parts.length - 2]
  if (secondToLast.length <= 3 && parts.length >= 3) return parts.slice(-3).join('.')
  return parts.slice(-2).join('.')
}

/** Trouve la propriété GSC correspondant à l'URL du site (essaie plusieurs formats). */
async function findGscSiteUrl(siteUrl: string, accessToken: string): Promise<string | null> {
  const res = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return null

  const data = await res.json() as { siteEntry?: Array<{ siteUrl: string }> }
  const sites = (data.siteEntry ?? []).map((s) => s.siteUrl)

  let hostname: string
  try {
    hostname = new URL(siteUrl).hostname.replace(/^www\./, '')
  } catch {
    return null
  }

  // Candidats exacts : sc-domain + les 4 variantes http/https www/sans-www
  const candidates = [
    `sc-domain:${hostname}`,
    `https://www.${hostname}/`,
    `https://${hostname}/`,
    `http://www.${hostname}/`,
    `http://${hostname}/`,
  ]

  const exact = candidates.find((c) => sites.includes(c))
  if (exact) return exact

  // Fallback : la propriété GSC est peut-être sur le domaine racine (sous-domaine non www)
  // ex. sc-domain:example.com couvre https://shop.example.com
  const root = rootDomain(hostname)
  if (root !== hostname) {
    const rootCandidates = [
      `sc-domain:${root}`,
      `https://www.${root}/`,
      `https://${root}/`,
      `http://www.${root}/`,
      `http://${root}/`,
    ]
    return rootCandidates.find((c) => sites.includes(c)) ?? null
  }

  return null
}

/** Retourne les métriques agrégées sur la période ou null si aucune donnée. */
async function queryAnalytics(
  gscSiteUrl: string,
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<SearchAnalyticsAggregate | null> {
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(gscSiteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate, endDate, rowLimit: 1 }),
      signal: AbortSignal.timeout(15_000),
    },
  )
  if (!res.ok) return null
  const data = await res.json() as { rows?: SearchAnalyticsAggregate[] }
  return data.rows?.[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 }
}

interface KeywordRow { query: string; impressions: number; clicks: number; ctr: number; position: number }

/** Retourne les mots-clés en position 4–20 avec 20+ impressions (opportunités top 3 / top 10). */
async function queryOpportunities(
  gscSiteUrl: string,
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<KeywordRow[]> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(gscSiteUrl)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, dimensions: ['query'], rowLimit: 100 }),
        signal: AbortSignal.timeout(15_000),
      },
    )
    if (!res.ok) return []
    const data = await res.json() as { rows?: KeywordRow[] }
    const rows = data.rows ?? []
    return rows
      .filter((r) => r.position >= 4 && r.position <= 20 && r.impressions >= 20)
      .sort((a, b) => a.position - b.position)
      .slice(0, 15)
  } catch {
    return []
  }
}

export const gscSearchPerformance: Signal = {
  id: 'gsc_search_performance',
  category: 'seo_local',
  weight: 3,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const accessToken = ctx.integrations.gsc?.accessToken
    if (!accessToken) {
      return {
        score: 0,
        status: 'skipped',
        details: { reason: 'Intégration Google Search Console non configurée' },
        recommendations: ['Connecter Google Search Console dans Paramètres → Intégrations.'],
      }
    }

    try {
      const gscSiteUrl = await findGscSiteUrl(ctx.site.url, accessToken)
      if (!gscSiteUrl) {
        return {
          score: 0,
          status: 'warning',
          details: { gscNotFound: true, checkedUrl: ctx.site.url },
          recommendations: [
            `Le domaine "${new URL(ctx.site.url).hostname}" est introuvable dans vos propriétés Google Search Console.`,
            'Vérifiez que le site est bien ajouté et vérifié dans Google Search Console, ou que le compte Google connecté a bien accès à cette propriété.',
          ],
          summary: `Domaine introuvable dans GSC (${new URL(ctx.site.url).hostname})`,
        }
      }

      // Période courante : J-93 → J-3 (GSC a un délai de ~3 jours)
      const endDate = dateStr(3)
      const startDate = dateStr(93)
      const prevEndDate = dateStr(93)
      const prevStartDate = dateStr(183)

      const [current, previous, opportunities] = await Promise.all([
        queryAnalytics(gscSiteUrl, accessToken, startDate, endDate),
        queryAnalytics(gscSiteUrl, accessToken, prevStartDate, prevEndDate),
        queryOpportunities(gscSiteUrl, accessToken, startDate, endDate),
      ])

      if (!current) {
        return {
          score: 0,
          status: 'skipped',
          details: { error: 'Échec de la requête Search Analytics' },
          recommendations: [],
        }
      }

      const avgPosition = current.position > 0 ? Math.round(current.position * 10) / 10 : null
      const ctrPct = Math.round(current.ctr * 1000) / 10
      const impressionsFmt = current.impressions.toLocaleString('fr')
      const clicksFmt = current.clicks.toLocaleString('fr')
      const recommendations: string[] = []

      // Tendance
      let trendPct: number | null = null
      if (previous && previous.impressions > 0) {
        trendPct = Math.round(((current.impressions - previous.impressions) / previous.impressions) * 100)
        if (trendPct <= -20) {
          recommendations.push(`Baisse de visibilité de ${Math.abs(trendPct)}% vs les 90 jours précédents — vérifier une éventuelle pénalité ou perte de positions.`)
        }
      }

      // Score & statut
      let score: number
      let status: 'good' | 'warning' | 'critical'

      if (current.impressions === 0) {
        score = 5
        status = 'critical'
        recommendations.push('Aucune impression — le site n\'apparaît pas dans Google. Vérifier l\'indexation et soumettre le sitemap.')
      } else if (current.impressions < 300) {
        score = 20
        status = 'critical'
        recommendations.push(`Visibilité très faible (${impressionsFmt} impressions / 90 j). Le site est peu indexé ou positionné sur des requêtes à très faible volume.`)
      } else if (current.impressions < 3_000) {
        score = 50
        status = 'warning'
        if (current.ctr < 0.02) recommendations.push(`CTR faible (${ctrPct}%) — optimiser les balises title et meta description.`)
        if (avgPosition && avgPosition > 20) recommendations.push(`Position moyenne ${avgPosition} — renforcer les contenus prioritaires pour remonter en page 1.`)
      } else {
        const posScore = avgPosition ? Math.max(0, 100 - avgPosition * 2) : 60
        const ctrScore = Math.min(100, current.ctr * 2_000)
        score = Math.min(100, Math.round(posScore * 0.5 + ctrScore * 0.3 + 70 * 0.2))
        status = score >= 70 ? 'good' : 'warning'
        if (current.ctr < 0.02) recommendations.push(`CTR faible (${ctrPct}%) malgré une bonne visibilité — améliorer les snippets pour augmenter le taux de clic.`)
        if (avgPosition && avgPosition > 10) {
          const opList = opportunities.slice(0, 5).map((k) => `"${k.query}" (pos. ${Math.round(k.position * 10) / 10}, ${k.impressions} impr.)`).join(', ')
          recommendations.push(`Position moyenne ${avgPosition} — opportunités de passer en top 10 : ${opList || 'voir les mots-clés dans les détails'}.`)
        }
      }

      const summaryParts = [`${impressionsFmt} impressions`, `${clicksFmt} clics`, `CTR ${ctrPct}%`]
      if (avgPosition) summaryParts.push(`Pos. moy. ${avgPosition}`)
      if (trendPct !== null) summaryParts.push(`${trendPct >= 0 ? '+' : ''}${trendPct}% vs 90 j préc.`)

      return {
        score,
        status,
        details: {
          gscSiteUrl,
          period: `${startDate} → ${endDate}`,
          impressions: current.impressions,
          clicks: current.clicks,
          ctr: current.ctr,
          avgPosition: avgPosition ?? 0,
          trendPct,
          previous: previous
            ? { impressions: previous.impressions, clicks: previous.clicks }
            : null,
          opportunities: opportunities.map((k) => ({
            query: k.query,
            position: Math.round(k.position * 10) / 10,
            impressions: k.impressions,
            clicks: k.clicks,
            ctr: Math.round(k.ctr * 1000) / 10,
          })),
        },
        recommendations,
        summary: summaryParts.join(' · '),
      }
    } catch (err) {
      return { score: 0, status: 'skipped', details: { error: String(err) }, recommendations: [] }
    }
  },
}
