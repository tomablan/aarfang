<script lang="ts">
  import { goto } from '$app/navigation'
  import { sitesApi } from '$lib/api.js'
  import { loadStoredToken } from '$lib/stores/auth.svelte.js'

  let url = $state('')
  let name = $state('')
  let cmsType = $state('other')
  let error = $state('')
  let loading = $state(false)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    error = ''
    loading = true
    const token = loadStoredToken()
    if (!token) { goto('/login'); return }
    try {
      const site = await sitesApi.create(token, { url, name, cmsType })
      goto(`/sites/${site.id}`)
    } catch (err: any) {
      error = err.message ?? 'Erreur lors de la création'
    } finally {
      loading = false
    }
  }
</script>

<div class="max-w-lg">
  <div class="mb-6">
    <a href="/dashboard" class="text-sm text-slate-500 hover:text-slate-700">← Retour</a>
    <div class="flex items-center justify-between mt-2">
      <h1 class="text-2xl font-bold text-slate-800">Ajouter un site</h1>
      <a href="/sites/import" class="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline">Importer plusieurs sites →</a>
    </div>
  </div>

  <form onsubmit={handleSubmit} class="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
    <div>
      <label class="block text-sm font-medium text-slate-700 mb-1" for="name">Nom du site</label>
      <input id="name" type="text" bind:value={name} required placeholder="Mon client - Site vitrine"
        class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
    </div>
    <div>
      <label class="block text-sm font-medium text-slate-700 mb-1" for="url">URL</label>
      <input id="url" type="text" bind:value={url} required placeholder="https://example.com"
        class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
    </div>
    <div>
      <label class="block text-sm font-medium text-slate-700 mb-1" for="cms">CMS</label>
      <select id="cms" bind:value={cmsType}
        class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400">
        <option value="other">Autre / Inconnu</option>
        <option value="wordpress">WordPress</option>
        <option value="prestashop">PrestaShop</option>
      </select>
    </div>

    {#if error}
      <p class="text-red-600 text-sm">{error}</p>
    {/if}

    <div class="flex gap-3 pt-2">
      <button type="submit" disabled={loading}
        class="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors">
        {loading ? 'Création…' : 'Créer le site'}
      </button>
      <a href="/dashboard" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
        Annuler
      </a>
    </div>
  </form>
</div>
