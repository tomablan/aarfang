<script lang="ts">
  interface CrawlOptions {
    maxPages: number
    delayMs: number
    contentTypes: string[]
    respectRobots: boolean
  }

  interface Props {
    siteName: string
    onconfirm: (opts: { crawlFile: File | null; crawlMode: 'none' | 'auto' | 'file'; crawlOptions: CrawlOptions }) => void
    oncancel: () => void
  }

  let { siteName, onconfirm, oncancel }: Props = $props()

  let crawlMode = $state<'none' | 'auto' | 'file'>('auto')
  let crawlFile = $state<File | null>(null)
  let dragging = $state(false)
  let fileInput: HTMLInputElement

  // Options crawl intégré
  let maxPages = $state(200)
  let delayMs = $state(300)
  let includeHtml = $state(true)
  let includePdf = $state(false)

  const DELAY_OPTIONS = [
    { value: 100, label: 'Rapide — 100ms', desc: 'Déconseillé sur les petits hébergements' },
    { value: 300, label: 'Normal — 300ms', desc: 'Recommandé pour la plupart des sites' },
    { value: 800, label: 'Prudent — 800ms', desc: 'Pour les sites sensibles ou mutualisés' },
    { value: 2000, label: 'Très lent — 2s', desc: 'Aucun risque de surcharge' },
  ]

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    dragging = false
    const file = e.dataTransfer?.files[0]
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
      crawlFile = file
    }
  }

  function handleFileChange(e: Event) {
    crawlFile = (e.target as HTMLInputElement).files?.[0] ?? null
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') oncancel()
  }

  function confirm() {
    const contentTypes = [...(includeHtml ? ['html'] : []), ...(includePdf ? ['pdf'] : [])]
    onconfirm({
      crawlFile: crawlMode === 'file' ? crawlFile : null,
      crawlMode,
      crawlOptions: { maxPages, delayMs, contentTypes: contentTypes.length ? contentTypes : ['html'], respectRobots: true },
    })
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Backdrop -->
<div
  class="fixed inset-0 bg-black/40 dark:bg-black/60 z-40 flex items-center justify-center p-4"
  role="dialog"
  aria-modal="true"
  aria-label="Lancer un audit"
>
  <!-- Panel -->
  <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg z-50 overflow-hidden">

    <!-- Header -->
    <div class="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-700">
      <h2 class="text-lg font-semibold text-slate-800 dark:text-slate-100">Lancer un audit</h2>
      <p class="text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate">{siteName}</p>
    </div>

    <div class="px-6 py-5 space-y-5">

      <!-- Sélecteur de mode crawl -->
      <div>
        <p class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2.5">Analyse du site</p>
        <div class="space-y-2">

          <!-- Mode : Sans crawl -->
          <label class="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors {crawlMode === 'none' ? 'border-slate-400 dark:border-slate-600 bg-slate-50 dark:bg-slate-800' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}">
            <input type="radio" name="crawlMode" value="none" bind:group={crawlMode} class="mt-0.5 accent-slate-800" />
            <div>
              <p class="text-sm font-medium text-slate-700 dark:text-slate-300">Sans crawl</p>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Audit de la page d'accueil uniquement — rapide (~30 sec)</p>
            </div>
          </label>

          <!-- Mode : Crawl automatique -->
          <label class="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors {crawlMode === 'auto' ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}">
            <input type="radio" name="crawlMode" value="auto" bind:group={crawlMode} class="mt-0.5 accent-amber-500" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <p class="text-sm font-medium text-slate-700 dark:text-slate-300">Crawl automatique</p>
                <span class="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">Recommandé</span>
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Analyse l'ensemble des pages — active 9 signaux SEO supplémentaires</p>
            </div>
          </label>

          <!-- Mode : Import CSV Screaming Frog -->
          <label class="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors {crawlMode === 'file' ? 'border-slate-400 dark:border-slate-600 bg-slate-50 dark:bg-slate-800' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}">
            <input type="radio" name="crawlMode" value="file" bind:group={crawlMode} class="mt-0.5 accent-slate-800" />
            <div>
              <p class="text-sm font-medium text-slate-700 dark:text-slate-300">Import CSV Screaming Frog</p>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Pour les sites de plus de 500 pages ou nécessitant le rendu JS</p>
            </div>
          </label>
        </div>
      </div>

      <!-- Options crawl automatique -->
      {#if crawlMode === 'auto'}
        <div class="space-y-3 bg-slate-50 dark:bg-slate-950 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
          <p class="text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wide">Options du crawl</p>

          <div class="grid grid-cols-2 gap-3">
            <!-- Limite de pages -->
            <div>
              <label class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Limite de pages</label>
              <select bind:value={maxPages} class="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                <option value={50}>50 pages</option>
                <option value={100}>100 pages</option>
                <option value={200}>200 pages</option>
                <option value={500}>500 pages</option>
              </select>
            </div>

            <!-- Types de contenu -->
            <div>
              <p class="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Types de contenu</p>
              <div class="space-y-1">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" bind:checked={includeHtml} class="accent-slate-800" disabled />
                  <span class="text-xs text-slate-600 dark:text-slate-400">Pages HTML</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" bind:checked={includePdf} class="accent-slate-800" />
                  <span class="text-xs text-slate-600 dark:text-slate-400">PDF</span>
                </label>
              </div>
            </div>
          </div>

          <!-- Délai entre requêtes -->
          <div>
            <label class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Délai entre les requêtes</label>
            <div class="grid grid-cols-2 gap-1.5">
              {#each DELAY_OPTIONS as opt}
                <button
                  type="button"
                  onclick={() => delayMs = opt.value}
                  class="text-left px-2.5 py-2 rounded-lg border text-xs transition-colors {delayMs === opt.value ? 'border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-800 font-medium text-slate-800 dark:text-slate-100' : 'border-transparent bg-white/60 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'}"
                >
                  <span class="block font-medium text-slate-700 dark:text-slate-300">{opt.value === 100 ? 'Rapide' : opt.value === 300 ? 'Normal' : opt.value === 800 ? 'Prudent' : 'Très lent'}</span>
                  <span class="text-slate-400 dark:text-slate-600">{opt.value}ms — {opt.desc}</span>
                </button>
              {/each}
            </div>
          </div>

          <p class="text-xs text-slate-400 dark:text-slate-600">Le crawl s'exécute en arrière-plan. L'audit affiche sa progression en temps réel.</p>
        </div>
      {/if}

      <!-- Zone de dépôt CSV (mode file) -->
      {#if crawlMode === 'file'}
        <div>
          {#if crawlFile}
            <div class="flex items-center gap-3 border border-green-200 bg-green-50 dark:bg-green-950/30 rounded-xl px-4 py-3">
              <div class="text-green-600 text-lg">✓</div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-green-800 truncate">{crawlFile.name}</p>
                <p class="text-xs text-green-600">{(crawlFile.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
              <button
                onclick={() => { crawlFile = null; fileInput.value = '' }}
                class="text-green-500 hover:text-green-700 text-lg leading-none"
                aria-label="Retirer le fichier"
              >✕</button>
            </div>
          {:else}
            <button
              class="w-full border-2 border-dashed rounded-xl px-4 py-6 text-center transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-600
                {dragging ? 'border-slate-400 dark:border-slate-600 bg-slate-50 dark:bg-slate-800' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}"
              ondragover={(e) => { e.preventDefault(); dragging = true }}
              ondragleave={() => dragging = false}
              ondrop={handleDrop}
              onclick={() => fileInput.click()}
              aria-label="Déposer le fichier CSV Screaming Frog"
            >
              <p class="text-sm text-slate-500 dark:text-slate-400">
                Glisser-déposer l'export <span class="font-medium text-slate-700 dark:text-slate-300">Internal HTML</span> de Screaming Frog
              </p>
              <p class="text-xs text-slate-400 dark:text-slate-600 mt-1">ou cliquer pour parcourir · CSV uniquement</p>
            </button>
          {/if}

          <input
            bind:this={fileInput}
            type="file"
            accept=".csv,text/csv"
            class="hidden"
            onchange={handleFileChange}
          />
        </div>
      {/if}

    </div>

    <!-- Actions -->
    <div class="px-6 pb-6 flex items-center gap-3">
      <button
        onclick={confirm}
        disabled={crawlMode === 'file' && !crawlFile}
        class="flex-1 bg-slate-800 dark:bg-slate-700 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors"
      >
        Lancer l'audit
      </button>
      <button
        onclick={oncancel}
        class="px-4 py-2.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
      >
        Annuler
      </button>
    </div>
  </div>
</div>
