<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { loadStoredToken } from '$lib/stores/auth.svelte.js'

  const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

  interface Webhook {
    id: string
    name: string
    url: string
    events: string[]
    siteId: string | null
    secret: string | null
    enabled: boolean
    lastTriggeredAt: string | null
    lastStatus: number | null
    createdAt: string
  }

  let token = ''
  let webhooks = $state<Webhook[]>([])
  let loading = $state(true)
  let saving = $state(false)
  let testing = $state<string | null>(null)
  let error = $state('')
  let showForm = $state(false)

  let formName = $state('')
  let formUrl = $state('')
  let formEvents = $state<string[]>(['audit.completed'])
  let formSecret = $state(true)

  const ALL_EVENTS = [
    { id: 'audit.completed', label: 'Audit terminé', desc: 'Déclenché à chaque fin d\'audit' },
    { id: 'score.degraded', label: 'Score en baisse', desc: 'Déclenché si le score global chute au-delà du seuil Monitor' },
  ]

  async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers ?? {}) },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(body.error ?? 'Erreur')
    }
    return res.json()
  }

  onMount(async () => {
    token = loadStoredToken() ?? ''
    if (!token) { goto('/login'); return }
    await load()
  })

  async function load() {
    loading = true
    try { webhooks = await api('/api/webhooks') }
    catch { goto('/login') }
    finally { loading = false }
  }

  async function submit() {
    if (!formName.trim() || !formUrl.trim() || formEvents.length === 0) return
    saving = true
    error = ''
    try {
      await api('/api/webhooks', {
        method: 'POST',
        body: JSON.stringify({ name: formName, url: formUrl, events: formEvents, generateSecret: formSecret }),
      })
      showForm = false
      formName = ''; formUrl = ''; formEvents = ['audit.completed']; formSecret = true
      await load()
    } catch (err: any) {
      error = err.message
    } finally {
      saving = false
    }
  }

  async function toggle(wh: Webhook) {
    try {
      await api(`/api/webhooks/${wh.id}`, { method: 'PUT', body: JSON.stringify({ enabled: !wh.enabled }) })
      await load()
    } catch {}
  }

  async function remove(id: string) {
    if (!confirm('Supprimer ce webhook ?')) return
    try { await api(`/api/webhooks/${id}`, { method: 'DELETE' }); await load() } catch {}
  }

  async function test(id: string) {
    testing = id
    try {
      await api(`/api/webhooks/${id}/test`, { method: 'POST' })
      alert('Payload de test envoyé !')
    } catch (err: any) {
      alert('Erreur : ' + err.message)
    } finally {
      testing = null
      await load()
    }
  }

  function toggleEvent(id: string) {
    if (formEvents.includes(id)) formEvents = formEvents.filter((e) => e !== id)
    else formEvents = [...formEvents, id]
  }

  function statusBadge(status: number | null) {
    if (!status) return { text: '—', cls: 'text-slate-400 dark:text-slate-600' }
    if (status >= 200 && status < 300) return { text: status.toString(), cls: 'text-green-600' }
    return { text: status.toString(), cls: 'text-red-500' }
  }

  function formatDate(iso: string | null) {
    if (!iso) return '—'
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  }
</script>

<div class="flex items-center justify-between mb-8">
  <div>
    <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100">Webhooks</h1>
    <p class="text-sm text-slate-500 mt-0.5">Notifiez vos outils (Slack, n8n, Zapier…) à chaque événement d'audit.</p>
  </div>
  <button
    onclick={() => showForm = !showForm}
    class="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
  >
    + Ajouter un webhook
  </button>
</div>

{#if showForm}
  <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 mb-6">
    <h2 class="font-semibold text-slate-700 dark:text-slate-300 mb-4">Nouveau webhook</h2>
    <div class="grid grid-cols-2 gap-4 mb-4">
      <div>
        <label for="webhook-name" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nom</label>
        <input id="webhook-name" bind:value={formName} placeholder="Slack audit alerts" class="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-slate-800 dark:text-slate-100" />
      </div>
      <div>
        <label for="webhook-url" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">URL de destination</label>
        <input id="webhook-url" bind:value={formUrl} placeholder="https://hooks.slack.com/…" type="url" class="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-slate-800 dark:text-slate-100" />
      </div>
    </div>

    <div class="mb-4">
      <p class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Événements</p>
      <div class="flex gap-4">
        {#each ALL_EVENTS as ev}
          <label class="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={formEvents.includes(ev.id)} onchange={() => toggleEvent(ev.id)} class="mt-0.5" />
            <div>
              <span class="text-sm font-medium text-slate-700 dark:text-slate-300">{ev.label}</span>
              <p class="text-xs text-slate-400 dark:text-slate-600">{ev.desc}</p>
            </div>
          </label>
        {/each}
      </div>
    </div>

    <label class="flex items-center gap-2 cursor-pointer mb-4">
      <input type="checkbox" bind:checked={formSecret} />
      <span class="text-sm text-slate-700 dark:text-slate-300">Générer un secret (signature HMAC-SHA256 dans <code class="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">X-Aarfang-Signature</code>)</span>
    </label>

    {#if error}
      <p class="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 mb-4">{error}</p>
    {/if}

    <div class="flex gap-3">
      <button onclick={submit} disabled={saving || !formName || !formUrl || formEvents.length === 0}
        class="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors">
        {saving ? 'Création…' : 'Créer le webhook'}
      </button>
      <button onclick={() => showForm = false} class="px-4 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
        Annuler
      </button>
    </div>
  </div>
{/if}

{#if loading}
  <div class="text-slate-400 text-sm">Chargement…</div>
{:else if webhooks.length === 0}
  <div class="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-400 dark:text-slate-600">
    <p class="text-sm">Aucun webhook configuré.</p>
    <p class="text-xs mt-1">Ajoutez un webhook pour notifier Slack, n8n ou Zapier après chaque audit.</p>
  </div>
{:else}
  <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
    <table class="w-full text-sm">
      <thead class="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
        <tr>
          <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Nom</th>
          <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">URL</th>
          <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Événements</th>
          <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Dernier appel</th>
          <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Statut</th>
          <th class="px-5 py-3"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
        {#each webhooks as wh}
          {@const badge = statusBadge(wh.lastStatus)}
          <tr class="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors {wh.enabled ? '' : 'opacity-50'}">
            <td class="px-5 py-3 font-medium text-slate-800 dark:text-slate-100">
              {wh.name}
              {#if wh.secret}<span class="ml-1 text-xs text-amber-500" title="Signé HMAC">🔐</span>{/if}
            </td>
            <td class="px-5 py-3 text-slate-500 font-mono text-xs max-w-xs truncate">{wh.url}</td>
            <td class="px-5 py-3">
              <div class="flex flex-wrap gap-1">
                {#each wh.events as ev}
                  <span class="text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full">{ev}</span>
                {/each}
              </div>
            </td>
            <td class="px-5 py-3 text-slate-400 dark:text-slate-600 text-xs">{formatDate(wh.lastTriggeredAt)}</td>
            <td class="px-5 py-3 font-mono text-xs font-bold {badge.cls}">{badge.text}</td>
            <td class="px-5 py-3">
              <div class="flex items-center gap-2 justify-end">
                <button onclick={() => test(wh.id)} disabled={testing === wh.id}
                  class="text-xs px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors">
                  {testing === wh.id ? '…' : 'Tester'}
                </button>
                <button onclick={() => toggle(wh)}
                  class="text-xs px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  {wh.enabled ? 'Désactiver' : 'Activer'}
                </button>
                <button onclick={() => remove(wh.id)}
                  class="text-xs px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-900 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                  Supprimer
                </button>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Doc format payload -->
  <div class="mt-6 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
    <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Format des payloads</h3>
    <pre class="text-xs text-slate-600 dark:text-slate-300 overflow-x-auto bg-transparent dark:bg-slate-950 rounded-lg p-3">{`// audit.completed
{
  "event": "audit.completed",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "data": {
    "site": { "id": "...", "name": "Mon site", "url": "https://example.com" },
    "auditId": "...",
    "scores": { "global": 72, "securite": 85, "technique": 70, ... },
    "reportUrl": "https://app.aarfang.com/sites/..."
  }
}

// score.degraded
{
  "event": "score.degraded",
  "timestamp": "...",
  "data": {
    "site": { ... },
    "previousScore": 80,
    "newScore": 65,
    "drop": 15,
    "scores": { ... }
  }
}`}</pre>
    <p class="text-xs text-slate-400 dark:text-slate-600 mt-3">Signature : header <code class="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 px-1 rounded">X-Aarfang-Signature: sha256=&lt;hmac&gt;</code> — vérifier avec votre secret pour valider l'authenticité.</p>
  </div>
{/if}
