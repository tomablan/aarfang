<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { sitesApi, auditsApi, type Site, type Audit, type TechStack } from '$lib/api.js'
  import { loadStoredToken } from '$lib/stores/auth.svelte.js'
  import { scoreColor, scoreBg, formatDate, faviconUrl } from '$lib/utils.js'

  const siteId = $derived($page.params.siteId)

  let site = $state<Site | null>(null)
  let latestAudit = $state<Audit | null>(null)
  let history = $state<Audit[]>([])
  let loading = $state(true)

  onMount(async () => {
    const token = loadStoredToken() ?? ''
    if (!token) { goto('/login'); return }
    try {
      const [s, a, h] = await Promise.all([
        sitesApi.get(token, siteId),
        auditsApi.latest(token, siteId),
        auditsApi.history(token, siteId),
      ])
      site = s
      latestAudit = a
      history = h.filter((a) => a.status === 'completed').slice(0, 12)
    } catch {
      goto('/login')
    } finally {
      loading = false
    }
  })

  function stackBadge(label: string | undefined, value: string | undefined) {
    return value ? { label, value } : null
  }

  const techBadges = $derived(site?.techStack ? [
    stackBadge('CMS', site.techStack.cms),
    stackBadge('E-commerce', site.techStack.ecommerce),
    stackBadge('Framework', site.techStack.framework),
    stackBadge('Serveur', site.techStack.server),
    stackBadge('CDN', site.techStack.cdn),
    stackBadge('Hébergeur', site.techStack.hosting),
    stackBadge('Pays', (site.techStack as any).country),
    stackBadge('Langage', site.techStack.language),
  ].filter(Boolean) as { label: string; value: string }[] : [])

  function scoreLabel(s: number | undefined) {
    if (s === undefined) return { text: '—', color: 'text-slate-400' }
    if (s >= 80) return { text: `${s}`, color: 'text-green-600' }
    if (s >= 50) return { text: `${s}`, color: 'text-amber-500' }
    return { text: `${s}`, color: 'text-red-500' }
  }

  const siteDomain = $derived(site ? (() => { try { return new URL(site.url).hostname } catch { return site.url } })() : '')
</script>

<svelte:head>
  <title>{site?.name ?? 'Fiche technique'} — Fiche technique</title>
</svelte:head>

{#if loading}
  <div class="text-slate-400 text-sm">Chargement…</div>
{:else if site}
  <!-- Barre d'actions -->
  <div class="flex items-center gap-2 mb-4 flex-wrap">
    <a href="/sites/{siteId}"
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
      <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
      </svg>
      Dernier audit
    </a>
    <a href="/sites/{siteId}/report"
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
      <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/>
      </svg>
      Rapport PDF
    </a>
    <a href="/sites/{siteId}/audits"
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
      <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      Historique
    </a>
    <a href="/sites/{siteId}/settings"
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
      <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"/>
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
      </svg>
      Paramètres
    </a>
    <a href={site.url} target="_blank" rel="noopener noreferrer"
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ml-auto">
      <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/>
      </svg>
      Ouvrir le site
    </a>
  </div>

  <!-- Navigation (breadcrumb) -->
  <div class="flex items-center gap-2 mb-6 text-sm text-slate-500">
    <a href="/dashboard" class="hover:text-slate-700 dark:hover:text-slate-300">Sites</a>
    <span class="text-slate-300 dark:text-slate-700">/</span>
    <a href="/sites/{siteId}" class="hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1.5">
      {#if faviconUrl(site.url)}
        <img src={faviconUrl(site.url)} alt="" width="14" height="14" class="rounded" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
      {/if}
      {site.name}
    </a>
    <span class="text-slate-300 dark:text-slate-700">/</span>
    <span class="text-slate-700 dark:text-slate-300">Fiche technique</span>
  </div>

  <div class="grid grid-cols-3 gap-6">

    <!-- Colonne principale (2/3) -->
    <div class="col-span-2 space-y-6">

      <!-- Aperçu visuel (placeholder) -->
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div class="px-5 py-3 border-b border-slate-100 dark:border-slate-700">
          <h2 class="font-semibold text-slate-700 dark:text-slate-300">Aperçu visuel</h2>
        </div>
        <div class="flex flex-col items-center justify-center gap-4 py-10 bg-slate-50 dark:bg-slate-800/50">
          {#if faviconUrl(site.url)}
            <img src={faviconUrl(site.url)} alt="" width="48" height="48" class="rounded-xl shadow"
              onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
          {:else}
            <div class="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
              <svg class="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"/>
              </svg>
            </div>
          {/if}
          <div class="text-center">
            <p class="font-medium text-slate-700 dark:text-slate-300 text-sm">{site.name}</p>
            <p class="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{siteDomain}</p>
          </div>
          <a href={site.url} target="_blank" rel="noopener noreferrer"
            class="text-xs px-3 py-1.5 rounded-lg bg-slate-800 dark:bg-slate-700 text-white hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors">
            Visiter le site ↗
          </a>
        </div>
      </div>

      <!-- Stack technique -->
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div class="px-5 py-3 border-b border-slate-100 dark:border-slate-700">
          <h2 class="font-semibold text-slate-700 dark:text-slate-300">Stack technologique</h2>
          {#if site.techStackAt}
            <p class="text-xs text-slate-400 dark:text-slate-600 mt-0.5">Détecté le {formatDate(site.techStackAt)}</p>
          {/if}
        </div>
        <div class="px-5 py-4">
          {#if techBadges.length > 0}
            <div class="grid grid-cols-2 gap-3">
              {#each techBadges as badge}
                <div class="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                  <div class="w-2 h-2 rounded-full bg-amber-400 shrink-0"></div>
                  <div>
                    <p class="text-xs text-slate-400 dark:text-slate-600 leading-none mb-0.5">{badge.label}</p>
                    <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">{badge.value}</p>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-sm text-slate-400 dark:text-slate-600 py-2">
              Stack non encore détecté — lancer un audit pour analyser le site.
            </p>
          {/if}
        </div>
      </div>

      <!-- Scores par catégorie (dernier audit) -->
      {#if latestAudit?.scores}
        {@const scores = latestAudit.scores}
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div class="px-5 py-3 border-b border-slate-100 dark:border-slate-700">
            <h2 class="font-semibold text-slate-700 dark:text-slate-300">Derniers scores d'audit</h2>
            <p class="text-xs text-slate-400 dark:text-slate-600 mt-0.5">{formatDate(latestAudit.completedAt)}</p>
          </div>
          <div class="px-5 py-4">
            <div class="grid grid-cols-3 gap-3">
              {#each [
                { key: 'global', label: 'Global', bold: true },
                { key: 'securite', label: 'Sécurité' },
                { key: 'conformite', label: 'Conformité' },
                { key: 'technique', label: 'Technique' },
                { key: 'seo_technique', label: 'SEO' },
                { key: 'seo_local', label: 'SEO Local' },
                { key: 'opportunites', label: 'Navigation' },
                { key: 'accessibilite', label: 'Accessibilité' },
                { key: 'sea', label: 'SEA & Tracking' },
                { key: 'ecoconception', label: 'Éco-conception' },
              ] as cat}
                {@const val = scores[cat.key as keyof typeof scores] as number | undefined}
                {@const sl = scoreLabel(val)}
                <div class="flex items-center justify-between py-2 border-b border-slate-50 dark:border-slate-800 last:border-0">
                  <span class="text-sm {cat.bold ? 'font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}">{cat.label}</span>
                  <span class="text-sm font-bold {sl.color}">{sl.text}</span>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Colonne latérale (1/3) -->
    <div class="space-y-4">

      <!-- Identité du site -->
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <h3 class="font-semibold text-slate-700 dark:text-slate-300 mb-3">Identité</h3>
        <div class="space-y-3 text-sm">
          <div>
            <p class="text-xs text-slate-400 dark:text-slate-600 mb-0.5">Nom</p>
            <p class="font-medium text-slate-800 dark:text-slate-100">{site.name}</p>
          </div>
          <div>
            <p class="text-xs text-slate-400 dark:text-slate-600 mb-0.5">URL</p>
            <a href={site.url} target="_blank" rel="noopener noreferrer"
              class="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 break-all leading-tight transition-colors">
              {site.url}
            </a>
          </div>
          <div>
            <p class="text-xs text-slate-400 dark:text-slate-600 mb-0.5">Ajouté le</p>
            <p class="text-slate-600 dark:text-slate-400">{formatDate(site.createdAt)}</p>
          </div>
          {#if latestAudit}
            <div>
              <p class="text-xs text-slate-400 dark:text-slate-600 mb-0.5">Dernier audit</p>
              <p class="text-slate-600 dark:text-slate-400">{formatDate(latestAudit.completedAt)}</p>
            </div>
          {/if}
          <div>
            <p class="text-xs text-slate-400 dark:text-slate-600 mb-0.5">Audits réalisés</p>
            <p class="text-slate-600 dark:text-slate-400">{history.length} audit{history.length > 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      <!-- Score global + évolution -->
      {#if latestAudit?.scores}
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h3 class="font-semibold text-slate-700 dark:text-slate-300 mb-3">Score global</h3>
          <div class="text-center mb-4">
            <span class="text-5xl font-bold {scoreColor(latestAudit.scores.global)}">{latestAudit.scores.global}</span>
            <span class="text-slate-400 dark:text-slate-600 text-sm">/100</span>
          </div>
          {#if history.length >= 2}
            <div class="space-y-1.5">
              <p class="text-xs text-slate-400 dark:text-slate-600 mb-2">Évolution récente</p>
              {#each history.slice(0, 5) as audit}
                {@const s = audit.scores?.global}
                <div class="flex items-center gap-2">
                  <div class="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
                    <div
                      class="h-1.5 rounded-full {s && s >= 80 ? 'bg-green-400' : s && s >= 50 ? 'bg-amber-400' : 'bg-red-400'}"
                      style="width: {s ?? 0}%"
                    ></div>
                  </div>
                  <span class="text-xs font-mono text-slate-500 w-8 text-right shrink-0">{s ?? '—'}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}
