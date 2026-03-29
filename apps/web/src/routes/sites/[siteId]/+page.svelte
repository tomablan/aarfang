<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { sitesApi, auditsApi, type Site, type AuditWithResults, type AuditResult, type Audit } from '$lib/api.js'
  import { loadStoredToken } from '$lib/stores/auth.svelte.js'
  import { scoreColor, scoreBg, statusColor, categoryLabel, signalLabel, formatDate, faviconUrl } from '$lib/utils.js'
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
  let generatingRecommendations = $state(false)
  let recommendationsError = $state('')
  let copied = $state(false)
  let showModal = $state(false)
  let expandedSignals = $state(new Set<string>())
  let pollingTimer: ReturnType<typeof setInterval> | null = null
  let token = $state('')
  let activeTab = $state<string>('securite')

  const summaryHtml = $derived(site?.aiSummary ? (marked.parse(site.aiSummary) as string) : '')
  const recommendationsHtml = $derived(site?.aiRecommendations ? (marked.parse(site.aiRecommendations) as string) : '')

  const sparkScores = $derived(
    recentHistory.filter((a) => a.status === 'completed').map((a) => a.scores?.global ?? 0).slice(-10)
  )

  const categories = ['securite', 'conformite', 'accessibilite', 'technique', 'seo_technique', 'seo_local', 'opportunites', 'sea', 'ecoconception']

  function resultsByCategory(cat: string): AuditResult[] {
    return (audit?.results ?? []).filter((r) => r.category === cat)
  }

  // Onglet actif par défaut = catégorie avec le score le plus bas ayant des résultats
  $effect(() => {
    if (!audit) return
    const withResults = categories.filter((c) => resultsByCategory(c).length > 0)
    if (withResults.length === 0) return
    const worst = withResults.reduce((a, b) => {
      const sa = (audit!.scores?.[a as keyof typeof audit.scores] as number) ?? 100
      const sb = (audit!.scores?.[b as keyof typeof audit.scores] as number) ?? 100
      return sa <= sb ? a : b
    })
    activeTab = worst
  })

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

  async function generateRecommendations() {
    if (generatingRecommendations || !site) return
    generatingRecommendations = true
    recommendationsError = ''
    try {
      const { recommendations, generatedAt } = await sitesApi.generateRecommendations(token, siteId)
      site = { ...site, aiRecommendations: recommendations, aiRecommendationsAt: generatedAt }
    } catch (err: any) {
      recommendationsError = err.message ?? 'Erreur lors de la génération'
    } finally {
      generatingRecommendations = false
    }
  }

  async function copySummary() {
    if (!site?.aiSummary) return
    await navigator.clipboard.writeText(site.aiSummary)
    copied = true
    setTimeout(() => { copied = false }, 2000)
  }

  let crawlProgress = $state<{ crawled: number; discovered: number } | null>(null)
  let crawlStatusMsg = $state('')

  async function startAudit(opts: { crawlFile: File | null; isEcommerce: boolean; crawlMode: 'none' | 'auto' | 'file'; crawlOptions: Record<string, unknown> }) {
    showModal = false
    if (auditing) return
    auditing = true
    crawlProgress = null
    crawlStatusMsg = ''

    // Persister isEcommerce si changé
    if (site && opts.isEcommerce !== site.isEcommerce) {
      try { await sitesApi.update(token, siteId, { isEcommerce: opts.isEcommerce }) } catch {}
      site = { ...site, isEcommerce: opts.isEcommerce }
    }

    try {
      const { auditId } = await auditsApi.trigger(token, siteId, {
        crawlMode: opts.crawlMode,
        crawlFile: opts.crawlFile,
        crawlOptions: opts.crawlOptions,
      })
      pollingTimer = setInterval(async () => {
        const a = await auditsApi.get(token, auditId)
        // Mise à jour de la progression crawl
        if (a.crawlStatus === 'running' && a.crawlProgress) {
          crawlProgress = a.crawlProgress
          crawlStatusMsg = `Crawl en cours — ${a.crawlProgress.crawled} pages analysées`
        } else if (a.crawlStatus === 'done') {
          crawlProgress = null
          crawlStatusMsg = 'Crawl terminé, analyse des signaux…'
        } else if (!a.crawlStatus || a.crawlStatus === 'skipped') {
          crawlStatusMsg = 'Analyse en cours…'
        }
        if (a.status === 'completed' || a.status === 'failed') {
          clearInterval(pollingTimer!)
          auditing = false
          crawlProgress = null
          crawlStatusMsg = ''
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
  <div class="text-slate-500 dark:text-slate-500 text-sm">Chargement…</div>
{:else if site}
  <!-- En-tête -->
  <div class="flex items-start justify-between mb-8 gap-4">
    <div class="flex-1 min-w-0">
      <a href="/dashboard" class="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300">← Sites</a>
      <div class="flex items-center gap-4 mt-1 flex-wrap">
        {#if faviconUrl(site.url)}
          <img src={faviconUrl(site.url)} alt="" width="24" height="24" class="rounded shrink-0" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
        {/if}
        <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100">{site.name}</h1>
        {#if sparkScores.length >= 2}
          <div class="flex items-center gap-2">
            <Sparkline scores={sparkScores} width={80} height={24} />
            <span class="text-xs text-slate-400 dark:text-slate-600">{sparkScores.length} audits</span>
          </div>
        {/if}
      </div>
      <div class="flex items-center gap-3 mt-1">
        <a href={site.url} target="_blank" rel="noopener noreferrer" class="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300">{site.url} ↗</a>
        <span class="text-slate-300 dark:text-slate-700">·</span>
        <a href="/sites/{siteId}/audits" class="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300">Historique</a>
        <span class="text-slate-300 dark:text-slate-700">·</span>
        <a href="/sites/{siteId}/fiche" class="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300">Fiche technique</a>
        <span class="text-slate-300 dark:text-slate-700">·</span>
        <a href="/sites/{siteId}/settings" class="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300">Paramètres</a>
        {#if audit}
          <span class="text-slate-300 dark:text-slate-700">·</span>
          <a href="/sites/{siteId}/report" class="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300">Rapport PDF</a>
        {/if}
      </div>
    </div>
    <button
      onclick={() => showModal = true}
      disabled={auditing}
      class="shrink-0 bg-slate-800 dark:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-60 transition-colors flex items-center gap-2"
    >
      {#if auditing}
        <span class="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
        {#if crawlProgress}
          {crawlProgress.crawled}/{Math.min(crawlProgress.discovered, 999)} pages…
        {:else}
          {crawlStatusMsg || 'Analyse en cours…'}
        {/if}
      {:else}
        Lancer un audit
      {/if}
    </button>
  </div>

  {#if !audit}
    <div class="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 dark:text-slate-500">
      <p class="mb-3">Aucun audit disponible.</p>
      <button onclick={() => showModal = true} class="text-slate-700 dark:text-slate-300 underline text-sm">Lancer le premier audit →</button>
    </div>
  {:else}
    <!-- Score global + catégories -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-4 mb-8">
      <div class="col-span-2 sm:col-span-1 bg-white dark:bg-slate-900 border-2 {scoreBg(audit.scores?.global)} rounded-xl p-4 text-center">
        <p class="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wide mb-1">Score global</p>
        <p class="text-5xl font-bold {scoreColor(audit.scores?.global)}">{audit.scores?.global ?? '—'}</p>
        <p class="text-xs text-slate-400 dark:text-slate-600 mt-1">{formatDate(audit.completedAt)}</p>
      </div>
      {#each categories as cat}
        {@const score = audit.scores?.[cat as keyof typeof audit.scores] as number | undefined}
        <button
          onclick={() => activeTab = cat}
          class="bg-white dark:bg-slate-900 border {scoreBg(score)} rounded-xl p-4 text-center hover:opacity-80 transition-opacity {activeTab === cat ? 'ring-2 ring-slate-400 dark:ring-slate-600 ring-offset-1' : ''}"
        >
          <p class="text-xs font-medium text-slate-500 dark:text-slate-500 mb-1">{categoryLabel(cat)}</p>
          <p class="text-3xl font-bold {scoreColor(score)}">{score ?? '—'}</p>
        </button>
      {/each}
    </div>

    <!-- Onglets de navigation -->
    {@const tabList = [...categories.filter((c) => resultsByCategory(c).length > 0), 'resume']}
    <div class="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-4">
      {#each tabList as tab}
        <button
          onclick={() => activeTab = tab}
          class="shrink-0 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors {activeTab === tab ? 'bg-white dark:bg-slate-900 border border-b-white dark:border-b-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 -mb-px' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}"
        >
          {#if tab === 'resume'}
            Résumé IA
          {:else}
            {@const s = audit.scores?.[tab as keyof typeof audit.scores] as number | undefined}
            <span class={activeTab === tab ? scoreColor(s) : ''}>{categoryLabel(tab)}</span>
            {#if s !== undefined}<span class="ml-1 text-xs {scoreColor(s)}">{s}</span>{/if}
          {/if}
        </button>
      {/each}
    </div>

    <!-- Contenu de l'onglet actif -->
    {#if activeTab === 'resume'}
      <!-- Résumé commercial IA (onglet dédié) -->
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div class="px-5 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 class="font-semibold text-slate-700 dark:text-slate-300">Résumé commercial</h2>
            <p class="text-xs text-slate-400 dark:text-slate-600 mt-0.5">Synthèse générée par IA pour l'équipe commerciale</p>
          </div>
          <div class="flex items-center gap-2">
            {#if site.aiSummary}
              <button
                onclick={copySummary}
                class="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                {copied ? 'Copié !' : 'Copier'}
              </button>
            {/if}
            <button
              onclick={generateSummary}
              disabled={generatingSummary || !audit}
              class="text-xs px-3 py-1.5 rounded-lg bg-slate-800 dark:bg-slate-700 text-white hover:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors flex items-center gap-1.5"
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
            <p class="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 rounded-lg px-3 py-2">{summaryError}</p>
          {:else if generatingSummary}
            <div class="space-y-2 animate-pulse">
              <div class="h-3 bg-slate-100 dark:bg-slate-800 rounded w-3/4"></div>
              <div class="h-3 bg-slate-100 dark:bg-slate-800 rounded w-full"></div>
              <div class="h-3 bg-slate-100 dark:bg-slate-800 rounded w-5/6"></div>
              <div class="h-3 bg-slate-100 dark:bg-slate-800 rounded w-2/3"></div>
            </div>
          {:else if site.aiSummary}
            <div class="prose prose-sm prose-slate max-w-none text-slate-700 dark:text-slate-300 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-slate-800 dark:[&_h2]:text-slate-100 [&_h2]:mt-4 [&_h2]:mb-1 [&_ul]:mt-1 [&_li]:text-slate-600 dark:[&_li]:text-slate-400">
              {@html summaryHtml}
            </div>
            {#if site.aiSummaryAt}
              <p class="text-xs text-slate-400 dark:text-slate-600 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                Généré le {formatDate(site.aiSummaryAt)}
              </p>
            {/if}
          {:else}
            <p class="text-sm text-slate-400 dark:text-slate-600 text-center py-6">
              Cliquez sur "Générer le résumé" pour créer une synthèse commerciale basée sur le dernier audit.
            </p>
          {/if}
        </div>
      </div>

      <!-- Recommandations stratégiques IA -->
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden mt-4">
        <div class="px-5 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 class="font-semibold text-slate-700 dark:text-slate-300">Recommandations stratégiques</h2>
            <p class="text-xs text-slate-400 dark:text-slate-600 mt-0.5">Analyse sectorielle et benchmarking par IA</p>
          </div>
          <button
            onclick={generateRecommendations}
            disabled={generatingRecommendations || !audit}
            class="text-xs px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {#if generatingRecommendations}
              <span class="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              Analyse…
            {:else}
              {site.aiRecommendations ? 'Réanalyser' : 'Analyser le secteur'}
            {/if}
          </button>
        </div>
        <div class="px-5 py-4">
          {#if recommendationsError}
            <p class="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 rounded-lg px-3 py-2">{recommendationsError}</p>
          {:else if generatingRecommendations}
            <div class="space-y-2 animate-pulse">
              <div class="h-3 bg-slate-100 dark:bg-slate-800 rounded w-3/4"></div>
              <div class="h-3 bg-slate-100 dark:bg-slate-800 rounded w-full"></div>
              <div class="h-3 bg-slate-100 dark:bg-slate-800 rounded w-5/6"></div>
              <div class="h-3 bg-slate-100 dark:bg-slate-800 rounded w-2/3"></div>
              <div class="h-3 bg-slate-100 dark:bg-slate-800 rounded w-full mt-2"></div>
              <div class="h-3 bg-slate-100 dark:bg-slate-800 rounded w-4/5"></div>
            </div>
          {:else if site.aiRecommendations}
            <div class="prose prose-sm prose-slate max-w-none text-slate-700 dark:text-slate-300 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-slate-800 dark:[&_h2]:text-slate-100 [&_h2]:mt-5 [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-slate-700 dark:[&_h3]:text-slate-300 [&_h3]:mt-4 [&_h3]:mb-1 [&_ul]:mt-1 [&_li]:text-slate-600 dark:[&_li]:text-slate-400 [&_strong]:text-slate-800 dark:[&_strong]:text-slate-100">
              {@html recommendationsHtml}
            </div>
            {#if site.aiRecommendationsAt}
              <p class="text-xs text-slate-400 dark:text-slate-600 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                Généré le {formatDate(site.aiRecommendationsAt)}
              </p>
            {/if}
          {:else}
            <p class="text-sm text-slate-400 dark:text-slate-600 text-center py-6">
              Cliquez sur "Analyser le secteur" pour obtenir des recommandations stratégiques basées sur les pratiques de votre secteur d'activité.
            </p>
          {/if}
        </div>
      </div>
    {:else}
      {@const results = resultsByCategory(activeTab)}
      {@const catScore = audit.scores?.[activeTab as keyof typeof audit.scores] as number | undefined}
      {#if results.length > 0}
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div class="px-5 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <h2 class="font-semibold text-slate-700 dark:text-slate-300">{categoryLabel(activeTab)}</h2>
            <span class="text-sm font-bold {scoreColor(catScore)}">{catScore ?? '—'}/100</span>
          </div>
          <div class="divide-y divide-slate-100 dark:divide-slate-800">
            {#each results as result}
              {@const techKey = `${activeTab}-${result.signalId}`}
              {@const pitchRec = result.recommendations[0] ?? null}
              {@const techRecs = result.recommendations.slice(1)}
              {@const isExpanded = expandedSignals.has(techKey)}
              {@const signalSummary = (result.details as any)?._summary as string | undefined}
              <div class="px-5 py-3">
                <div class="flex items-start justify-between gap-4">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="text-sm font-semibold text-slate-800 dark:text-slate-100">{signalLabel(result.signalId)}</span>
                      <span class="text-xs px-2 py-0.5 rounded-full font-medium {statusColor(result.status)}">
                        {result.status}
                      </span>
                    </div>
                    {#if signalSummary}
                      <p class="text-sm text-slate-600 dark:text-slate-400 mt-1">{signalSummary}</p>
                    {/if}
                    {#if pitchRec}
                      <p class="text-sm text-slate-700 dark:text-slate-300 mt-2 pl-3 border-l-2 border-amber-400">{pitchRec}</p>
                    {/if}
                    {#if techRecs.length > 0}
                      <button
                        onclick={() => {
                          const next = new Set(expandedSignals)
                          if (isExpanded) next.delete(techKey); else next.add(techKey)
                          expandedSignals = next
                        }}
                        class="mt-2 text-xs text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 flex items-center gap-1 transition-colors"
                      >
                        <svg class="w-3 h-3 transition-transform {isExpanded ? 'rotate-90' : ''}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" d="m9 18 6-6-6-6"/>
                        </svg>
                        {isExpanded ? 'Masquer les détails' : 'Voir les détails techniques'}
                      </button>
                      {#if isExpanded}
                        <ul class="mt-2 space-y-1 pl-3 border-l border-slate-200 dark:border-slate-800">
                          {#each techRecs as rec}
                            <li class="text-xs text-slate-500 dark:text-slate-500 leading-relaxed">{rec}</li>
                          {/each}
                        </ul>
                      {/if}
                    {/if}
                  </div>
                  <div class="text-right shrink-0">
                    {#if result.status === 'skipped'}
                      <span class="text-xs text-slate-400 dark:text-slate-600">—</span>
                    {:else}
                      <span class="text-xl font-bold {scoreColor(result.score)}">{result.score}</span>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
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
