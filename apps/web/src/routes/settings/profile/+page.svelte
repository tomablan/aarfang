<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { authApi } from '$lib/api.js'
  import { auth, loadStoredToken } from '$lib/stores/auth.svelte.js'

  let token = $state('')
  let currentPassword = $state('')
  let newPassword = $state('')
  let confirmPassword = $state('')
  let loading = $state(false)
  let success = $state(false)
  let error = $state('')

  onMount(() => {
    token = loadStoredToken() ?? ''
    if (!token) goto('/login')
  })

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    error = ''
    success = false

    if (newPassword !== confirmPassword) {
      error = 'Les mots de passe ne correspondent pas'
      return
    }
    if (newPassword.length < 8) {
      error = 'Le nouveau mot de passe doit contenir au moins 8 caractères'
      return
    }

    loading = true
    try {
      await authApi.changePassword(token, currentPassword, newPassword)
      success = true
      currentPassword = ''
      newPassword = ''
      confirmPassword = ''
    } catch (err: any) {
      error = err.message ?? 'Erreur lors du changement de mot de passe'
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>Mon profil — aarfang</title>
</svelte:head>

<div class="max-w-lg">
  <div class="mb-6">
    <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100">Mon profil</h1>
    {#if auth.user}
      <p class="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{auth.user.email}</p>
    {/if}
  </div>

  <!-- Infos compte -->
  {#if auth.user}
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 mb-6">
      <h2 class="font-semibold text-slate-700 dark:text-slate-300 mb-3">Informations</h2>
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-slate-500 dark:text-slate-400">Email</span>
          <span class="font-medium text-slate-800 dark:text-slate-100">{auth.user.email}</span>
        </div>
        {#if auth.user.firstName || auth.user.lastName}
          <div class="flex justify-between">
            <span class="text-slate-500 dark:text-slate-400">Nom</span>
            <span class="font-medium text-slate-800 dark:text-slate-100">
              {[auth.user.firstName, auth.user.lastName].filter(Boolean).join(' ')}
            </span>
          </div>
        {/if}
        <div class="flex justify-between">
          <span class="text-slate-500 dark:text-slate-400">Rôle</span>
          <span class="font-medium text-slate-800 dark:text-slate-100">{auth.user.role}</span>
        </div>
        {#if auth.org}
          <div class="flex justify-between">
            <span class="text-slate-500 dark:text-slate-400">Organisation</span>
            <span class="font-medium text-slate-800 dark:text-slate-100">{auth.org.name}</span>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Changer le mot de passe -->
  <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
    <h2 class="font-semibold text-slate-700 dark:text-slate-300 mb-4">Changer le mot de passe</h2>

    {#if success}
      <div class="mb-4 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-400">
        Mot de passe modifié avec succès.
      </div>
    {/if}

    <form onsubmit={handleSubmit} class="space-y-4">
      <div>
        <label for="current-password" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Mot de passe actuel
        </label>
        <input
          id="current-password"
          type="password"
          bind:value={currentPassword}
          required
          autocomplete="current-password"
          class="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      </div>
      <div>
        <label for="new-password" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Nouveau mot de passe <span class="text-slate-400 dark:text-slate-500 font-normal">(8 caractères min.)</span>
        </label>
        <input
          id="new-password"
          type="password"
          bind:value={newPassword}
          required
          minlength="8"
          autocomplete="new-password"
          class="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      </div>
      <div>
        <label for="confirm-password" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Confirmer le nouveau mot de passe
        </label>
        <input
          id="confirm-password"
          type="password"
          bind:value={confirmPassword}
          required
          autocomplete="new-password"
          class="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      </div>

      {#if error}
        <p class="text-sm text-red-600 dark:text-red-400">{error}</p>
      {/if}

      <button
        type="submit"
        disabled={loading}
        class="bg-slate-800 dark:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Enregistrement…' : 'Changer le mot de passe'}
      </button>
    </form>
  </div>
</div>
