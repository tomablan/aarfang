import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

interface EeatAnalysis {
  score: number
  experience: number
  expertise: number
  authoritativeness: number
  trustworthiness: number
  strengths: string[]
  recommendations: string[]
}

async function analyzeWithClaude(apiKey: string, prompt: string): Promise<EeatAnalysis | null> {
  try {
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
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return null
    const data = await res.json() as any
    const text: string = data.content?.[0]?.text ?? ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    return JSON.parse(jsonMatch[0]) as EeatAnalysis
  } catch {
    return null
  }
}

async function analyzeWithOpenAI(apiKey: string, prompt: string): Promise<EeatAnalysis | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 1024,
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return null
    const data = await res.json() as any
    const text: string = data.choices?.[0]?.message?.content ?? ''
    return JSON.parse(text) as EeatAnalysis
  } catch {
    return null
  }
}

function buildPrompt(ctx: AuditContext, contentSample: string): string {
  const title = (() => {
    const $ = load(ctx.page.html)
    return $('title').text().trim() || ctx.site.name
  })()

  return `Tu es un expert en qualité de contenu web et en critères E-E-A-T de Google. Analyse le contenu de cette page web et évalue sa qualité selon les 4 dimensions E-E-A-T.

SITE : ${ctx.site.name} (${ctx.site.url})
TITRE DE LA PAGE : ${title}

EXTRAIT DU CONTENU (premiers 2000 caractères) :
${contentSample}

Évalue ce contenu sur les 4 dimensions E-E-A-T de 0 à 100 :
- Experience (Expérience) : le contenu démontre-t-il une expérience réelle et concrète sur le sujet ?
- Expertise : le contenu est-il précis, détaillé, avec un vocabulaire spécialisé approprié ?
- Authoritativeness (Autorité) : le site/auteur est-il présenté comme une référence dans son domaine ?
- Trustworthiness (Fiabilité) : le contenu est-il transparent, sourcé, vérifiable ?

Réponds UNIQUEMENT en JSON avec ce format exact :
{
  "score": <moyenne pondérée 0-100>,
  "experience": <0-100>,
  "expertise": <0-100>,
  "authoritativeness": <0-100>,
  "trustworthiness": <0-100>,
  "strengths": ["<point fort 1>", "<point fort 2>"],
  "recommendations": ["<amélioration 1>", "<amélioration 2>", "<amélioration 3>"]
}`
}

export const geoEeatAi: Signal = {
  id: 'geo_eeat_ai',
  category: 'geo',
  weight: 3,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const claudeKey = ctx.integrations.claude?.apiKey
    const openaiKey = ctx.integrations.openai?.apiKey

    if (!claudeKey && !openaiKey) {
      return {
        score: 0,
        status: 'skipped',
        details: { reason: 'Aucune clé IA (Claude ou OpenAI) configurée' },
        recommendations: ['Configurez une intégration Claude ou OpenAI pour activer l\'analyse E-E-A-T par IA.'],
        summary: 'Analyse IA non disponible — configurez une intégration Claude ou OpenAI',
      }
    }

    // Extraire le contenu textuel principal
    const $ = load(ctx.page.html)
    $('script, style, nav, header, footer, [class*="cookie"], [class*="banner"]').remove()
    const contentSample = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 2000)

    if (contentSample.length < 100) {
      return {
        score: 10,
        status: 'critical',
        details: { reason: 'Contenu trop court pour analyse E-E-A-T' },
        recommendations: ['La page ne contient pas assez de contenu textuel pour une évaluation E-E-A-T fiable.'],
        summary: 'Contenu insuffisant pour l\'analyse E-E-A-T',
      }
    }

    const prompt = buildPrompt(ctx, contentSample)
    const analysis = claudeKey
      ? await analyzeWithClaude(claudeKey, prompt)
      : await analyzeWithOpenAI(openaiKey!, prompt)

    if (!analysis) {
      return {
        score: 0,
        status: 'skipped',
        details: { reason: 'Erreur lors de l\'appel à l\'API IA' },
        recommendations: [],
        summary: 'Analyse IA indisponible (erreur API)',
      }
    }

    const { score, experience, expertise, authoritativeness, trustworthiness, strengths, recommendations } = analysis
    const provider = claudeKey ? 'Claude' : 'OpenAI'

    const status = score >= 75 ? 'good' : score >= 50 ? 'warning' : 'critical'

    return {
      score: Math.min(100, Math.max(0, Math.round(score))),
      status,
      details: {
        provider,
        experience: Math.round(experience),
        expertise: Math.round(expertise),
        authoritativeness: Math.round(authoritativeness),
        trustworthiness: Math.round(trustworthiness),
        strengths: strengths ?? [],
      },
      recommendations: (recommendations ?? []).slice(0, 4),
      summary: `E-E-A-T : ${Math.round(score)}/100 (via ${provider}) — Exp.${Math.round(experience)} · Expert.${Math.round(expertise)} · Auth.${Math.round(authoritativeness)} · Trust.${Math.round(trustworthiness)}`,
    }
  },
}
