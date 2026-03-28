<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { sitesApi, auditsApi, type Site, type Audit, type TechStack } from '$lib/api.js'
  import { loadStoredToken } from '$lib/stores/auth.svelte.js'
  import { scoreColor, scoreBg, formatDate } from '$lib/utils.js'

  const siteId = $derived($page.params.siteId)

  let site = $state<Site | null>(null)
  let latestAudit = $state<Audit | null>(null)
  let history = $state<Audit[]>([])
  let loading = $state(true)
  let screenshotError = $state(false)

  // URL du screenshot via service tiers (thum.io — free, mise en cache)
  const screenshotUrl = $derived(
    site ? `https://image.thum.io/get/width/800/crop/500/noanimate/${encodeURIComponent(site.url)}` : ''
  )

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
    stackBadge('Langage', site.techStack.language),
  ].filter(Boolean) as { label: string; value: string }[] : [])

  function scoreLabel(s: number | undefined) {
    if (s === undefined) return { text: '—', color: 'text-slate-400' }
    if (s >= 80) return { text: `${s}`, color: 'text-green-600' }
    if (s >= 50) return { text: `${s}`, color: 'text-amber-500' }
    return { text: `${s}`, color: 'text-red-500' }
  }
</script>

<svelte:head>
  <title>{site?.name ?? 'Fiche technique'} — Fiche technique</title>
</svelte:head>

{#if loading}
  <div class="text-slate-400 text-sm">Chargement…</div>
{:else if site}
  <!-- Navigation -->
  <div class="flex items-center gap-2 mb-6 text-sm text-slate-500">
    <a href="/dashboard" class="hover:text-slate-700 dark:hover:text-slate-300">Sites</a>
    <span class="text-slate-300 dark:text-slate-700">/</span>
    <a href="/sites/{siteId}" class="hover:text-slate-700 dark:hover:text-slate-300">{site.name}</a>
    <span class="text-slate-300 dark:text-slate-700">/</span>
    <span class="text-slate-700 dark:text-slate-300">Fiche technique</span>
  </div>

  <div class="grid grid-cols-3 gap-6">

    <!-- Colonne principale (2/3) -->
    <div class="col-span-2 space-y-6">

      <!-- Screenshot -->
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div class="px-5 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <h2 class="font-semibold text-slate-700 dark:text-slate-300">Aperçu visuel</h2>
          <a href={site.url} target="_blank" rel="noopener noreferrer"
            class="text-xs text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 transition-colors">
            Ouvrir le site ↗
          </a>
        </div>
        {#if !screenshotError}
          <div class="relative bg-slate-100 dark:bg-slate-800 overflow-hidden" style="height: 320px">
            <!-- Barre de navigateur simulée -->
            <div class="absolute top-0 left-0 right-0 z-10 bg-slate-800/80 backdrop-blur-sm px-4 py-2 flex items-center gap-3">
              <div class="flex gap-1.5">
                <div class="w-3 h-3 rounded-full bg-red-400/80"></div>
                <div class="w-3 h-3 rounded-full bg-amber-400/80"></div>
                <div class="w-3 h-3 rounded-full bg-green-400/80"></div>
              </div>
              <div class="flex-1 bg-white/10 rounded px-3 py-1 text-xs text-white/70 truncate">{site.url}</div>
            </div>
            <img
              src={screenshotUrl}
              alt="Aperçu de {site.name}"
              class="w-full h-full object-cover object-top pt-8"
              onerror={() => screenshotError = true}
              loading="lazy"
            />
          </div>
        {:else}
          <div class="flex items-center justify-center h-48 bg-slate-50 dark:bg-slate-800 text-slate-400 text-sm">
            Aperçu non disponible
          </div>
        {/if}
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
            {#if site.isEcommerce}
              <div class="mt-3 flex items-center gap-2 text-xs text-slate-500">
                <span class="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">E-commerce</span>
                <span>configuré pour les signaux vente en ligne</span>
              </div>
            {/if}
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

      <!-- Actions rapides -->
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <h3 class="font-semibold text-slate-700 dark:text-slate-300 mb-3">Actions</h3>
        <div class="space-y-2">
          <a href="/sites/{siteId}"
            class="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <svg class="w-4 h-4 text-slate-400 dark:text-slate-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>
            Voir le dernier audit
          </a>
          <a href="/sites/{siteId}/report"
            class="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <svg class="w-4 h-4 text-slate-400 dark:text-slate-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/>
            </svg>
            Télécharger le rapport PDF
          </a>
          <a href="/sites/{siteId}/audits"
            class="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <svg class="w-4 h-4 text-slate-400 dark:text-slate-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            Historique des audits
          </a>
          <a href="/sites/{siteId}/settings"
            class="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <svg class="w-4 h-4 text-slate-400 dark:text-slate-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            Paramètres du site
          </a>
        </div>
      </div>
    </div>
  </div>
{/if}
