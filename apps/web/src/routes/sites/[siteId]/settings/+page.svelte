<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { sitesApi, siteMembersApi, orgApi, authApi, type SiteMember, type OrgMember } from '$lib/api.js'
  import { loadStoredToken } from '$lib/stores/auth.svelte.js'
  import { formatDate } from '$lib/utils.js'

  const siteId = $derived($page.params.siteId)
  const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

  let token = $state('')
  let siteName = $state('')
  let monitor = $state({
    enabled: false,
    interval: 'weekly' as 'daily' | 'weekly' | 'monthly',
    alertOnDegradation: true,
    degradationThreshold: 5,
    alertEmail: '',
    alertWebhookUrl: '',
    nextRunAt: null as string | null,
    lastRunAt: null as string | null,
  })
  let saving = $state(false)
  let saved = $state(false)
  let loading = $state(true)

  // Accès membres
  let currentUserRole = $state('')
  let siteMembers = $state<SiteMember[]>([])
  let orgMembers = $state<OrgMember[]>([]) // pour le select d'invitation
  let addingUserId = $state('')
  let addingAccess = $state(false)
  let accessError = $state('')

  const canManageAccess = $derived(currentUserRole === 'owner' || currentUserRole === 'admin')
  // Membres non-privilégiés pas encore dans la liste
  const eligibleToAdd = $derived(
    orgMembers.filter((m) =>
      (m.role === 'member' || m.role === 'viewer') &&
      !siteMembers.some((sm) => sm.id === m.id)
    )
  )

  function memberDisplayName(m: OrgMember | SiteMember) {
    if (m.firstName || m.lastName) return [m.firstName, m.lastName].filter(Boolean).join(' ')
    return m.email
  }

  // Suppression
  let deleteConfirm = $state('')
  let deleting = $state(false)
  let deleteError = $state('')

  onMount(async () => {
    token = loadStoredToken() ?? ''
    if (!token) { goto('/login'); return }

    const [site, mon, { user }, members, orgMembersList] = await Promise.all([
      sitesApi.get(token, siteId),
      fetch(`${API_URL}/api/sites/${siteId}/monitor`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json()),
      authApi.me(token),
      siteMembersApi.list(token, siteId).catch(() => [] as SiteMember[]),
      orgApi.listUsers(token).catch(() => [] as OrgMember[]),
    ])

    currentUserRole = user.role
    siteMembers = members
    orgMembers = orgMembersList
    siteName = site.name
    if (mon) {
      monitor = {
        enabled: mon.enabled,
        interval: mon.interval,
        alertOnDegradation: mon.alertOnDegradation,
        degradationThreshold: mon.degradationThreshold,
        alertEmail: mon.alertEmail ?? '',
        alertWebhookUrl: mon.alertWebhookUrl ?? '',
        nextRunAt: mon.nextRunAt,
        lastRunAt: mon.lastRunAt,
      }
    }
    loading = false
  })

  async function saveMonitor() {
    saving = true
    saved = false
    await fetch(`${API_URL}/api/sites/${siteId}/monitor`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        ...monitor,
        alertEmail: monitor.alertEmail.trim() || null,
        alertWebhookUrl: monitor.alertWebhookUrl.trim() || null,
      }),
    })
    saving = false
    saved = true
    setTimeout(() => { saved = false }, 3000)
  }

  async function grantAccess() {
    if (!addingUserId) return
    addingAccess = true
    accessError = ''
    try {
      await siteMembersApi.add(token, siteId, addingUserId)
      siteMembers = await siteMembersApi.list(token, siteId)
      addingUserId = ''
    } catch (err: any) {
      accessError = err.message ?? 'Erreur'
    } finally {
      addingAccess = false
    }
  }

  async function revokeAccess(userId: string) {
    try {
      await siteMembersApi.remove(token, siteId, userId)
      siteMembers = siteMembers.filter((m) => m.id !== userId)
    } catch (err: any) {
      accessError = err.message ?? 'Erreur'
    }
  }

  async function deleteSite() {
    if (deleteConfirm !== siteName) return
    deleting = true
    deleteError = ''
    try {
      await sitesApi.delete(token, siteId)
      goto('/dashboard')
    } catch (err: any) {
      deleteError = err.message ?? 'Erreur lors de la suppression'
      deleting = false
    }
  }
</script>

{#if loading}
  <p class="text-slate-500 text-sm">Chargement…</p>
{:else}
  <div class="max-w-lg space-y-6">
    <div>
      <a href="/sites/{siteId}" class="text-sm text-slate-500 hover:text-slate-700">← {siteName}</a>
      <h1 class="text-2xl font-bold text-slate-800 mt-1">Paramètres du site</h1>
    </div>

    <!-- ─── Surveillance ────────────────────────────────────────────── -->
    <div class="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
      <h2 class="font-semibold text-slate-700">Surveillance automatique</h2>

      <label class="flex items-center justify-between cursor-pointer">
        <div>
          <p class="text-sm font-medium text-slate-700">Activer la surveillance</p>
          <p class="text-xs text-slate-500">Déclenche un audit automatiquement selon la fréquence choisie</p>
        </div>
        <button
          onclick={() => monitor.enabled = !monitor.enabled}
          class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors {monitor.enabled ? 'bg-slate-800' : 'bg-slate-300'}">
          <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {monitor.enabled ? 'translate-x-6' : 'translate-x-1'}"></span>
        </button>
      </label>

      <div class:opacity-40={!monitor.enabled}>
        <label class="block text-sm font-medium text-slate-700 mb-2">Fréquence</label>
        <div class="flex gap-2">
          {#each [['daily', 'Quotidien'], ['weekly', 'Hebdomadaire'], ['monthly', 'Mensuel']] as [val, label]}
            <button
              onclick={() => monitor.interval = val as 'daily' | 'weekly' | 'monthly'}
              disabled={!monitor.enabled}
              class="flex-1 py-2 text-sm rounded-lg border transition-colors {monitor.interval === val ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-300 text-slate-600 hover:border-slate-400'}">
              {label}
            </button>
          {/each}
        </div>
      </div>

      {#if monitor.enabled && monitor.nextRunAt}
        <div class="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 space-y-1">
          <p>Prochain audit : <span class="font-medium text-slate-700">{formatDate(monitor.nextRunAt)}</span></p>
          {#if monitor.lastRunAt}
            <p>Dernier audit automatique : {formatDate(monitor.lastRunAt)}</p>
          {/if}
        </div>
      {/if}
    </div>

    <!-- ─── Alertes ─────────────────────────────────────────────────── -->
    <div class="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
      <h2 class="font-semibold text-slate-700">Alertes de dégradation</h2>

      <label class="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" bind:checked={monitor.alertOnDegradation} class="mt-0.5 w-4 h-4 rounded border-slate-300" />
        <div>
          <p class="text-sm font-medium text-slate-700">Envoyer une alerte si le score baisse</p>
          <p class="text-xs text-slate-500">Déclenché après chaque audit (manuel ou automatique)</p>
        </div>
      </label>

      {#if monitor.alertOnDegradation}
        <div class:opacity-40={!monitor.alertOnDegradation} class="space-y-4">
          <div class="flex items-center gap-3">
            <label class="text-sm text-slate-600 whitespace-nowrap">Seuil de dégradation :</label>
            <input type="number" min="1" max="50" bind:value={monitor.degradationThreshold}
              class="w-16 border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-400" />
            <span class="text-sm text-slate-500">points de baisse</span>
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1" for="alertEmail">
              Email de notification
            </label>
            <input
              id="alertEmail"
              type="email"
              placeholder="vous@exemple.com"
              bind:value={monitor.alertEmail}
              class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <p class="text-xs text-slate-400 mt-1">Laissez vide pour ne pas recevoir d'email. Nécessite la config SMTP dans <code class="bg-slate-100 px-1 rounded">.env</code>.</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1" for="alertWebhook">
              Webhook URL
            </label>
            <input
              id="alertWebhook"
              type="url"
              placeholder="https://hooks.slack.com/... ou https://..."
              bind:value={monitor.alertWebhookUrl}
              class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <p class="text-xs text-slate-400 mt-1">POST JSON sur cette URL à chaque alerte. Compatible Slack, Discord, Make, Zapier, n8n…</p>
          </div>
        </div>
      {/if}

      <div class="flex items-center gap-3 pt-1">
        <button onclick={saveMonitor} disabled={saving}
          class="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors">
          {saving ? 'Sauvegarde…' : 'Enregistrer'}
        </button>
        {#if saved}
          <span class="text-sm text-green-600">✓ Sauvegardé</span>
        {/if}
      </div>
    </div>

    <!-- ─── Accès membres ───────────────────────────────────────────── -->
    {#if canManageAccess}
      <div class="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <h2 class="font-semibold text-slate-700">Accès au site</h2>
          <p class="text-xs text-slate-500 mt-0.5">Les propriétaires et admins ont accès à tous les sites. Assignez ici les membres et lecteurs.</p>
        </div>

        {#if accessError}
          <p class="text-sm text-red-600">{accessError}</p>
        {/if}

        <!-- Membres ayant accès -->
        {#if siteMembers.length > 0}
          <div class="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
            {#each siteMembers as member}
              <div class="flex items-center gap-3 px-4 py-2.5">
                <div class="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600 shrink-0">
                  {(member.firstName?.[0] ?? member.email[0]).toUpperCase()}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-slate-700 truncate">{memberDisplayName(member)}</p>
                  <p class="text-xs text-slate-400 truncate">{member.email}</p>
                </div>
                <span class="text-xs text-slate-400 shrink-0">{member.role}</span>
                <button onclick={() => revokeAccess(member.id)}
                  class="text-xs text-red-500 hover:text-red-700 shrink-0 transition-colors">
                  Retirer
                </button>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-xs text-slate-400 italic">Aucun membre (hors admins/owners) n'a accès à ce site.</p>
        {/if}

        <!-- Ajouter un membre -->
        {#if eligibleToAdd.length > 0}
          <div class="flex gap-2">
            <select bind:value={addingUserId}
              class="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-slate-400">
              <option value="">— Choisir un membre —</option>
              {#each eligibleToAdd as m}
                <option value={m.id}>{memberDisplayName(m)} ({m.email}) · {m.role}</option>
              {/each}
            </select>
            <button onclick={grantAccess} disabled={!addingUserId || addingAccess}
              class="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors shrink-0">
              {addingAccess ? '…' : 'Donner accès'}
            </button>
          </div>
        {:else if orgMembers.filter((m) => m.role === 'member' || m.role === 'viewer').length === 0}
          <p class="text-xs text-slate-400">Aucun membre ou lecteur dans l'organisation pour l'instant.</p>
        {:else}
          <p class="text-xs text-slate-400">Tous les membres et lecteurs ont déjà accès à ce site.</p>
        {/if}
      </div>
    {/if}

    <!-- ─── Zone danger : suppression ──────────────────────────────── -->
    <div class="bg-white border border-red-200 rounded-xl p-6 space-y-4">
      <h2 class="font-semibold text-red-700">Zone de danger</h2>
      <p class="text-sm text-slate-600">
        Supprimer ce site effacera <strong>tous ses audits et résultats</strong> de façon irréversible.
      </p>

      <div>
        <label class="block text-sm text-slate-600 mb-1">
          Tapez <span class="font-mono font-bold text-slate-800">{siteName}</span> pour confirmer
        </label>
        <input
          type="text"
          bind:value={deleteConfirm}
          placeholder={siteName}
          class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
        />
      </div>

      {#if deleteError}
        <p class="text-sm text-red-600">{deleteError}</p>
      {/if}

      <button
        onclick={deleteSite}
        disabled={deleteConfirm !== siteName || deleting}
        class="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 transition-colors">
        {deleting ? 'Suppression…' : 'Supprimer définitivement ce site'}
      </button>
    </div>
  </div>
{/if}
