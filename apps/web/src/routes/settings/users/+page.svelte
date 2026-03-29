<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { orgApi, authApi, type OrgMember, type User } from '$lib/api.js'
  import { loadStoredToken } from '$lib/stores/auth.svelte.js'
  import { formatDate } from '$lib/utils.js'

  let token = $state('')
  let currentUser = $state<User | null>(null)
  let members = $state<OrgMember[]>([])
  let loading = $state(true)
  let error = $state('')

  // Formulaire d'invitation
  let inviteEmail = $state('')
  let inviteRole = $state('member')
  let inviteFirstName = $state('')
  let inviteLastName = $state('')
  let inviting = $state(false)
  let inviteError = $state('')
  let inviteResult = $state<{ user: OrgMember; tempPassword: string } | null>(null)

  // Suppression
  let removingId = $state<string | null>(null)

  const ROLES = ['owner', 'admin', 'member', 'viewer']
  const ROLE_LABELS: Record<string, string> = { owner: 'Propriétaire', admin: 'Admin', member: 'Membre', viewer: 'Lecteur' }
  const ROLE_COLORS: Record<string, string> = {
    owner: 'bg-purple-100 text-purple-700',
    admin: 'bg-blue-100 text-blue-700',
    member: 'bg-slate-100 text-slate-600',
    viewer: 'bg-slate-100 text-slate-400',
  }

  const canManage = $derived(currentUser?.role === 'owner' || currentUser?.role === 'admin')
  const assignableRoles = $derived(
    currentUser?.role === 'owner' ? ['owner', 'admin', 'member', 'viewer'] : ['member', 'viewer']
  )

  function displayName(m: OrgMember) {
    if (m.firstName || m.lastName) return [m.firstName, m.lastName].filter(Boolean).join(' ')
    return m.email
  }

  onMount(async () => {
    token = loadStoredToken() ?? ''
    if (!token) { goto('/login'); return }
    try {
      const { user } = await authApi.me(token)
      currentUser = user
      members = await orgApi.listUsers(token)
    } catch {
      goto('/login')
    } finally {
      loading = false
    }
  })

  async function invite() {
    inviteError = ''
    inviteResult = null
    if (!inviteEmail.trim()) { inviteError = 'L\'email est requis.'; return }
    inviting = true
    try {
      const result = await orgApi.inviteUser(token, {
        email: inviteEmail.trim(),
        role: inviteRole,
        firstName: inviteFirstName.trim() || undefined,
        lastName: inviteLastName.trim() || undefined,
      })
      inviteResult = result
      members = [...members, result.user]
      inviteEmail = ''
      inviteFirstName = ''
      inviteLastName = ''
      inviteRole = 'member'
    } catch (err: any) {
      inviteError = err.message ?? 'Erreur lors de l\'invitation.'
    } finally {
      inviting = false
    }
  }

  async function changeRole(member: OrgMember, newRole: string) {
    if (newRole === member.role) return
    try {
      const updated = await orgApi.updateRole(token, member.id, newRole)
      members = members.map((m) => m.id === member.id ? updated : m)
    } catch (err: any) {
      error = err.message ?? 'Erreur lors du changement de rôle.'
    }
  }

  async function remove(member: OrgMember) {
    if (!confirm(`Supprimer ${displayName(member)} de l'organisation ?`)) return
    removingId = member.id
    try {
      await orgApi.removeUser(token, member.id)
      members = members.filter((m) => m.id !== member.id)
    } catch (err: any) {
      error = err.message ?? 'Erreur lors de la suppression.'
    } finally {
      removingId = null
    }
  }
</script>

<div class="max-w-3xl mx-auto space-y-8">
  <!-- En-tête -->
  <div>
    <a href="/dashboard" class="text-sm text-slate-500 hover:text-slate-700">← Dashboard</a>
    <h1 class="text-2xl font-bold text-slate-800 mt-1">Membres</h1>
    <p class="text-sm text-slate-500 mt-0.5">Gérez les accès à votre organisation.</p>
  </div>

  {#if error}
    <div class="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
  {/if}

  <!-- Liste des membres -->
  {#if loading}
    <div class="text-slate-500 text-sm">Chargement…</div>
  {:else}
    <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div class="px-5 py-3 border-b border-slate-100">
        <h2 class="font-semibold text-slate-700">{members.length} membre{members.length > 1 ? 's' : ''}</h2>
      </div>
      <div class="divide-y divide-slate-100">
        {#each members as member}
          <div class="px-5 py-3 flex items-center gap-4">
            <!-- Avatar initiales -->
            <div class="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-sm font-semibold text-slate-600 shrink-0">
              {(member.firstName?.[0] ?? member.email[0]).toUpperCase()}
            </div>

            <!-- Infos -->
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-slate-800 truncate">
                {displayName(member)}
                {#if member.id === currentUser?.id}
                  <span class="text-xs text-slate-400 font-normal">(vous)</span>
                {/if}
              </p>
              <p class="text-xs text-slate-400 truncate">{member.email} · depuis {formatDate(member.createdAt)}</p>
            </div>

            <!-- Rôle -->
            {#if canManage && member.id !== currentUser?.id && !(member.role === 'owner' && currentUser?.role !== 'owner')}
              <select
                value={member.role}
                onchange={(e) => changeRole(member, (e.target as HTMLSelectElement).value)}
                class="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                {#each assignableRoles as r}
                  <option value={r}>{ROLE_LABELS[r]}</option>
                {/each}
              </select>
            {:else}
              <span class="text-xs px-2 py-1 rounded-full font-medium {ROLE_COLORS[member.role] ?? 'bg-slate-100 text-slate-500'}">
                {ROLE_LABELS[member.role] ?? member.role}
              </span>
            {/if}

            <!-- Supprimer -->
            {#if canManage && member.id !== currentUser?.id}
              <button
                onclick={() => remove(member)}
                disabled={removingId === member.id}
                class="text-xs text-red-500 hover:text-red-700 disabled:opacity-40 transition-colors shrink-0"
              >
                {removingId === member.id ? '…' : 'Retirer'}
              </button>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Formulaire d'invitation -->
  {#if canManage}
    <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div class="px-5 py-3 border-b border-slate-100">
        <h2 class="font-semibold text-slate-700">Inviter un membre</h2>
      </div>
      <div class="p-5 space-y-4">
        {#if inviteResult}
          <div class="bg-green-50 border border-green-200 rounded-lg p-4">
            <p class="text-sm font-medium text-green-800">
              {displayName(inviteResult.user)} ({inviteResult.user.email}) a été ajouté.
            </p>
            <p class="text-sm text-green-700 mt-1">
              Mot de passe temporaire : <code class="font-mono bg-green-100 px-1.5 py-0.5 rounded">{inviteResult.tempPassword}</code>
            </p>
            <p class="text-xs text-green-600 mt-1">Transmettez ce mot de passe de manière sécurisée. Il ne sera plus affiché.</p>
            <button onclick={() => inviteResult = null} class="text-xs text-green-700 underline mt-2">Fermer</button>
          </div>
        {/if}

        {#if inviteError}
          <p class="text-sm text-red-600">{inviteError}</p>
        {/if}

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="invite-firstname" class="block text-xs font-medium text-slate-600 mb-1">Prénom</label>
            <input id="invite-firstname" bind:value={inviteFirstName} type="text" placeholder="Jean"
              class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400" />
          </div>
          <div>
            <label for="invite-lastname" class="block text-xs font-medium text-slate-600 mb-1">Nom</label>
            <input id="invite-lastname" bind:value={inviteLastName} type="text" placeholder="Dupont"
              class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400" />
          </div>
        </div>

        <div>
          <label for="invite-email" class="block text-xs font-medium text-slate-600 mb-1">Email <span class="text-red-500">*</span></label>
          <input id="invite-email" bind:value={inviteEmail} type="email" placeholder="jean@exemple.fr"
            class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400" />
        </div>

        <div>
          <label for="invite-role" class="block text-xs font-medium text-slate-600 mb-1">Rôle</label>
          <select id="invite-role" bind:value={inviteRole}
            class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-slate-400">
            {#each assignableRoles as r}
              <option value={r}>{ROLE_LABELS[r]}</option>
            {/each}
          </select>
          <p class="text-xs text-slate-400 mt-1">
            {#if inviteRole === 'viewer'}Accès lecture seule — peut consulter les audits mais pas en lancer.
            {:else if inviteRole === 'member'}Peut lancer des audits et configurer les monitors.
            {:else if inviteRole === 'admin'}Peut gérer les membres (sauf owners) et toutes les configurations.
            {:else if inviteRole === 'owner'}Accès complet, incluant la suppression de l'organisation.
            {/if}
          </p>
        </div>

        <button onclick={invite} disabled={inviting || !inviteEmail.trim()}
          class="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-60 transition-colors">
          {inviting ? 'Ajout en cours…' : 'Ajouter le membre'}
        </button>
      </div>
    </div>
  {/if}
</div>
