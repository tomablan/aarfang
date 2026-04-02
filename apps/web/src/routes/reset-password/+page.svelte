<script lang="ts">
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { authApi } from '$lib/api.js'

  const token = $derived($page.url.searchParams.get('token') ?? '')

  let newPassword = $state('')
  let confirm = $state('')
  let loading = $state(false)
  let error = $state('')
  let done = $state(false)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (newPassword !== confirm) { error = 'Les mots de passe ne correspondent pas'; return }
    if (newPassword.length < 8) { error = 'Minimum 8 caractères'; return }
    loading = true
    error = ''
    try {
      await authApi.resetPassword(token, newPassword)
      done = true
      setTimeout(() => goto('/login'), 2500)
    } catch (err: any) {
      error = err.message ?? 'Lien invalide ou expiré'
    } finally {
      loading = false
    }
  }
</script>

<div class="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
  <div class="h-0.5 fixed top-0 left-0 right-0 bg-gradient-to-r from-slate-800 via-slate-600 to-slate-800 dark:from-slate-300 dark:via-white dark:to-slate-300"></div>

  <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-8 w-full max-w-sm">
    <h1 class="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">Nouveau mot de passe</h1>
    <p class="text-sm text-slate-500 dark:text-slate-400 mb-6">Choisissez un mot de passe d'au moins 8 caractères.</p>

    {#if !token}
      <p class="text-sm text-red-600 dark:text-red-400">Lien invalide. <a href="/forgot-password" class="underline">Refaire une demande</a></p>
    {:else if done}
      <div class="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
        <p class="text-sm text-green-700 dark:text-green-400 font-medium">Mot de passe mis à jour !</p>
        <p class="text-xs text-green-600 dark:text-green-500 mt-1">Redirection vers la connexion…</p>
      </div>
    {:else}
      <form onsubmit={handleSubmit} class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1" for="pwd">Nouveau mot de passe</label>
          <input id="pwd" type="password" bind:value={newPassword} required minlength="8"
            class="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 transition-colors" />
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1" for="confirm">Confirmer</label>
          <input id="confirm" type="password" bind:value={confirm} required
            class="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 transition-colors" />
        </div>

        {#if error}
          <p class="text-red-600 dark:text-red-400 text-sm">{error}</p>
        {/if}

        <button type="submit" disabled={loading}
          class="w-full bg-slate-800 dark:bg-slate-700 text-white py-2 rounded-lg text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors">
          {loading ? 'Enregistrement…' : 'Changer le mot de passe'}
        </button>
      </form>
    {/if}
  </div>
</div>
