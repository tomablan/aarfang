<script lang="ts">
  import { onMount } from 'svelte'
  import { goto, afterNavigate } from '$app/navigation'
  import { page } from '$app/stores'
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
      description: "Impressions, clics, erreurs d'indexation, couverture. Connexion via OAuth Google (2 étapes : enregistrer vos identifiants Google OAuth, puis autoriser l'accès).",
      fields: [
        { key: 'clientId', label: 'Client ID Google OAuth', type: 'text', placeholder: '123456789-abc.apps.googleusercontent.com' },
        { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'GOCSPX-...' },
      ],
      docsUrl: 'https://developers.google.com/webmaster-tools',
      group: 'seo',
      oauth: true,
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
  let oauthNotice = $state<{ ok: boolean; message: string } | null>(null)

  onMount(async () => {
    token = loadStoredToken() ?? ''
    if (!token) { goto('/login'); return }

    // Retour du flow OAuth Google
    const gscStatus = $page.url.searchParams.get('gsc')
    if (gscStatus === 'connected') {
      oauthNotice = { ok: true, message: 'Google Search Console connecté avec succès.' }
      goto('/settings/integrations', { replaceState: true })
    } else if (gscStatus === 'error') {
      const msg = $page.url.searchParams.get('message') ?? 'Erreur lors de la connexion.'
      oauthNotice = { ok: false, message: msg }
      goto('/settings/integrations', { replaceState: true })
    }

    await loadIntegrations()
  })

  function connectGsc() {
    // URL relative — SvelteKit proxie vers l'API (voir /api/oauth/gsc/+server.ts)
    window.location.href = `/api/oauth/gsc?token=${encodeURIComponent(token)}`
  }

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
    <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-2">Intégrations</h1>
    <p class="text-slate-500 text-sm mt-1">Connectez vos outils tiers. Les clés API sont chiffrées et liées à votre organisation.</p>
  </div>

  {#if oauthNotice}
    <div class="mb-6 px-4 py-3 rounded-xl text-sm font-medium {oauthNotice.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}">
      {oauthNotice.message}
    </div>
  {/if}

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
                <h2 class="font-semibold text-slate-800 dark:text-slate-100">{provider.name}</h2>
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
                {#if provider.oauth}
                  {#if existing.oauthConnected}
                    <button
                      onclick={() => testIntegration(existing.id)}
                      disabled={testing === existing.id}
                      class="text-sm px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                      {testing === existing.id ? 'Test…' : 'Tester'}
                    </button>
                    <button
                      onclick={() => connectGsc()}
                      class="text-sm px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
                      Reconnecter
                    </button>
                  {/if}
                  <button
                    onclick={() => startAdding(provider.id)}
                    class="text-sm px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
                    Modifier
                  </button>
                {:else}
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
                {/if}
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

          <!-- Bannière étape 2 pour GSC : credentials sauvegardés mais OAuth pas encore complété -->
          {#if provider.oauth && existing && !existing.oauthConnected && adding !== provider.id}
            <div class="mt-4 pt-4 border-t border-slate-100">
              <div class="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
                <p class="text-sm text-amber-800">Étape 2 — Autorisez l'accès à votre compte Google Search Console.</p>
                <button
                  onclick={() => connectGsc()}
                  class="shrink-0 text-sm px-3 py-1.5 rounded-lg bg-white border border-amber-300 hover:bg-amber-50 text-amber-900 transition-colors flex items-center gap-1.5">
                  <svg class="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  Connecter avec Google
                </button>
              </div>
            </div>
          {/if}

          <!-- Formulaire inline -->
          {#if adding === provider.id}
            <div class="mt-4 pt-4 border-t border-slate-100 space-y-3">
              {#if provider.id === 'gsc'}
                {@const redirectUri = (typeof window !== 'undefined' ? window.location.origin : '') + '/api/oauth/gsc/callback'}
                <div class="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 space-y-2 text-sm">
                  <p class="font-medium text-blue-900">Configuration requise dans Google Cloud Console</p>
                  <ol class="text-blue-800 space-y-1 list-decimal list-inside">
                    <li>Créez un projet sur <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" class="underline">console.cloud.google.com</a></li>
                    <li>Activez l'API <strong>Google Search Console API</strong></li>
                    <li>Créez des identifiants <strong>OAuth 2.0 (Application web)</strong></li>
                    <li>Ajoutez cette URI de redirection autorisée :</li>
                  </ol>
                  <div class="flex items-center gap-2 mt-1">
                    <code class="flex-1 bg-white border border-blue-200 rounded px-2 py-1 text-xs font-mono text-blue-900 break-all">{redirectUri}</code>
                    <button
                      onclick={() => navigator.clipboard.writeText(redirectUri)}
                      class="shrink-0 text-xs px-2 py-1 rounded border border-blue-300 hover:bg-blue-100 text-blue-800 transition-colors">
                      Copier
                    </button>
                  </div>
                  <p class="text-blue-700 text-xs">Connectez-vous avec le compte Google qui a accès à vos propriétés Search Console.</p>
                </div>
              {/if}
              {#each provider.fields as field}
                <div>
                  <label for="integration-{field.key}" class="block text-sm font-medium text-slate-700 mb-1">{field.label}</label>
                  <input
                    id="integration-{field.key}"
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
