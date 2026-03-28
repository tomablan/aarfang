<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { sitesApi, auditsApi, type Site, type Audit } from '$lib/api.js'
  import { loadStoredToken } from '$lib/stores/auth.svelte.js'
  import { scoreColor, formatDate } from '$lib/utils.js'
  import Sparkline from '$lib/components/Sparkline.svelte'

  const siteId = $derived($page.params.siteId)

  let site = $state<Site | null>(null)
  let history = $state<Audit[]>([])
  let loading = $state(true)
  let token = $state('')

  const completedAudits = $derived(history.filter((a) => a.status === 'completed'))
  const sparkScores = $derived(completedAudits.map((a) => a.scores?.global ?? 0).slice(-20))

  onMount(async () => {
    token = loadStoredToken() ?? ''
    if (!token) { goto('/login'); return }
    loading = true
    try {
      const [s, h] = await Promise.all([
        sitesApi.get(token, siteId),
        auditsApi.history(token, siteId),
      ])
      site = s
      history = h
    } catch {
      goto('/login')
    } finally {
      loading = false
    }
  })

  function statusBadge(status: string) {
    switch (status) {
      case 'completed': return 'bg-green-50 text-green-700'
      case 'running': return 'bg-blue-50 text-blue-700'
      case 'pending': return 'bg-slate-50 text-slate-600'
      case 'failed': return 'bg-red-50 text-red-700'
      default: return 'bg-slate-50 text-slate-500'
    }
  }

  function statusLabel(status: string) {
    return { completed: 'Terminé', running: 'En cours', pending: 'En attente', failed: 'Échoué' }[status] ?? status
  }
</script>

{#if loading}
  <p class="text-slate-500 text-sm">Chargement…</p>
{:else if site}
  <div class="mb-8">
    <a href="/sites/{siteId}" class="text-sm text-slate-500 hover:text-slate-700">← {site.name}</a>
    <h1 class="text-2xl font-bold text-slate-800 mt-1">Historique des audits</h1>
  </div>

  <!-- Tendance globale -->
  {#if sparkScores.length >= 2}
    <div class="bg-white border border-slate-200 rounded-xl p-5 mb-6 flex items-center gap-6">
      <div>
        <p class="text-xs text-slate-500 mb-1">Tendance — score global</p>
        <Sparkline scores={sparkScores} width={200} height={40} />
      </div>
      <div class="text-center">
        <p class="text-xs text-slate-400">Dernier</p>
        <p class="text-3xl font-bold {scoreColor(sparkScores[sparkScores.length - 1])}">{sparkScores[sparkScores.length - 1]}</p>
      </div>
      {#if sparkScores.length >= 2}
        {@const delta = (sparkScores[sparkScores.length - 1] ?? 0) - (sparkScores[sparkScores.length - 2] ?? 0)}
        <div class="text-center">
          <p class="text-xs text-slate-400">Évolution</p>
          <p class="text-lg font-bold {delta >= 0 ? 'text-green-500' : 'text-red-500'}">
            {delta >= 0 ? '+' : ''}{delta}
          </p>
        </div>
      {/if}
      <div class="text-center">
        <p class="text-xs text-slate-400">Audits</p>
        <p class="text-lg font-bold text-slate-700">{completedAudits.length}</p>
      </div>
    </div>
  {/if}

  <!-- Liste des audits -->
  {#if history.length === 0}
    <div class="text-center py-12 text-slate-500">Aucun audit effectué.</div>
  {:else}
    <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div class="divide-y divide-slate-100">
        {#each history as audit}
          <a
            href={audit.status === 'completed' ? `/sites/${siteId}?auditId=${audit.id}` : '#'}
            class="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors {audit.status !== 'completed' ? 'cursor-default' : ''}">
            <div class="flex items-center gap-3">
              <span class="text-xs px-2 py-0.5 rounded-full font-medium {statusBadge(audit.status)}">
                {statusLabel(audit.status)}
              </span>
              <div>
                <p class="text-sm text-slate-700">{formatDate(audit.createdAt)}</p>
                {#if audit.completedAt && audit.startedAt}
                  {@const durationMs = new Date(audit.completedAt).getTime() - new Date(audit.startedAt).getTime()}
                  <p class="text-xs text-slate-400">{(durationMs / 1000).toFixed(1)}s</p>
                {/if}
                {#if audit.errorMessage}
                  <p class="text-xs text-red-500">{audit.errorMessage}</p>
                {/if}
              </div>
            </div>

            {#if audit.scores}
              <div class="flex items-center gap-4">
                {#each [['Sécu', audit.scores.securite], ['Conf.', audit.scores.conformite], ['SEO', audit.scores.seo_technique], ['Tech', audit.scores.technique], ['Opport.', audit.scores.opportunites]] as [label, score]}
                  <div class="text-center hidden md:block">
                    <p class="text-xs text-slate-400">{label}</p>
                    <p class="text-sm font-semibold {scoreColor(score as number)}">{score}</p>
                  </div>
                {/each}
                <div class="text-center pl-3 border-l border-slate-200">
                  <p class="text-xs text-slate-400">Global</p>
                  <p class="text-xl font-bold {scoreColor(audit.scores.global)}">{audit.scores.global}</p>
                </div>
              </div>
            {:else}
              <span class="text-slate-400 text-sm">—</span>
            {/if}
          </a>
        {/each}
      </div>
    </div>
  {/if}
{/if}
