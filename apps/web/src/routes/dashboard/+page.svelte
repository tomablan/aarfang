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
  <h1 class="text-2xl font-bold text-slate-800">Sites</h1>
  <a href="/sites/new" class="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors">
    + Ajouter un site
  </a>
</div>

{#if loading}
  <div class="text-slate-500 text-sm">Chargement…</div>
{:else if sites.length === 0}
  <div class="text-center py-16 text-slate-500">
    <p class="text-lg mb-2">Aucun site pour l'instant</p>
    <a href="/sites/new" class="text-slate-700 underline text-sm">Ajouter votre premier site →</a>
  </div>
{:else}
  <div class="grid gap-4">
    {#each sites as site}
      <a href="/sites/{site.id}" class="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 hover:shadow-sm transition-all flex items-center justify-between group">
        <div>
          <p class="font-semibold text-slate-800 group-hover:text-slate-900">{site.name}</p>
          <p class="text-sm text-slate-500 mt-0.5">{site.url}</p>
          {#if site.latestAudit?.completedAt}
            <p class="text-xs text-slate-400 mt-1">Dernier audit : {formatDate(site.latestAudit.completedAt)}</p>
          {:else}
            <p class="text-xs text-slate-400 mt-1">Aucun audit effectué</p>
          {/if}
        </div>

        {#if site.latestAudit?.scores}
          <div class="flex items-center gap-6">
            {#each [['Technique', site.latestAudit.scores.technique], ['Sécu', site.latestAudit.scores.securite], ['SEO', site.latestAudit.scores.seo_technique], ['Opport.', site.latestAudit.scores.opportunites]] as [label, score]}
              <div class="text-center hidden sm:block">
                <p class="text-xs text-slate-400">{label}</p>
                <p class="font-bold text-lg {scoreColor(score as number)}">{score}</p>
              </div>
            {/each}
            <div class="text-center ml-2 pl-4 border-l border-slate-200">
              <p class="text-xs text-slate-400">Global</p>
              <p class="font-bold text-2xl {scoreColor(site.latestAudit.scores.global)}">{site.latestAudit.scores.global}</p>
            </div>
          </div>
        {:else}
          <span class="text-slate-400 text-sm">—</span>
        {/if}
      </a>
    {/each}
  </div>
{/if}
