<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { sitesApi, type SiteWithAudit } from '$lib/api.js'
  import { loadStoredToken } from '$lib/stores/auth.svelte.js'
  import { scoreColor, formatDate } from '$lib/utils.js'

  let sites = $state<SiteWithAudit[]>([])
  let loading = $state(true)
  let token = $state('')

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
</script>

<div class="flex items-center justify-between mb-8">
  <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100">Sites</h1>
  <a href="/sites/new" class="bg-slate-800 dark:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors">
    + Ajouter un site
  </a>
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
  <div class="grid gap-4">
    {#each sites as site}
      <a href="/sites/{site.id}" class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm transition-all flex items-center justify-between group">
        <div>
          <p class="font-semibold text-slate-800 dark:text-slate-100 group-hover:text-slate-900 dark:group-hover:text-white">{site.name}</p>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{site.url}</p>
          {#if site.latestAudit?.completedAt}
            <p class="text-xs text-slate-400 dark:text-slate-500 mt-1">Dernier audit : {formatDate(site.latestAudit.completedAt)}</p>
          {:else}
            <p class="text-xs text-slate-400 dark:text-slate-500 mt-1">Aucun audit effectué</p>
          {/if}
        </div>

        {#if site.latestAudit?.scores}
          <div class="flex items-center gap-6">
            {#each [['Technique', site.latestAudit.scores.technique], ['Sécu', site.latestAudit.scores.securite], ['SEO', site.latestAudit.scores.seo_technique], ['Opport.', site.latestAudit.scores.opportunites]] as [label, score]}
              <div class="text-center hidden sm:block">
                <p class="text-xs text-slate-400 dark:text-slate-500">{label}</p>
                <p class="font-bold text-lg {scoreColor(score as number)}">{score}</p>
              </div>
            {/each}
            <div class="text-center ml-2 pl-4 border-l border-slate-200 dark:border-slate-700">
              <p class="text-xs text-slate-400 dark:text-slate-500">Global</p>
              <p class="font-bold text-2xl {scoreColor(site.latestAudit.scores.global)}">{site.latestAudit.scores.global}</p>
            </div>
          </div>
        {:else}
          <span class="text-slate-400 dark:text-slate-500 text-sm">—</span>
        {/if}
      </a>
    {/each}
  </div>
{/if}
