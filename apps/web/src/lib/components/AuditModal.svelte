<script lang="ts">
  interface Props {
    siteName: string
    isEcommerce: boolean
    onconfirm: (opts: { crawlFile: File | null; isEcommerce: boolean }) => void
    oncancel: () => void
  }

  let { siteName, isEcommerce: initialEcommerce, onconfirm, oncancel }: Props = $props()

  let isEcommerce = $state(initialEcommerce)
  let crawlFile = $state<File | null>(null)
  let dragging = $state(false)
  let fileInput: HTMLInputElement

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
    onconfirm({ crawlFile, isEcommerce })
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Backdrop -->
<div
  class="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4"
  role="dialog"
  aria-modal="true"
  aria-label="Lancer un audit"
>
  <!-- Panel -->
  <div class="bg-white rounded-2xl shadow-xl w-full max-w-md z-50 overflow-hidden">

    <!-- Header -->
    <div class="px-6 pt-6 pb-4 border-b border-slate-100">
      <h2 class="text-lg font-semibold text-slate-800">Lancer un audit</h2>
      <p class="text-sm text-slate-500 mt-0.5 truncate">{siteName}</p>
    </div>

    <div class="px-6 py-5 space-y-5">

      <!-- Toggle e-commerce -->
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-sm font-medium text-slate-700">Site e-commerce</p>
          <p class="text-xs text-slate-500 mt-0.5">Active les signaux liés à la vente en ligne (panier, tunnel, paiement…)</p>
        </div>
        <button
          onclick={() => isEcommerce = !isEcommerce}
          role="switch"
          aria-checked={isEcommerce}
          class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 {isEcommerce ? 'bg-slate-800' : 'bg-slate-300'}"
        >
          <span class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform {isEcommerce ? 'translate-x-6' : 'translate-x-1'}"></span>
        </button>
      </div>

      <!-- Zone de dépôt CSV -->
      <div>
        <p class="text-sm font-medium text-slate-700 mb-2">
          Crawl Screaming Frog
          <span class="text-xs font-normal text-slate-400 ml-1">— optionnel</span>
        </p>

        {#if crawlFile}
          <!-- Fichier sélectionné -->
          <div class="flex items-center gap-3 border border-green-200 bg-green-50 rounded-xl px-4 py-3">
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
          <!-- Drop zone -->
          <button
            class="w-full border-2 border-dashed rounded-xl px-4 py-6 text-center transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-400
              {dragging ? 'border-slate-400 bg-slate-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}"
            ondragover={(e) => { e.preventDefault(); dragging = true }}
            ondragleave={() => dragging = false}
            ondrop={handleDrop}
            onclick={() => fileInput.click()}
            aria-label="Déposer le fichier CSV Screaming Frog"
          >
            <p class="text-sm text-slate-500">
              Glisser-déposer l'export <span class="font-medium text-slate-700">Internal HTML</span> de Screaming Frog
            </p>
            <p class="text-xs text-slate-400 mt-1">ou cliquer pour parcourir · CSV uniquement</p>
          </button>
        {/if}

        <input
          bind:this={fileInput}
          type="file"
          accept=".csv,text/csv"
          class="hidden"
          onchange={handleFileChange}
        />

        <p class="text-xs text-slate-400 mt-2">
          Active 6 signaux SEO supplémentaires : doublons, pages cassées, thin content, profondeur de crawl…
        </p>
      </div>
    </div>

    <!-- Actions -->
    <div class="px-6 pb-6 flex items-center gap-3">
      <button
        onclick={confirm}
        class="flex-1 bg-slate-800 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-slate-700 transition-colors"
      >
        Lancer l'audit
      </button>
      <button
        onclick={oncancel}
        class="px-4 py-2.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        Annuler
      </button>
    </div>
  </div>
</div>
