const SIGNAL_LABELS: Record<string, string> = {
  https_enabled: 'HTTPS activé',
  ssl_expiry: 'Certificat SSL',
  security_headers: 'En-têtes de sécurité',
  meta_title: 'Balise Title',
  meta_description: 'Meta Description',
  h1_tag: 'Balise H1',
  canonical_tag: 'Canonical',
  sitemap: 'Sitemap.xml',
  robots_txt: 'Robots.txt',
  page_speed: 'Performance (PageSpeed)',
  server_response_time: 'Temps de réponse serveur',
  viewport_meta: 'Balise Viewport',
  structured_data: 'Données structurées (JSON-LD)',
  images_alt: 'Attributs Alt des images',
  open_graph: 'Balises Open Graph',
  cta_presence: "Appels à l'action (CTA)",
  phone_visible: 'Numéro de téléphone',
  contact_form: 'Formulaire de contact',
  crawl_duplicate_titles: 'Titres en doublon',
  crawl_broken_pages: 'Pages en erreur (4xx/5xx)',
  crawl_redirects: 'Redirections',
  crawl_thin_content: 'Contenu insuffisant (thin content)',
  crawl_depth: 'Profondeur de crawl',
  crawl_noindex: 'Pages non indexables',
}

export interface AiSummaryInput {
  site: {
    name: string
    url: string
    cmsType: string | null
    isEcommerce: boolean
  }
  scores: {
    global: number
    technique: number
    securite: number
    seo_technique: number
    seo_local: number
    opportunites: number
  }
  issues: {
    signalId: string
    category: string
    score: number | null
    status: string
    recommendations: string[]
  }[]
}

function buildPrompt(input: AiSummaryInput): string {
  const { site, scores, issues } = input

  const criticalIssues = issues.filter((i) => i.status === 'critical')
  const warningIssues = issues.filter((i) => i.status === 'warning')
  const goodSignals = issues.filter((i) => i.status === 'good')

  const formatIssues = (list: typeof issues) =>
    list.map((i) => {
      const label = SIGNAL_LABELS[i.signalId] ?? i.signalId
      const recs = i.recommendations.slice(0, 2).join(' / ')
      return `- ${label} (score : ${i.score ?? 'N/A'}/100)${recs ? ` → ${recs}` : ''}`
    }).join('\n')

  return `Tu es un consultant senior en agence web. Rédige un résumé commercial court et percutant (250-350 mots) à destination d'un commercial qui va contacter le propriétaire de ce site web.

DONNÉES DU SITE :
- Nom : ${site.name}
- URL : ${site.url}
- CMS : ${site.cmsType ?? 'Non détecté'}
- E-commerce : ${site.isEcommerce ? 'Oui' : 'Non'}

SCORES D'AUDIT :
- Score global : ${scores.global}/100
- Sécurité : ${scores.securite}/100
- Technique : ${scores.technique}/100
- SEO Technique : ${scores.seo_technique}/100
- SEO Local : ${scores.seo_local}/100
- Opportunités commerciales : ${scores.opportunites}/100

${criticalIssues.length > 0 ? `PROBLÈMES CRITIQUES (${criticalIssues.length}) :
${formatIssues(criticalIssues)}` : ''}

${warningIssues.length > 0 ? `POINTS D'AMÉLIORATION (${warningIssues.length}) :
${formatIssues(warningIssues.slice(0, 5))}` : ''}

${goodSignals.length > 0 ? `POINTS POSITIFS :
${goodSignals.slice(0, 3).map((i) => `- ${SIGNAL_LABELS[i.signalId] ?? i.signalId}`).join('\n')}` : ''}

FORMAT ATTENDU (utilise exactement ces sections en markdown) :

## Vue d'ensemble
[2-3 phrases sur l'état général du site, le score global et ce que ça signifie concrètement]

## Points forts
[1-3 bullet points sur ce qui fonctionne bien]

## Problèmes prioritaires
[2-4 bullet points sur les problèmes les plus impactants, avec leur conséquence business concrète pour le client]

## Angle commercial
[1-2 phrases directes pour accrocher le client : ce que l'agence peut apporter, le bénéfice concret attendu]

Écris en français professionnel. Sois concret, évite le jargon technique excessif. Pense au client final qui ne connaît pas forcément le SEO ou la technique.`
}

export async function generateAiSummary(
  input: AiSummaryInput,
  claudeApiKey: string | undefined,
  openaiApiKey: string | undefined,
): Promise<string> {
  if (claudeApiKey) return callClaude(buildPrompt(input), claudeApiKey)
  if (openaiApiKey) return callOpenAI(buildPrompt(input), openaiApiKey)
  throw new Error("Aucune intégration IA configurée pour cette organisation. Ajoutez une clé Claude ou OpenAI dans Paramètres → Intégrations.")
}

async function callClaude(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as any
    throw new Error(`Claude API error ${res.status}: ${body?.error?.message ?? res.statusText}`)
  }

  const data = await res.json() as { content: { type: string; text: string }[] }
  const text = data.content.find((c) => c.type === 'text')?.text
  if (!text) throw new Error('Claude API : réponse vide')
  return text.trim()
}

async function callOpenAI(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as any
    throw new Error(`OpenAI API error ${res.status}: ${body?.error?.message ?? res.statusText}`)
  }

  const data = await res.json() as { choices: { message: { content: string } }[] }
  const text = data.choices[0]?.message?.content
  if (!text) throw new Error('OpenAI API : réponse vide')
  return text.trim()
}
