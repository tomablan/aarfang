<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { sitesApi, type SiteWithAudit } from '$lib/api.js'
  import { loadStoredToken } from '$lib/stores/auth.svelte.js'
  import { scoreColor, faviconUrl, formatDate } from '$lib/utils.js'

  let sites = $state<SiteWithAudit[]>([])
  let loading = $state(true)
  let token = $state('')
  let sortKey = $state<'name' | 'score' | 'date'>('name')
  let sortDir = $state<'asc' | 'desc'>('asc')

  onMount(async () => {
    token = loadStoredToken() ?? ''
    if (!token) { goto('/login'); return }
    try {
      sites = await sitesApi.list(token)
    } catch {
      goto('/login')
    } finally {
      loading = false
    }
  })

  const sorted = $derived([...sites].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'name') {
      cmp = a.name.localeCompare(b.name, 'fr')
    } else if (sortKey === 'score') {
      const sa = a.latestAudit?.scores?.global ?? -1
      const sb = b.latestAudit?.scores?.global ?? -1
      cmp = sa - sb
    } else {
      const da = a.latestAudit?.completedAt ? new Date(a.latestAudit.completedAt).getTime() : 0
      const db_ = b.latestAudit?.completedAt ? new Date(b.latestAudit.completedAt).getTime() : 0
      cmp = da - db_
    }
    return sortDir === 'asc' ? cmp : -cmp
  }))

  function setSort(key: typeof sortKey) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc'
    } else {
      sortKey = key
      sortDir = key === 'score' || key === 'date' ? 'desc' : 'asc'
    }
  }
</script>

<div class="flex items-center justify-between mb-6 gap-4 flex-wrap">
  <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100">Sites</h1>
  <div class="flex items-center gap-2 flex-wrap">
    {#if sites.length > 1}
      <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        {#each ([['name', 'Nom'], ['score', 'Score'], ['date', 'Date']] as const) as [key, label]}
          <button
            onclick={() => setSort(key)}
            class="px-3 py-1 rounded-md text-xs font-medium transition-colors {sortKey === key ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}"
          >
            {label}{sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
          </button>
        {/each}
      </div>
    {/if}
    <a href="/sites/import" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-slate-200 dark:border-slate-700">
      Importer CSV
    </a>
    <a href="/sites/new" class="bg-slate-800 dark:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors">
      + Ajouter un site
    </a>
  </div>
</div>

{#if loading}
  <div class="text-slate-500 dark:text-slate-400 text-sm">Chargement…</div>
{:else if sites.length === 0}
  <!-- Onboarding -->
  <div class="max-w-2xl mx-auto mt-4">
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center mb-6">
      <div class="flex items-center justify-center mx-auto mb-5">
        <svg width="64" height="70" viewBox="0 0 40 44" fill="none">
          <path d="M13 13 L10 3 L17 10 Z" fill="var(--logo-body)"/>
          <path d="M27 13 L30 3 L23 10 Z" fill="var(--logo-body)"/>
          <ellipse cx="20" cy="26" rx="16" ry="15" fill="var(--logo-body)"/>
          <ellipse cx="20" cy="31" rx="9" ry="8" fill="#f1f5f9" opacity="var(--logo-belly-opacity)"/>
          <ellipse cx="20" cy="24" rx="12" ry="11" fill="var(--logo-overlay)" opacity="0.5"/>
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
          <path d="M18 27 Q20 30 22 27 Q20 25.5 18 27Z" fill="var(--logo-beak)"/>
        </svg>
      </div>
      <h2 class="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Bienvenue sur aarfang</h2>
      <p class="text-slate-500 dark:text-slate-400 text-sm mb-7 max-w-sm mx-auto leading-relaxed">
        Auditez la qualité de vos sites en quelques secondes — sécurité, SEO, performance, conformité RGPD et opportunités commerciales.
      </p>
      <a href="/sites/new" class="inline-flex items-center gap-2 bg-slate-800 dark:bg-slate-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Ajouter votre premier site
      </a>
    </div>

    <div class="grid grid-cols-3 gap-4">
      {#each [
        { step: '1', title: 'Ajoutez un site', desc: 'Renseignez l\'URL et le nom du site à analyser.' },
        { step: '2', title: 'Lancez un audit', desc: 'L\'analyse complète s\'exécute en moins d\'une minute.' },
        { step: '3', title: 'Obtenez le rapport', desc: 'Score par catégorie, recommandations et résumé IA exportable.' },
      ] as item}
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div class="w-7 h-7 bg-slate-800 dark:bg-slate-700 rounded-lg flex items-center justify-center mb-3">
            <span class="text-white text-xs font-bold">{item.step}</span>
          </div>
          <p class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">{item.title}</p>
          <p class="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">{item.desc}</p>
        </div>
      {/each}
    </div>
  </div>
{:else}
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    {#each sorted as site}
      {@const favicon = faviconUrl(site.url)}
      <a href="/sites/{site.id}" class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm transition-all flex flex-col gap-3 group">
        <!-- En-tête : favicon + nom -->
        <div class="flex items-center gap-2.5 min-w-0">
          {#if favicon}
            <img
              src={favicon}
              alt=""
              width="20" height="20"
              class="rounded shrink-0 opacity-90"
              onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
            />
          {/if}
          <div class="min-w-0">
            <p class="font-semibold text-slate-800 dark:text-slate-100 group-hover:text-slate-900 dark:group-hover:text-white truncate text-sm">{site.name}</p>
            <p class="text-xs text-slate-400 dark:text-slate-500 truncate">{new URL(site.url).hostname}</p>
          </div>
        </div>

        <!-- Score global -->
        {#if site.latestAudit?.scores}
          <div class="flex items-end justify-between">
            <div class="flex gap-3">
              {#each [['Sécu', site.latestAudit.scores.securite], ['SEO', site.latestAudit.scores.seo_technique], ['Éco', site.latestAudit.scores.ecoconception], ['Opport.', site.latestAudit.scores.opportunites]] as [label, score]}
                <div class="text-center">
                  <p class="text-[10px] text-slate-400 dark:text-slate-500">{label}</p>
                  <p class="font-semibold text-sm {scoreColor(score as number)}">{score}</p>
                </div>
              {/each}
            </div>
            <div class="text-right">
              <p class="text-[10px] text-slate-400 dark:text-slate-500">Global</p>
              <p class="font-bold text-2xl leading-none {scoreColor(site.latestAudit.scores.global)}">{site.latestAudit.scores.global}</p>
            </div>
          </div>
          <p class="text-[10px] text-slate-400 dark:text-slate-500">{formatDate(site.latestAudit.completedAt)}</p>
        {:else}
          <p class="text-xs text-slate-400 dark:text-slate-500 mt-auto">Aucun audit effectué</p>
        {/if}
      </a>
    {/each}

    <!-- Carte ajout rapide -->
    <a href="/sites/new" class="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-500 min-h-[120px]">
      <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      <span class="text-xs font-medium">Ajouter un site</span>
    </a>
  </div>
{/if}
