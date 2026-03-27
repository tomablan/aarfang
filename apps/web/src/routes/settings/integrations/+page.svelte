<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { integrationsApi, type Integration } from '$lib/api.js'
  import { loadStoredToken } from '$lib/stores/auth.svelte.js'
  import { formatDate } from '$lib/utils.js'

  // Catalogue des intégrations disponibles
  const PROVIDERS = [
    {
      id: 'claude',
      name: 'Claude (Anthropic)',
      description: 'Génération de résumés commerciaux par IA. Les coûts d\'utilisation sont facturés sur votre compte Anthropic.',
      fields: [{ key: 'apiKey', label: 'Clé API Anthropic', type: 'password', placeholder: 'sk-ant-api03-...' }],
      docsUrl: 'https://console.anthropic.com/settings/keys',
      group: 'ia',
    },
    {
      id: 'openai',
      name: 'OpenAI',
      description: 'Alternative à Claude pour la génération de résumés. Utilisé en fallback si Claude n\'est pas configuré.',
      fields: [{ key: 'apiKey', label: 'Clé API OpenAI', type: 'password', placeholder: 'sk-proj-...' }],
      docsUrl: 'https://platform.openai.com/api-keys',
      group: 'ia',
    },
    {
      id: 'pagespeed',
      name: 'PageSpeed Insights',
      description: 'Scores de performance, Core Web Vitals, mobile. API Google gratuite avec quota élevé.',
      fields: [{ key: 'apiKey', label: 'Clé API Google', type: 'password', placeholder: 'AIzaSy...' }],
      docsUrl: 'https://developers.google.com/speed/docs/insights/v5/get-started',
      group: 'seo',
    },
    {
      id: 'semrush',
      name: 'Semrush',
      description: 'Mots-clés, backlinks, visibilité organique, pages manquantes.',
      fields: [{ key: 'apiKey', label: 'Clé API Semrush', type: 'password', placeholder: 'Votre clé API Semrush' }],
      docsUrl: 'https://developer.semrush.com/api/',
      group: 'seo',
    },
    {
      id: 'betterstack',
      name: 'BetterStack Uptime',
      description: 'Disponibilité, incidents, temps de réponse.',
      fields: [{ key: 'apiToken', label: 'API Token BetterStack', type: 'password', placeholder: 'Votre token BetterStack' }],
      docsUrl: 'https://betterstack.com/docs/uptime/api/getting-started-with-uptime-api/',
      group: 'monitoring',
    },
    {
      id: 'gsc',
      name: 'Google Search Console',
      description: "Impressions, clics, erreurs d'indexation, couverture.",
      fields: [{ key: 'accessToken', label: 'Access Token OAuth', type: 'password', placeholder: 'Token OAuth 2.0' }],
      docsUrl: 'https://developers.google.com/webmaster-tools',
      group: 'seo',
    },
  ]

  const GROUPS = [
    { id: 'ia', label: 'Intelligence artificielle' },
    { id: 'seo', label: 'SEO & Performance' },
    { id: 'monitoring', label: 'Monitoring' },
  ]

  let token = $state('')
  let integrations = $state<Integration[]>([])
  let loading = $state(true)
  let adding = $state<string | null>(null) // provider id en cours d'ajout
  let formValues = $state<Record<string, string>>({})
  let saving = $state(false)
  let testing = $state<string | null>(null)
  let testResults = $state<Record<string, { ok: boolean; error?: string }>>({})
  let error = $state('')

  onMount(async () => {
    token = loadStoredToken() ?? ''
    if (!token) { goto('/login'); return }
    await loadIntegrations()
  })

  async function loadIntegrations() {
    loading = true
    try {
      integrations = await integrationsApi.list(token)
    } finally {
      loading = false
    }
  }

  function getIntegration(providerId: string) {
    return integrations.find((i) => i.provider === providerId) ?? null
  }

  function startAdding(providerId: string) {
    adding = providerId
    formValues = {}
    error = ''
  }

  async function saveIntegration(providerId: string) {
    saving = true
    error = ''
    try {
      await integrationsApi.create(token, { provider: providerId, credentials: { ...formValues } })
      adding = null
      formValues = {}
      await loadIntegrations()
    } catch (err: any) {
      error = err.message ?? 'Erreur lors de la sauvegarde'
    } finally {
      saving = false
    }
  }

  async function deleteIntegration(id: string) {
    await integrationsApi.delete(token, id)
    await loadIntegrations()
  }

  async function testIntegration(id: string) {
    testing = id
    const result = await integrationsApi.test(token, id).catch((e) => ({ ok: false, error: e.message }))
    testResults[id] = result
    await loadIntegrations() // refresh status
    testing = null
  }
</script>

<div class="max-w-2xl">
  <div class="mb-8">
    <a href="/dashboard" class="text-sm text-slate-500 hover:text-slate-700">← Dashboard</a>
    <h1 class="text-2xl font-bold text-slate-800 mt-2">Intégrations</h1>
    <p class="text-slate-500 text-sm mt-1">Connectez vos outils tiers. Les clés API sont chiffrées et liées à votre organisation.</p>
  </div>

  {#if loading}
    <p class="text-slate-500 text-sm">Chargement…</p>
  {:else}
    <div class="space-y-8">
      {#each GROUPS as group}
        {@const groupProviders = PROVIDERS.filter((p) => p.group === group.id)}
        <div>
          <h2 class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{group.label}</h2>
          <div class="space-y-4">
      {#each groupProviders as provider}
        {@const existing = getIntegration(provider.id)}
        <div class="bg-white border border-slate-200 rounded-xl p-5">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <h2 class="font-semibold text-slate-800">{provider.name}</h2>
                {#if existing}
                  <span class="text-xs px-2 py-0.5 rounded-full font-medium {existing.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}">
                    {existing.status === 'active' ? 'Connecté' : 'Invalide'}
                  </span>
                {/if}
              </div>
              <p class="text-sm text-slate-500">{provider.description}</p>
              {#if existing?.lastTestedAt}
                <p class="text-xs text-slate-400 mt-1">Dernier test : {formatDate(existing.lastTestedAt)}</p>
              {/if}
              {#if existing && testResults[existing.id]}
                {@const r = testResults[existing.id]}
                <p class="text-xs mt-1 {r.ok ? 'text-green-600' : 'text-red-600'}">
                  {r.ok ? '✓ Connexion réussie' : `✗ ${r.error ?? 'Erreur de connexion'}`}
                </p>
              {/if}
            </div>
            <div class="flex items-center gap-2 shrink-0">
              {#if existing}
                <button
                  onclick={() => testIntegration(existing.id)}
                  disabled={testing === existing.id}
                  class="text-sm px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                  {testing === existing.id ? 'Test…' : 'Tester'}
                </button>
                <button
                  onclick={() => startAdding(provider.id)}
                  class="text-sm px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
                  Modifier
                </button>
                <button
                  onclick={() => deleteIntegration(existing.id)}
                  class="text-sm px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                  Supprimer
                </button>
              {:else}
                <button
                  onclick={() => startAdding(provider.id)}
                  class="text-sm px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 transition-colors">
                  Configurer
                </button>
              {/if}
            </div>
          </div>

          <!-- Formulaire inline -->
          {#if adding === provider.id}
            <div class="mt-4 pt-4 border-t border-slate-100 space-y-3">
              {#each provider.fields as field}
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">{field.label}</label>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    bind:value={formValues[field.key]}
                    class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </div>
              {/each}

              {#if error}
                <p class="text-red-600 text-sm">{error}</p>
              {/if}

              <div class="flex gap-2">
                <button
                  onclick={() => saveIntegration(provider.id)}
                  disabled={saving}
                  class="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors">
                  {saving ? 'Sauvegarde…' : 'Sauvegarder'}
                </button>
                <button
                  onclick={() => { adding = null; error = '' }}
                  class="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors">
                  Annuler
                </button>
                <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer"
                  class="ml-auto text-sm text-slate-400 hover:text-slate-600 self-center">
                  Documentation ↗
                </a>
              </div>
            </div>
          {/if}
        </div>
      {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
