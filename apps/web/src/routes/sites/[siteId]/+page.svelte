<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { sitesApi, auditsApi, type Site, type AuditWithResults, type AuditResult, type Audit } from '$lib/api.js'
  import { loadStoredToken } from '$lib/stores/auth.svelte.js'
  import { scoreColor, scoreBg, statusColor, categoryLabel, signalLabel, formatDate } from '$lib/utils.js'
  import { marked } from 'marked'
  import Sparkline from '$lib/components/Sparkline.svelte'
  import AuditModal from '$lib/components/AuditModal.svelte'

  const siteId = $derived($page.params.siteId)

  let site = $state<Site | null>(null)
  let audit = $state<AuditWithResults | null>(null)
  let recentHistory = $state<Audit[]>([])
  let loading = $state(true)
  let auditing = $state(false)
  let generatingSummary = $state(false)
  let summaryError = $state('')
  let copied = $state(false)
  let showModal = $state(false)
  let pollingTimer: ReturnType<typeof setInterval> | null = null
  let token = $state('')

  const summaryHtml = $derived(site?.aiSummary ? (marked.parse(site.aiSummary) as string) : '')

  const sparkScores = $derived(
    recentHistory.filter((a) => a.status === 'completed').map((a) => a.scores?.global ?? 0).slice(-10)
  )

  const categories = ['securite', 'technique', 'seo_technique', 'seo_local', 'opportunites']

  function resultsByCategory(cat: string): AuditResult[] {
    return (audit?.results ?? []).filter((r) => r.category === cat)
  }

  onMount(async () => {
    token = loadStoredToken() ?? ''
    if (!token) { goto('/login'); return }
    await loadData()
  })

  async function loadData() {
    loading = true
    try {
      const [s, a, h] = await Promise.all([
        sitesApi.get(token, siteId),
        auditsApi.latest(token, siteId),
        auditsApi.history(token, siteId),
      ])
      site = s
      audit = a
      recentHistory = h
    } catch {
      goto('/login')
    } finally {
      loading = false
    }
  }

  async function generateSummary() {
    if (generatingSummary || !site) return
    generatingSummary = true
    summaryError = ''
    try {
      const { summary, generatedAt } = await sitesApi.generateSummary(token, siteId)
      site = { ...site, aiSummary: summary, aiSummaryAt: generatedAt }
    } catch (err: any) {
      summaryError = err.message ?? 'Erreur lors de la génération'
    } finally {
      generatingSummary = false
    }
  }

  async function copySummary() {
    if (!site?.aiSummary) return
    await navigator.clipboard.writeText(site.aiSummary)
    copied = true
    setTimeout(() => { copied = false }, 2000)
  }

  async function startAudit(opts: { crawlFile: File | null; isEcommerce: boolean }) {
    showModal = false
    if (auditing) return
    auditing = true

    // Persister isEcommerce si changé
    if (site && opts.isEcommerce !== site.isEcommerce) {
      try { await sitesApi.update(token, siteId, { isEcommerce: opts.isEcommerce }) } catch {}
      site = { ...site, isEcommerce: opts.isEcommerce }
    }

    try {
      const { auditId } = await auditsApi.trigger(token, siteId, opts.crawlFile ?? undefined)
      pollingTimer = setInterval(async () => {
        const a = await auditsApi.get(token, auditId)
        if (a.status === 'completed' || a.status === 'failed') {
          clearInterval(pollingTimer!)
          auditing = false
          await loadData()
        }
      }, 3000)
    } catch (err: any) {
      console.error(err)
      auditing = false
    }
  }
</script>

{#if loading}
  <div class="text-slate-500 text-sm">Chargement…</div>
{:else if site}
  <!-- En-tête -->
  <div class="flex items-start justify-between mb-8 gap-4">
    <div class="flex-1 min-w-0">
      <a href="/dashboard" class="text-sm text-slate-500 hover:text-slate-700">← Sites</a>
      <div class="flex items-center gap-4 mt-1 flex-wrap">
        <h1 class="text-2xl font-bold text-slate-800">{site.name}</h1>
        {#if sparkScores.length >= 2}
          <div class="flex items-center gap-2">
            <Sparkline scores={sparkScores} width={80} height={24} />
            <span class="text-xs text-slate-400">{sparkScores.length} audits</span>
          </div>
        {/if}
      </div>
      <div class="flex items-center gap-3 mt-1">
        <a href={site.url} target="_blank" rel="noopener noreferrer" class="text-sm text-slate-500 hover:text-slate-700">{site.url} ↗</a>
        <span class="text-slate-300">·</span>
        <a href="/sites/{siteId}/audits" class="text-sm text-slate-500 hover:text-slate-700">Historique</a>
        <span class="text-slate-300">·</span>
        <a href="/sites/{siteId}/settings" class="text-sm text-slate-500 hover:text-slate-700">Surveillance</a>
      </div>
    </div>
    <button
      onclick={() => showModal = true}
      disabled={auditing}
      class="shrink-0 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-60 transition-colors flex items-center gap-2"
    >
      {#if auditing}
        <span class="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
        Analyse en cours…
      {:else}
        Lancer un audit
      {/if}
    </button>
  </div>

  {#if !audit}
    <div class="text-center py-16 bg-white border border-slate-200 rounded-xl text-slate-500">
      <p class="mb-3">Aucun audit disponible.</p>
      <button onclick={triggerAudit} class="text-slate-700 underline text-sm">Lancer le premier audit →</button>
    </div>
  {:else}
    <!-- Score global + catégories -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
      <div class="col-span-2 sm:col-span-1 bg-white border-2 {scoreBg(audit.scores?.global)} rounded-xl p-4 text-center">
        <p class="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Score global</p>
        <p class="text-5xl font-bold {scoreColor(audit.scores?.global)}">{audit.scores?.global ?? '—'}</p>
        <p class="text-xs text-slate-400 mt-1">{formatDate(audit.completedAt)}</p>
      </div>
      {#each categories as cat}
        {@const score = audit.scores?.[cat as keyof typeof audit.scores] as number | undefined}
        <div class="bg-white border {scoreBg(score)} rounded-xl p-4 text-center">
          <p class="text-xs font-medium text-slate-500 mb-1">{categoryLabel(cat)}</p>
          <p class="text-3xl font-bold {scoreColor(score)}">{score ?? '—'}</p>
        </div>
      {/each}
    </div>

    <!-- Détail par catégorie -->
    <div class="space-y-6">
      {#each categories as cat}
        {@const results = resultsByCategory(cat)}
        {@const catScore = audit.scores?.[cat as keyof typeof audit.scores] as number | undefined}
        {#if results.length > 0}
          <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div class="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 class="font-semibold text-slate-700">{categoryLabel(cat)}</h2>
              <span class="text-sm font-bold {scoreColor(catScore)}">{catScore ?? '—'}/100</span>
            </div>
            <div class="divide-y divide-slate-100">
              {#each results as result}
                {@const summary = (result.details as any)?._summary as string | undefined}
                <div class="px-5 py-3 flex items-start justify-between gap-4">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-0.5">
                      <span class="text-sm font-medium text-slate-700">{signalLabel(result.signalId)}</span>
                      <span class="text-xs px-2 py-0.5 rounded-full font-medium {statusColor(result.status)}">
                        {result.status}
                      </span>
                    </div>
                    {#if summary}
                      <p class="text-xs font-mono text-slate-500 mt-0.5 truncate">{summary}</p>
                    {/if}
                    {#if result.recommendations.length > 0}
                      <ul class="text-xs text-slate-500 mt-1 space-y-0.5">
                        {#each result.recommendations as rec}
                          <li class="flex gap-1"><span class="text-amber-500">→</span> {rec}</li>
                        {/each}
                      </ul>
                    {/if}
                  </div>
                  <div class="text-right shrink-0">
                    {#if result.status === 'skipped'}
                      <span class="text-xs text-slate-400">skipped</span>
                    {:else}
                      <span class="text-xl font-bold {scoreColor(result.score)}">{result.score}</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {/each}
    </div>
  <!-- Résumé commercial IA -->
  <div class="bg-white border border-slate-200 rounded-xl overflow-hidden mt-6">
    <div class="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
      <div>
        <h2 class="font-semibold text-slate-700">Résumé commercial</h2>
        <p class="text-xs text-slate-400 mt-0.5">Synthèse générée par IA pour l'équipe commerciale</p>
      </div>
      <div class="flex items-center gap-2">
        {#if site.aiSummary}
          <button
            onclick={copySummary}
            class="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {copied ? 'Copié !' : 'Copier'}
          </button>
        {/if}
        <button
          onclick={generateSummary}
          disabled={generatingSummary || !audit}
          class="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
        >
          {#if generatingSummary}
            <span class="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            Génération…
          {:else}
            {site.aiSummary ? 'Régénérer' : 'Générer le résumé'}
          {/if}
        </button>
      </div>
    </div>

    <div class="px-5 py-4">
      {#if summaryError}
        <p class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{summaryError}</p>
      {:else if generatingSummary}
        <div class="space-y-2 animate-pulse">
          <div class="h-3 bg-slate-100 rounded w-3/4"></div>
          <div class="h-3 bg-slate-100 rounded w-full"></div>
          <div class="h-3 bg-slate-100 rounded w-5/6"></div>
          <div class="h-3 bg-slate-100 rounded w-2/3"></div>
        </div>
      {:else if site.aiSummary}
        <div class="prose prose-sm prose-slate max-w-none text-slate-700 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-slate-800 [&_h2]:mt-4 [&_h2]:mb-1 [&_ul]:mt-1 [&_li]:text-slate-600">
          {@html summaryHtml}
        </div>
        {#if site.aiSummaryAt}
          <p class="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">
            Généré le {formatDate(site.aiSummaryAt)}
          </p>
        {/if}
      {:else}
        <p class="text-sm text-slate-400 text-center py-6">
          {#if !audit}
            Lancez un audit pour pouvoir générer un résumé.
          {:else}
            Cliquez sur "Générer le résumé" pour créer une synthèse commerciale basée sur le dernier audit.
          {/if}
        </p>
      {/if}
    </div>
  </div>
  {/if}
{/if}

{#if showModal && site}
  <AuditModal
    siteName={site.name}
    isEcommerce={site.isEcommerce}
    onconfirm={startAudit}
    oncancel={() => showModal = false}
  />
{/if}
