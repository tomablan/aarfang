<script lang="ts">
  import { goto } from '$app/navigation'
  import { sitesApi } from '$lib/api.js'
  import { loadStoredToken } from '$lib/stores/auth.svelte.js'
  import { faviconUrl } from '$lib/utils.js'

  type RowStatus = 'pending' | 'importing' | 'created' | 'error'

  interface ParsedRow {
    name: string
    url: string
    cmsType: string
    isEcommerce: boolean
    status: RowStatus
    error?: string
    siteId?: string
  }

  let step = $state<'input' | 'preview' | 'done'>('input')
  let dragging = $state(false)
  let parseError = $state('')
  let rows = $state<ParsedRow[]>([])
  let importing = $state(false)
  let importedCount = $state(0)
  let errorCount = $state(0)

  // ── Parsing CSV ─────────────────────────────────────────────────────────────

  function parseCsv(text: string): ParsedRow[] {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
    if (lines.length === 0) throw new Error('Fichier vide')

    // Détection de l'en-tête
    const first = lines[0].toLowerCase()
    const hasHeader = first.includes('name') || first.includes('nom') || first.includes('url')
    const dataLines = hasHeader ? lines.slice(1) : lines

    if (dataLines.length === 0) throw new Error('Aucune donnée après l\'en-tête')
    if (dataLines.length > 200) throw new Error('Maximum 200 sites par import')

    // Déterminer le séparateur (virgule, point-virgule ou tab)
    const sep = first.includes(';') ? ';' : first.includes('\t') ? '\t' : ','

    // Mapper les colonnes depuis l'en-tête si présent
    let colName = 0, colUrl = 1, colCms = 2, colEcommerce = 3
    if (hasHeader) {
      const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/['"]/g, ''))
      colName = headers.findIndex(h => h.includes('name') || h.includes('nom')) ?? 0
      colUrl = headers.findIndex(h => h.includes('url')) ?? 1
      colCms = headers.findIndex(h => h.includes('cms')) ?? 2
      colEcommerce = headers.findIndex(h => h.includes('ecommerce') || h.includes('shop') || h.includes('boutique'))
      if (colName === -1) colName = 0
      if (colUrl === -1) colUrl = 1
      if (colCms === -1) colCms = 2
    }

    return dataLines.map(line => {
      const cols = splitCsvLine(line, sep)
      const name = cols[colName]?.replace(/^["']|["']$/g, '').trim() ?? ''
      const url = cols[colUrl]?.replace(/^["']|["']$/g, '').trim() ?? ''
      const cmsRaw = cols[colCms]?.replace(/^["']|["']$/g, '').trim().toLowerCase() ?? ''
      const cmsType = ['wordpress', 'prestashop'].includes(cmsRaw) ? cmsRaw : 'other'
      const ecomRaw = colEcommerce >= 0 ? (cols[colEcommerce]?.replace(/^["']|["']$/g, '').trim().toLowerCase() ?? '') : ''
      const isEcommerce = ['true', '1', 'oui', 'yes'].includes(ecomRaw)

      return { name, url, cmsType, isEcommerce, status: 'pending' as RowStatus }
    }).filter(r => r.name || r.url)
  }

  function splitCsvLine(line: string, sep: string): string[] {
    const result: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"' && !inQuotes) { inQuotes = true; continue }
      if (ch === '"' && inQuotes) { inQuotes = false; continue }
      if (ch === sep && !inQuotes) { result.push(cur); cur = ''; continue }
      cur += ch
    }
    result.push(cur)
    return result
  }

  function handleFile(file: File) {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv' && file.type !== 'text/plain') {
      parseError = 'Fichier CSV ou TXT uniquement'
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        rows = parseCsv(e.target?.result as string)
        parseError = ''
        step = 'preview'
      } catch (err: any) {
        parseError = err.message
      }
    }
    reader.readAsText(file)
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    dragging = false
    const file = e.dataTransfer?.files[0]
    if (file) handleFile(file)
  }

  function handleFileInput(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) handleFile(file)
  }

  let pasteText = $state('')

  function handlePaste() {
    if (!pasteText.trim()) { parseError = 'Collez du texte CSV'; return }
    try {
      rows = parseCsv(pasteText)
      parseError = ''
      step = 'preview'
    } catch (err: any) {
      parseError = err.message
    }
  }

  function removeRow(i: number) {
    rows = rows.filter((_, idx) => idx !== i)
  }

  // ── Import ───────────────────────────────────────────────────────────────────

  async function startImport() {
    const token = loadStoredToken()
    if (!token) { goto('/login'); return }
    importing = true
    importedCount = 0
    errorCount = 0

    // Marquer tout en "importing"
    rows = rows.map(r => ({ ...r, status: 'importing' as RowStatus }))

    try {
      const { results } = await sitesApi.bulk(token, rows.map(r => ({
        url: r.url,
        name: r.name,
        cmsType: r.cmsType,
        isEcommerce: r.isEcommerce,
      })))

      rows = rows.map((r, i) => {
        const res = results.find(x => x.index === i)
        if (!res) return { ...r, status: 'error' as RowStatus, error: 'Pas de réponse' }
        if (res.status === 'created') {
          importedCount++
          return { ...r, status: 'created' as RowStatus, siteId: res.site?.id }
        } else {
          errorCount++
          return { ...r, status: 'error' as RowStatus, error: res.error }
        }
      })
    } catch (err: any) {
      rows = rows.map(r => ({ ...r, status: 'error' as RowStatus, error: err.message }))
      errorCount = rows.length
    } finally {
      importing = false
      step = 'done'
    }
  }

  const validRows = $derived(rows.filter(r => r.name && r.url))
  const invalidRows = $derived(rows.filter(r => !r.name || !r.url))
</script>

<div class="max-w-3xl">
  <div class="mb-6">
    <a href="/dashboard" class="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300">← Retour</a>
    <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-2">Importer des sites</h1>
    <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Importez jusqu'à 200 sites depuis un fichier CSV.</p>
  </div>

  <!-- Étape 1 : input -->
  {#if step === 'input'}
    <!-- Zone de dépôt CSV -->
    <div
      class="border-2 {dragging ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20' : 'border-dashed border-slate-300 dark:border-slate-700'} rounded-xl p-8 text-center transition-colors mb-4 cursor-pointer"
      ondragover={(e) => { e.preventDefault(); dragging = true }}
      ondragleave={() => dragging = false}
      ondrop={handleDrop}
      onclick={() => document.getElementById('csv-file-input')?.click()}
      role="button"
      tabindex="0"
      onkeydown={(e) => e.key === 'Enter' && document.getElementById('csv-file-input')?.click()}
    >
      <svg class="w-8 h-8 mx-auto mb-3 text-slate-400 dark:text-slate-600" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
      <p class="text-sm font-medium text-slate-600 dark:text-slate-400">Déposez un fichier CSV ici</p>
      <p class="text-xs text-slate-400 dark:text-slate-500 mt-1">ou cliquez pour parcourir</p>
      <input id="csv-file-input" type="file" accept=".csv,.txt,text/csv,text/plain" class="hidden" onchange={handleFileInput} />
    </div>

    <!-- Séparateur -->
    <div class="flex items-center gap-3 mb-4">
      <div class="flex-1 h-px bg-slate-200 dark:bg-slate-800"></div>
      <span class="text-xs text-slate-400">ou coller directement</span>
      <div class="flex-1 h-px bg-slate-200 dark:bg-slate-800"></div>
    </div>

    <!-- Zone de paste -->
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
      <textarea
        bind:value={pasteText}
        rows="6"
        placeholder="name,url,cmsType,isEcommerce&#10;Acme Corp,https://acme.com,wordpress,false&#10;Boutique Dupont,https://dupont.fr,prestashop,true"
        class="w-full font-mono text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-slate-400 text-slate-700 dark:text-slate-300"
      ></textarea>
      <button onclick={handlePaste} class="bg-slate-800 dark:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors">
        Analyser
      </button>
    </div>

    {#if parseError}
      <p class="mt-3 text-sm text-red-600 dark:text-red-400">{parseError}</p>
    {/if}

    <!-- Format attendu -->
    <div class="mt-6 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
      <p class="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Format CSV attendu</p>
      <pre class="text-xs text-slate-500 dark:text-slate-500 font-mono leading-relaxed">name,url,cmsType,isEcommerce
Mon client,https://example.com,wordpress,false
Boutique X,https://shop.fr,prestashop,true
Site vitrine,https://vitrine.fr,,</pre>
      <ul class="mt-3 space-y-1 text-xs text-slate-400 dark:text-slate-500">
        <li>· <strong class="text-slate-600 dark:text-slate-400">name</strong> et <strong class="text-slate-600 dark:text-slate-400">url</strong> sont obligatoires</li>
        <li>· <strong class="text-slate-600 dark:text-slate-400">cmsType</strong> : wordpress, prestashop ou vide (= other)</li>
        <li>· <strong class="text-slate-600 dark:text-slate-400">isEcommerce</strong> : true/false ou vide (= false)</li>
        <li>· Séparateur virgule, point-virgule ou tabulation détecté automatiquement</li>
        <li>· L'en-tête est optionnel</li>
      </ul>
    </div>

  <!-- Étape 2 : prévisualisation -->
  {:else if step === 'preview'}
    <div class="flex items-center justify-between mb-4">
      <div>
        <p class="font-semibold text-slate-800 dark:text-slate-100">{validRows.length} site{validRows.length > 1 ? 's' : ''} à importer</p>
        {#if invalidRows.length > 0}
          <p class="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{invalidRows.length} ligne{invalidRows.length > 1 ? 's' : ''} ignorée{invalidRows.length > 1 ? 's' : ''} (nom ou URL manquant)</p>
        {/if}
      </div>
      <button onclick={() => { step = 'input'; rows = [] }} class="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300">
        ← Modifier
      </button>
    </div>

    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden mb-4">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-100 dark:border-slate-800">
            <th class="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Site</th>
            <th class="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hidden sm:table-cell">CMS</th>
            <th class="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hidden sm:table-cell">E-com</th>
            <th class="px-4 py-2.5 w-8"></th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row, i}
            {@const isValid = row.name && row.url}
            <tr class="border-b border-slate-50 dark:border-slate-800/50 last:border-0 {!isValid ? 'opacity-50' : ''}">
              <td class="px-4 py-2.5">
                <div class="flex items-center gap-2 min-w-0">
                  {#if isValid && row.url}
                    <img src={faviconUrl(row.url)} alt="" width="16" height="16" class="rounded shrink-0"
                      onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
                  {/if}
                  <div class="min-w-0">
                    <p class="font-medium text-slate-800 dark:text-slate-200 truncate">
                      {#if row.name}{row.name}{:else}<span class="text-red-400 italic">nom manquant</span>{/if}
                    </p>
                    <p class="text-xs text-slate-400 dark:text-slate-500 truncate">
                      {#if row.url}{row.url}{:else}<span class="text-red-400 italic">URL manquante</span>{/if}
                    </p>
                  </div>
                </div>
              </td>
              <td class="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 hidden sm:table-cell">{row.cmsType}</td>
              <td class="px-4 py-2.5 hidden sm:table-cell">
                {#if row.isEcommerce}
                  <span class="text-xs bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">Oui</span>
                {/if}
              </td>
              <td class="px-4 py-2.5 text-right">
                <button onclick={() => removeRow(i)} class="text-slate-300 dark:text-slate-700 hover:text-red-400 dark:hover:text-red-500 transition-colors" title="Supprimer">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if validRows.length > 0}
      <div class="flex gap-3">
        <button onclick={startImport} disabled={importing}
          class="bg-slate-800 dark:bg-slate-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors">
          {importing ? 'Import en cours…' : `Importer ${validRows.length} site${validRows.length > 1 ? 's' : ''}`}
        </button>
        <a href="/dashboard" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          Annuler
        </a>
      </div>
    {/if}

  <!-- Étape 3 : résultats -->
  {:else}
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 mb-4">
      <div class="flex items-center gap-3 mb-4">
        {#if errorCount === 0}
          <div class="w-10 h-10 bg-green-50 dark:bg-green-950/30 rounded-full flex items-center justify-center shrink-0">
            <svg class="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <div>
            <p class="font-semibold text-slate-800 dark:text-slate-100">{importedCount} site{importedCount > 1 ? 's' : ''} importé{importedCount > 1 ? 's' : ''}</p>
            <p class="text-sm text-slate-500 dark:text-slate-400">Tout s'est bien passé.</p>
          </div>
        {:else}
          <div class="w-10 h-10 bg-amber-50 dark:bg-amber-950/30 rounded-full flex items-center justify-center shrink-0">
            <svg class="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <p class="font-semibold text-slate-800 dark:text-slate-100">{importedCount} importé{importedCount > 1 ? 's' : ''}, {errorCount} erreur{errorCount > 1 ? 's' : ''}</p>
            <p class="text-sm text-slate-500 dark:text-slate-400">Certains sites n'ont pas pu être créés.</p>
          </div>
        {/if}
      </div>

      <!-- Détail par ligne -->
      <div class="space-y-1">
        {#each rows as row}
          <div class="flex items-center gap-2 text-sm py-1">
            {#if row.status === 'created'}
              <svg class="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            {:else}
              <svg class="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            {/if}
            <span class="font-medium text-slate-700 dark:text-slate-300 truncate">{row.name}</span>
            <span class="text-slate-400 dark:text-slate-500 truncate hidden sm:inline">{row.url}</span>
            {#if row.error}
              <span class="text-xs text-red-500 dark:text-red-400 ml-auto shrink-0">{row.error}</span>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <div class="flex gap-3">
      <a href="/dashboard" class="bg-slate-800 dark:bg-slate-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors">
        Voir les sites
      </a>
      {#if errorCount > 0}
        <button onclick={() => { step = 'input'; rows = [] }}
          class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          Réessayer
        </button>
      {/if}
    </div>
  {/if}
</div>
