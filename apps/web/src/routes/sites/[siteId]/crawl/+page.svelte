<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { auditsApi, sitesApi, type CrawlPage } from '$lib/api.js'
  import { loadStoredToken } from '$lib/stores/auth.svelte.js'

  const siteId = $page.params.siteId

  let token = $state('')
  let siteName = $state('')
  let siteUrl = $state('')
  let pages = $state<CrawlPage[]>([])
  let loading = $state(true)
  let error = $state('')
  let auditId = $state('')
  let search = $state('')
  let filterStatus = $state<'all' | 'ok' | 'redirect' | 'error' | 'noindex'>('all')
  let expanded = $state(new Set<string>())

  // ── Tree building ─────────────────────────────────────────────────────────────

  interface TreeNode {
    path: string        // segment du chemin (ex: "blog")
    fullPath: string    // chemin complet (ex: "/blog")
    page: CrawlPage | null
    children: TreeNode[]
  }

  function buildTree(rows: CrawlPage[], base: string): TreeNode {
    const root: TreeNode = { path: '/', fullPath: '/', page: null, children: [] }
    const nodeMap = new Map<string, TreeNode>()
    nodeMap.set('/', root)

    // Trier par depth puis par URL pour stabilité
    const sorted = [...rows].sort((a, b) => a.crawlDepth - b.crawlDepth || a.url.localeCompare(b.url))

    for (const row of sorted) {
      let pathname: string
      try {
        pathname = new URL(row.url).pathname || '/'
      } catch {
        continue
      }

      // Normaliser le chemin (retirer le slash final sauf racine)
      const normalized = pathname === '/' ? '/' : pathname.replace(/\/$/, '')
      if (nodeMap.has(normalized)) {
        const existing = nodeMap.get(normalized)!
        if (!existing.page) existing.page = row
        continue
      }

      const segments = normalized.split('/').filter(Boolean)
      let current = root
      let builtPath = ''

      for (let i = 0; i < segments.length; i++) {
        builtPath += '/' + segments[i]
        if (!nodeMap.has(builtPath)) {
          const node: TreeNode = {
            path: segments[i],
            fullPath: builtPath,
            page: builtPath === normalized ? row : null,
            children: [],
          }
          nodeMap.set(builtPath, node)
          current.children.push(node)
        } else if (builtPath === normalized) {
          nodeMap.get(builtPath)!.page = row
        }
        current = nodeMap.get(builtPath)!
      }
    }

    // Attacher la page racine si elle existe
    const rootPage = rows.find((r) => {
      try { return new URL(r.url).pathname === '/' } catch { return false }
    })
    if (rootPage) root.page = rootPage

    return root
  }

  // ── Filtrage ─────────────────────────────────────────────────────────────────

  function matchesFilter(p: CrawlPage): boolean {
    if (filterStatus === 'ok' && (p.statusCode < 200 || p.statusCode >= 300)) return false
    if (filterStatus === 'redirect' && (p.statusCode < 300 || p.statusCode >= 400)) return false
    if (filterStatus === 'error' && (p.statusCode < 400)) return false
    if (filterStatus === 'noindex' && p.indexable) return false
    if (search) {
      const q = search.toLowerCase()
      return p.url.toLowerCase().includes(q) || (p.title ?? '').toLowerCase().includes(q)
    }
    return true
  }

  function nodeHasMatch(node: TreeNode): boolean {
    if (node.page && matchesFilter(node.page)) return true
    return node.children.some(nodeHasMatch)
  }

  const filteredPages = $derived(pages.filter(matchesFilter))
  const tree = $derived(pages.length > 0 ? buildTree(pages, siteUrl) : null)

  // ── Status helpers ────────────────────────────────────────────────────────────

  function statusColor(code: number): string {
    if (code >= 200 && code < 300) return 'text-green-600 dark:text-green-400'
    if (code >= 300 && code < 400) return 'text-amber-600 dark:text-amber-400'
    if (code >= 400) return 'text-red-600 dark:text-red-400'
    return 'text-slate-400'
  }
  function statusBg(code: number): string {
    if (code >= 200 && code < 300) return 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300'
    if (code >= 300 && code < 400) return 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
    if (code >= 400) return 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'
    return 'bg-slate-100 dark:bg-slate-800 text-slate-500'
  }

  function toggleNode(path: string) {
    if (expanded.has(path)) {
      expanded.delete(path)
    } else {
      expanded.add(path)
    }
    expanded = new Set(expanded)
  }

  function expandAll() {
    const paths = new Set<string>()
    function collect(node: TreeNode) {
      if (node.children.length > 0) {
        paths.add(node.fullPath)
        node.children.forEach(collect)
      }
    }
    if (tree) collect(tree)
    expanded = paths
  }

  function collapseAll() {
    expanded = new Set()
  }

  // ── Load ──────────────────────────────────────────────────────────────────────

  onMount(async () => {
    token = loadStoredToken() ?? ''
    if (!token) { goto('/login'); return }

    try {
      const site = await sitesApi.get(token, siteId)
      siteName = site.name
      siteUrl = site.url

      // Récupérer le dernier audit avec des pages crawlées
      const history = await auditsApi.history(token, siteId)
      const latest = history.find((a) => a.status === 'completed')
      if (!latest) { loading = false; return }

      auditId = latest.id
      pages = await auditsApi.pages(token, latest.id)
      // Développer les 2 premiers niveaux par défaut
      if (tree) {
        const toExpand = new Set<string>()
        tree.children.forEach((n) => {
          toExpand.add(n.fullPath)
          n.children.slice(0, 5).forEach((c) => toExpand.add(c.fullPath))
        })
        expanded = toExpand
      }
    } catch (e: any) {
      error = e.message ?? 'Erreur de chargement'
    } finally {
      loading = false
    }
  })
</script>

<div class="max-w-5xl">
  <!-- En-tête -->
  <div class="mb-6">
    <a href="/sites/{siteId}" class="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300">← {siteName || 'Site'}</a>
    <div class="flex items-center justify-between gap-4 mt-1 flex-wrap">
      <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100">Arbre des pages</h1>
      {#if pages.length > 0}
        <span class="text-sm text-slate-500 dark:text-slate-400">{pages.length} pages crawlées</span>
      {/if}
    </div>
  </div>

  {#if loading}
    <p class="text-slate-500 dark:text-slate-400 text-sm">Chargement…</p>
  {:else if error}
    <p class="text-red-600 dark:text-red-400 text-sm">{error}</p>
  {:else if pages.length === 0}
    <div class="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 dark:text-slate-400">
      <p class="mb-2 font-medium">Aucune donnée de crawl disponible</p>
      <p class="text-sm">Lancez un audit avec l'option "Crawl automatique" ou importez un CSV Screaming Frog.</p>
    </div>
  {:else}
    <!-- Barre de filtres -->
    <div class="flex items-center gap-3 mb-4 flex-wrap">
      <input
        type="search"
        bind:value={search}
        placeholder="Rechercher une URL ou un titre…"
        class="flex-1 min-w-48 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-600"
      />
      <div class="flex gap-1">
        {#each [['all','Tout'], ['ok','2xx'], ['redirect','3xx'], ['error','4xx+'], ['noindex','Noindex']] as [val, label]}
          <button
            onclick={() => filterStatus = val as typeof filterStatus}
            class="text-xs px-2.5 py-1 rounded-full border transition-colors {filterStatus === val ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 border-slate-800 dark:border-slate-200' : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}">
            {label}
          </button>
        {/each}
      </div>
      <div class="flex gap-2 ml-auto">
        <button onclick={expandAll} class="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300">Tout déplier</button>
        <span class="text-slate-300 dark:text-slate-700">·</span>
        <button onclick={collapseAll} class="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300">Tout replier</button>
      </div>
    </div>

    <!-- Statistiques rapides -->
    {@const ok = pages.filter(p => p.statusCode >= 200 && p.statusCode < 300).length}
    {@const redirects = pages.filter(p => p.statusCode >= 300 && p.statusCode < 400).length}
    {@const errors = pages.filter(p => p.statusCode >= 400).length}
    {@const noindex = pages.filter(p => !p.indexable).length}
    <div class="grid grid-cols-4 gap-3 mb-4">
      {#each [[ok, '2xx OK', 'text-green-600 dark:text-green-400'], [redirects, 'Redirections', 'text-amber-600 dark:text-amber-400'], [errors, 'Erreurs', 'text-red-600 dark:text-red-400'], [noindex, 'Noindex', 'text-slate-500 dark:text-slate-400']] as [count, label, color]}
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-center">
          <p class="text-xl font-bold {color}">{count}</p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
        </div>
      {/each}
    </div>

    <!-- Arbre ou liste plate selon le mode recherche -->
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      {#if search || filterStatus !== 'all'}
        <!-- Mode liste filtrée -->
        {#if filteredPages.length === 0}
          <p class="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">Aucune page ne correspond aux filtres.</p>
        {:else}
          <div class="divide-y divide-slate-100 dark:divide-slate-800">
            {#each filteredPages as p}
              <div class="flex items-start gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <span class="shrink-0 text-xs font-mono px-1.5 py-0.5 rounded {statusBg(p.statusCode)}">{p.statusCode}</span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-mono text-slate-700 dark:text-slate-300 truncate">{new URL(p.url).pathname || '/'}</p>
                  {#if p.title}
                    <p class="text-xs text-slate-400 dark:text-slate-500 truncate">{p.title}</p>
                  {/if}
                </div>
                <div class="flex items-center gap-3 shrink-0 text-xs text-slate-400 dark:text-slate-500">
                  {#if !p.indexable}<span class="text-amber-500">noindex</span>{/if}
                  {#if p.inlinks > 0}<span>{p.inlinks} liens</span>{/if}
                  <span>prof. {p.crawlDepth}</span>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {:else if tree}
        <!-- Mode arbre -->
        {@render TreeNodeView(tree, expanded, statusBg, toggleNode, 0, true)}
      {/if}
    </div>
  {/if}
</div>

<!-- Composant récursif arbre -->
{#snippet TreeNodeView(node: TreeNode, expanded: Set<string>, statusBg: (c: number) => string, toggleNode: (p: string) => void, depth: number, isRoot: boolean)}
  {@const hasChildren = node.children.length > 0}
  {@const isOpen = expanded.has(node.fullPath)}
  {@const p = node.page}

  <div class="{depth > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''}">
    <div
      class="flex items-start gap-2 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors {hasChildren ? 'cursor-pointer' : ''}"
      style="padding-left: {1 + depth * 1.25}rem"
      onclick={hasChildren ? () => toggleNode(node.fullPath) : undefined}
      role={hasChildren ? 'button' : undefined}
      tabindex={hasChildren ? 0 : undefined}
      onkeydown={hasChildren ? (e) => e.key === 'Enter' && toggleNode(node.fullPath) : undefined}
    >
      <!-- Chevron -->
      <span class="shrink-0 w-4 h-4 mt-0.5 flex items-center justify-center text-slate-400">
        {#if hasChildren}
          <svg class="w-3 h-3 transition-transform {isOpen ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
        {:else}
          <span class="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600"></span>
        {/if}
      </span>

      <!-- Chemin -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-sm font-mono {p ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 dark:text-slate-600'}">
            {isRoot ? '/' : node.path}{hasChildren ? '/' : ''}
          </span>
          {#if p}
            <span class="text-xs px-1.5 py-0.5 rounded font-mono {statusBg(p.statusCode)}">{p.statusCode}</span>
            {#if !p.indexable}<span class="text-xs text-amber-500 dark:text-amber-400">noindex</span>{/if}
          {/if}
        </div>
        {#if p?.title}
          <p class="text-xs text-slate-400 dark:text-slate-500 truncate">{p.title}</p>
        {/if}
      </div>

      <!-- Méta -->
      {#if p}
        <div class="flex items-center gap-3 shrink-0 text-xs text-slate-400 dark:text-slate-500">
          {#if p.inlinks > 0}<span>{p.inlinks} lien{p.inlinks > 1 ? 's' : ''}</span>{/if}
          {#if p.wordCount}<span>{p.wordCount} mots</span>{/if}
        </div>
      {:else if hasChildren}
        <span class="shrink-0 text-xs text-slate-400 dark:text-slate-500">{node.children.length} page{node.children.length > 1 ? 's' : ''}</span>
      {/if}
    </div>

    {#if isOpen && hasChildren}
      {#each node.children as child}
        {@render TreeNodeView(child, expanded, statusBg, toggleNode, depth + 1, false)}
      {/each}
    {/if}
  </div>
{/snippet}
