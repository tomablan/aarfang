<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { superadminApi, type SuperAdminOrg, type SuperAdminUser } from '$lib/api.js'
  import { auth, loadStoredToken } from '$lib/stores/auth.svelte.js'
  import { formatDate } from '$lib/utils.js'

  let tab = $state<'orgs' | 'users'>('orgs')
  let orgs = $state<SuperAdminOrg[]>([])
  let users = $state<SuperAdminUser[]>([])
  let loading = $state(true)
  let token = $state('')

  // Invite org
  let showInvite = $state(false)
  let inviteOrgName = $state('')
  let inviteEmail = $state('')
  let inviteFirstName = $state('')
  let inviteLastName = $state('')
  let invitePlan = $state('free')
  let inviting = $state(false)
  let inviteResult = $state<{ orgName: string; email: string; tempPassword: string } | null>(null)
  let inviteError = $state('')

  // Confirm delete
  let deletingOrgId = $state<string | null>(null)

  onMount(async () => {
    token = loadStoredToken() ?? ''
    if (!token) { goto('/login'); return }
    if (auth.user?.role !== 'super_admin') { goto('/dashboard'); return }
    await loadAll()
  })

  async function loadAll() {
    loading = true
    try {
      const [o, u] = await Promise.all([
        superadminApi.listOrgs(token),
        superadminApi.listUsers(token),
      ])
      orgs = o
      users = u
    } catch {
      goto('/login')
    } finally {
      loading = false
    }
  }

  async function inviteOrg() {
    if (!inviteOrgName || !inviteEmail) return
    inviting = true
    inviteError = ''
    inviteResult = null
    try {
      const res = await superadminApi.inviteOrg(token, {
        orgName: inviteOrgName,
        ownerEmail: inviteEmail,
        ownerFirstName: inviteFirstName || undefined,
        ownerLastName: inviteLastName || undefined,
        plan: invitePlan,
      })
      inviteResult = { orgName: res.org.name, email: res.owner.email, tempPassword: res.tempPassword }
      inviteOrgName = ''; inviteEmail = ''; inviteFirstName = ''; inviteLastName = ''; invitePlan = 'free'
      await loadAll()
    } catch (err: any) {
      inviteError = err.message ?? 'Erreur'
    } finally {
      inviting = false
    }
  }

  async function deleteOrg(orgId: string) {
    try {
      await superadminApi.deleteOrg(token, orgId)
      orgs = orgs.filter(o => o.id !== orgId)
      users = users.filter(u => u.orgId !== orgId)
    } catch (err: any) {
      alert(err.message)
    } finally {
      deletingOrgId = null
    }
  }

  const PLAN_LABELS: Record<string, string> = { free: 'Free', pro: 'Pro', agency: 'Agency' }
  const ROLE_LABELS: Record<string, string> = {
    super_admin: 'Super Admin', owner: 'Owner', admin: 'Admin', member: 'Membre', viewer: 'Viewer',
  }

  let userSearch = $state('')
  const filteredUsers = $derived(userSearch
    ? users.filter(u =>
        u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.orgName.toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.firstName ?? '').toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.lastName ?? '').toLowerCase().includes(userSearch.toLowerCase())
      )
    : users
  )
</script>

<div class="flex items-center justify-between mb-6">
  <div>
    <p class="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-0.5">Super Admin</p>
    <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100">Administration</h1>
  </div>
  <button
    onclick={() => { showInvite = !showInvite; inviteResult = null; inviteError = '' }}
    class="bg-slate-800 dark:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
  >
    + Inviter une organisation
  </button>
</div>

<!-- Formulaire invitation org -->
{#if showInvite}
  <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 mb-6 space-y-4">
    <h2 class="font-semibold text-slate-800 dark:text-slate-100">Nouvelle organisation</h2>

    {#if inviteResult}
      <div class="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl p-4 space-y-2">
        <p class="text-sm font-semibold text-green-800 dark:text-green-300">Organisation créée !</p>
        <p class="text-sm text-green-700 dark:text-green-400">Org : <strong>{inviteResult.orgName}</strong></p>
        <p class="text-sm text-green-700 dark:text-green-400">Email : <strong>{inviteResult.email}</strong></p>
        <div class="flex items-center gap-2 mt-1">
          <p class="text-sm text-green-700 dark:text-green-400">Mot de passe temporaire :</p>
          <code class="bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 px-2 py-0.5 rounded font-mono text-sm">{inviteResult.tempPassword}</code>
        </div>
        <p class="text-xs text-green-600 dark:text-green-500">Transmettez ce mot de passe à l'utilisateur — il ne sera plus affiché.</p>
      </div>
    {/if}

    <div class="grid grid-cols-2 gap-4">
      <div class="col-span-2">
        <label for="org-name" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nom de l'organisation <span class="text-red-500">*</span></label>
        <input id="org-name" bind:value={inviteOrgName} type="text" placeholder="Agence Dupont"
          class="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-slate-800 dark:text-slate-100" />
      </div>
      <div>
        <label for="owner-firstname" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Prénom</label>
        <input id="owner-firstname" bind:value={inviteFirstName} type="text" placeholder="Jean"
          class="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-slate-800 dark:text-slate-100" />
      </div>
      <div>
        <label for="owner-lastname" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nom</label>
        <input id="owner-lastname" bind:value={inviteLastName} type="text" placeholder="Dupont"
          class="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-slate-800 dark:text-slate-100" />
      </div>
      <div class="col-span-2 sm:col-span-1">
        <label for="owner-email" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email owner <span class="text-red-500">*</span></label>
        <input id="owner-email" bind:value={inviteEmail} type="email" placeholder="jean@agence.fr"
          class="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-slate-800 dark:text-slate-100" />
      </div>
      <div>
        <label for="org-plan" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Plan</label>
        <select id="org-plan" bind:value={invitePlan}
          class="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-slate-800 dark:text-slate-100">
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="agency">Agency</option>
        </select>
      </div>
    </div>

    {#if inviteError}
      <p class="text-sm text-red-600 dark:text-red-400">{inviteError}</p>
    {/if}

    <div class="flex gap-3 pt-1">
      <button onclick={inviteOrg} disabled={inviting || !inviteOrgName || !inviteEmail}
        class="bg-slate-800 dark:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors">
        {inviting ? 'Création…' : 'Créer l\'organisation'}
      </button>
      <button onclick={() => showInvite = false}
        class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
        Fermer
      </button>
    </div>
  </div>
{/if}

<!-- Onglets -->
<div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit mb-6">
  {#each ([['orgs', 'Organisations'], ['users', 'Utilisateurs']] as const) as [key, label]}
    <button
      onclick={() => tab = key}
      class="px-4 py-1.5 rounded-md text-sm font-medium transition-colors {tab === key ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}"
    >
      {label}
      <span class="ml-1.5 text-xs text-slate-400 dark:text-slate-500">{key === 'orgs' ? orgs.length : users.length}</span>
    </button>
  {/each}
</div>

{#if loading}
  <p class="text-slate-400 dark:text-slate-500 text-sm">Chargement…</p>

<!-- Onglet Organisations -->
{:else if tab === 'orgs'}
  <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-100 dark:border-slate-800">
          <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Organisation</th>
          <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 hidden sm:table-cell">Plan</th>
          <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 hidden md:table-cell">Utilisateurs</th>
          <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 hidden md:table-cell">Sites</th>
          <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 hidden lg:table-cell">Créé le</th>
          <th class="px-5 py-3 w-10"></th>
        </tr>
      </thead>
      <tbody>
        {#each orgs as org}
          <tr class="border-b border-slate-50 dark:border-slate-800/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30">
            <td class="px-5 py-3">
              <p class="font-medium text-slate-800 dark:text-slate-100">{org.name}</p>
              <p class="text-xs text-slate-400 dark:text-slate-500">{org.slug}</p>
            </td>
            <td class="px-5 py-3 hidden sm:table-cell">
              <span class="text-xs px-2 py-0.5 rounded-full font-medium {org.plan === 'agency' ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400' : org.plan === 'pro' ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}">
                {PLAN_LABELS[org.plan] ?? org.plan}
              </span>
            </td>
            <td class="px-5 py-3 text-slate-600 dark:text-slate-300 hidden md:table-cell">{org.userCount}</td>
            <td class="px-5 py-3 text-slate-600 dark:text-slate-300 hidden md:table-cell">{org.siteCount}</td>
            <td class="px-5 py-3 text-slate-400 dark:text-slate-500 text-xs hidden lg:table-cell">{formatDate(org.createdAt)}</td>
            <td class="px-5 py-3 text-right">
              {#if deletingOrgId === org.id}
                <div class="flex items-center gap-2 justify-end">
                  <span class="text-xs text-red-600 dark:text-red-400">Confirmer ?</span>
                  <button onclick={() => deleteOrg(org.id)} class="text-xs text-red-600 dark:text-red-400 font-medium hover:underline">Oui</button>
                  <button onclick={() => deletingOrgId = null} class="text-xs text-slate-500 hover:underline">Non</button>
                </div>
              {:else}
                <button onclick={() => deletingOrgId = org.id}
                  class="text-slate-300 dark:text-slate-700 hover:text-red-400 dark:hover:text-red-500 transition-colors" title="Supprimer">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>
                  </svg>
                </button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

<!-- Onglet Utilisateurs -->
{:else}
  <div class="mb-4">
    <input bind:value={userSearch} type="search" placeholder="Rechercher par email, nom, organisation…"
      class="w-full max-w-sm border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-slate-800 dark:text-slate-100" />
  </div>

  <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-100 dark:border-slate-800">
          <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Utilisateur</th>
          <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 hidden sm:table-cell">Organisation</th>
          <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Rôle</th>
          <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 hidden lg:table-cell">Créé le</th>
        </tr>
      </thead>
      <tbody>
        {#each filteredUsers as user}
          <tr class="border-b border-slate-50 dark:border-slate-800/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30">
            <td class="px-5 py-3">
              <p class="font-medium text-slate-800 dark:text-slate-100">
                {[user.firstName, user.lastName].filter(Boolean).join(' ') || '—'}
              </p>
              <p class="text-xs text-slate-400 dark:text-slate-500">{user.email}</p>
            </td>
            <td class="px-5 py-3 hidden sm:table-cell">
              <p class="text-slate-700 dark:text-slate-300">{user.orgName}</p>
              <span class="text-xs text-slate-400 dark:text-slate-500">{PLAN_LABELS[user.orgPlan] ?? user.orgPlan}</span>
            </td>
            <td class="px-5 py-3">
              <span class="text-xs px-2 py-0.5 rounded-full font-medium {user.role === 'super_admin' ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300' : user.role === 'owner' ? 'bg-slate-800 dark:bg-slate-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}">
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
            </td>
            <td class="px-5 py-3 text-slate-400 dark:text-slate-500 text-xs hidden lg:table-cell">{formatDate(user.createdAt)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
