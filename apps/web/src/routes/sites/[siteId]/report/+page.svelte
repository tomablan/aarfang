<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { sitesApi, auditsApi, type Site, type AuditWithResults, type AuditResult } from '$lib/api.js'
  import { loadStoredToken } from '$lib/stores/auth.svelte.js'
  import { scoreColor, scoreBg, statusColor, categoryLabel, signalLabel, formatDate } from '$lib/utils.js'
  import { marked } from 'marked'

  const siteId = $derived($page.params.siteId)

  let site = $state<Site | null>(null)
  let audit = $state<AuditWithResults | null>(null)
  let loading = $state(true)

  const summaryHtml = $derived(site?.aiSummary ? (marked.parse(site.aiSummary) as string) : '')

  const categories = ['securite', 'conformite', 'accessibilite', 'technique', 'seo_technique', 'seo_local', 'opportunites', 'sea']

  function resultsByCategory(cat: string): AuditResult[] {
    return (audit?.results ?? []).filter((r) => r.category === cat)
  }

  onMount(async () => {
    const token = loadStoredToken() ?? ''
    if (!token) { goto('/login'); return }
    try {
      const [s, a] = await Promise.all([
        sitesApi.get(token, siteId),
        auditsApi.latest(token, siteId),
      ])
      site = s
      audit = a
    } catch {
      goto('/login')
    } finally {
      loading = false
    }
  })
</script>

<svelte:head>
  <title>{site?.name ?? 'Rapport'} — Rapport d'audit</title>
</svelte:head>

<!-- Barre d'actions (masquée à l'impression) -->
<div class="print:hidden fixed top-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3 flex items-center justify-between">
  <a href="/sites/{siteId}" class="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1.5">
    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
    </svg>
    Retour
  </a>
  <button
    onclick={() => window.print()}
    class="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
  >
    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
    Télécharger PDF
  </button>
</div>

<!-- Contenu du rapport -->
<div class="print:p-0 pt-16 print:pt-0 max-w-4xl mx-auto px-6 py-8 print:max-w-none print:px-8">

  {#if loading}
    <div class="text-slate-400 text-sm print:hidden">Chargement…</div>
  {:else if !site || !audit}
    <div class="text-slate-400 text-sm print:hidden">Aucun audit disponible.</div>
  {:else}

    <!-- En-tête du rapport -->
    <div class="mb-8 pb-6 border-b-2 border-slate-200">
      <!-- Bande amber identitaire (visible à l'impression) -->
      <div class="h-0.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 mb-6 print:mb-4 -mx-8 print:block hidden"></div>

      <div class="flex items-start justify-between">
        <div>
          <!-- Logo inline pour le rapport imprimé -->
          <div class="flex items-center gap-2.5 mb-3">
            <svg width="30" height="33" viewBox="0 0 40 44" fill="none">
              <path d="M13 13 L10 3 L17 10 Z" fill="#1e293b"/>
              <path d="M27 13 L30 3 L23 10 Z" fill="#1e293b"/>
              <ellipse cx="20" cy="26" rx="16" ry="15" fill="#1e293b"/>
              <ellipse cx="20" cy="31" rx="9" ry="8" fill="#f1f5f9" opacity="0.12"/>
              <ellipse cx="20" cy="24" rx="12" ry="11" fill="#334155" opacity="0.5"/>
              <g class="logo-eye">
                <circle cx="13.5" cy="23" r="5.5" fill="white"/>
                <circle cx="13.5" cy="23" r="3.8" fill="#f59e0b"/>
                <circle cx="13.5" cy="23" r="2.1" fill="#0f172a"/>
                <circle cx="14.7" cy="21.8" r="0.85" fill="white"/>
              </g>
              <g class="logo-eye" style="animation-delay: 0.04s">
                <circle cx="26.5" cy="23" r="5.5" fill="white"/>
                <circle cx="26.5" cy="23" r="3.8" fill="#f59e0b"/>
                <circle cx="26.5" cy="23" r="2.1" fill="#0f172a"/>
                <circle cx="27.7" cy="21.8" r="0.85" fill="white"/>
              </g>
              <path d="M18 27 Q20 30 22 27 Q20 25.5 18 27Z" fill="#cbd5e1"/>
            </svg>
            <span class="text-base font-bold tracking-tight text-slate-500">aarfang</span>
          </div>
          <p class="text-xs font-medium text-slate-400 uppercase tracking-widest mb-1">Rapport d'audit qualité</p>
          <h1 class="text-3xl font-bold text-slate-900 dark:text-slate-100">{site.name}</h1>
          <a href={site.url} class="text-sm text-slate-500 mt-1 inline-block print:no-underline">{site.url}</a>
        </div>
        <div class="text-right">
          <p class="text-xs text-slate-400 mb-1">Date de l'audit</p>
          <p class="text-sm font-medium text-slate-700 dark:text-slate-300">{formatDate(audit.completedAt)}</p>
          <p class="text-xs text-slate-400 mt-3 mb-1">Généré le</p>
          <p class="text-sm font-medium text-slate-700 dark:text-slate-300">{formatDate(new Date().toISOString())}</p>
        </div>
      </div>
    </div>

    <!-- Score global + catégories -->
    <div class="mb-8">
      <h2 class="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Scores</h2>
      <div class="grid grid-cols-9 gap-3">
        <div class="col-span-1 bg-slate-900 rounded-xl p-4 text-center text-white">
          <p class="text-xs font-medium opacity-70 uppercase tracking-wide mb-1">Global</p>
          <p class="text-4xl font-bold">{audit.scores?.global ?? '—'}</p>
          <p class="text-xs opacity-50 mt-1">/100</p>
        </div>
        {#each categories as cat}
          {@const score = audit.scores?.[cat as keyof typeof audit.scores] as number | undefined}
          <div class="bg-white dark:bg-slate-900 border {scoreBg(score)} dark:border-slate-800 rounded-xl p-3 text-center">
            <p class="text-xs font-medium text-slate-500 mb-1 leading-tight">{categoryLabel(cat)}</p>
            <p class="text-2xl font-bold {scoreColor(score)}">{score ?? '—'}</p>
          </div>
        {/each}
      </div>
    </div>

    <!-- Détail par catégorie -->
    <div class="space-y-6">
      {#each categories as cat}
        {@const results = resultsByCategory(cat)}
        {@const catScore = audit.scores?.[cat as keyof typeof audit.scores] as number | undefined}
        {#if results.length > 0}
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden print:break-inside-avoid">
            <div class="px-5 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800">
              <h3 class="font-semibold text-slate-700 dark:text-slate-300">{categoryLabel(cat)}</h3>
              <span class="text-sm font-bold {scoreColor(catScore)}">{catScore ?? '—'}/100</span>
            </div>
            <div class="divide-y divide-slate-100 dark:divide-slate-800">
              {#each results as result}
                {@const pitchRec = result.recommendations[0] ?? null}
                {@const techRecs = result.recommendations.slice(1)}
                {@const signalSummary = (result.details as any)?._summary as string | undefined}
                <div class="px-5 py-3 flex items-start justify-between gap-4">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span class="text-sm font-semibold text-slate-800 dark:text-slate-100">{signalLabel(result.signalId)}</span>
                      <span class="text-xs px-2 py-0.5 rounded-full font-medium {statusColor(result.status)}">
                        {result.status}
                      </span>
                    </div>
                    {#if signalSummary}
                      <p class="text-sm text-slate-600 dark:text-slate-400 mt-0.5">{signalSummary}</p>
                    {/if}
                    {#if pitchRec}
                      <p class="text-sm text-slate-700 dark:text-slate-300 mt-2 pl-3 border-l-2 border-amber-400">{pitchRec}</p>
                    {/if}
                    {#if techRecs.length > 0}
                      <ul class="mt-1.5 space-y-0.5 pl-3 border-l border-slate-200 dark:border-slate-700">
                        {#each techRecs as rec}
                          <li class="text-xs text-slate-400 dark:text-slate-600">{rec}</li>
                        {/each}
                      </ul>
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
              {/each}
            </div>
          </div>
        {/if}
      {/each}
    </div>

    <!-- Résumé IA -->
    {#if site.aiSummary}
      <div class="mt-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden print:break-inside-avoid">
        <div class="px-5 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
          <h3 class="font-semibold text-slate-700 dark:text-slate-300">Résumé commercial</h3>
          <p class="text-xs text-slate-400 dark:text-slate-600 mt-0.5">Synthèse générée par IA</p>
        </div>
        <div class="px-5 py-4">
          <div class="prose prose-sm prose-slate max-w-none text-slate-700 dark:text-slate-300 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-slate-800 dark:[&_h2]:text-slate-100 [&_h2]:mt-4 [&_h2]:mb-1 [&_ul]:mt-1 [&_li]:text-slate-600 dark:[&_li]:text-slate-400">
            {@html summaryHtml}
          </div>
          {#if site.aiSummaryAt}
            <p class="text-xs text-slate-400 dark:text-slate-600 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">Généré le {formatDate(site.aiSummaryAt)}</p>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Pied de page -->
    <div class="mt-10 pt-6 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400 dark:text-slate-600">
      <span>aarfang — Rapport d'audit qualité</span>
      <span>{site.url}</span>
    </div>

  {/if}
</div>

<style>
  @media print {
    :global(body) {
      background: white;
    }
    @page {
      margin: 1.5cm 2cm;
    }
  }
</style>
