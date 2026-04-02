<script lang="ts">
  import { authApi } from '$lib/api.js'

  let email = $state('')
  let loading = $state(false)
  let sent = $state(false)
  let error = $state('')

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    loading = true
    error = ''
    try {
      await authApi.forgotPassword(email)
      sent = true
    } catch (err: any) {
      error = err.message ?? 'Erreur'
    } finally {
      loading = false
    }
  }
</script>

<div class="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
  <div class="h-0.5 fixed top-0 left-0 right-0 bg-gradient-to-r from-slate-800 via-slate-600 to-slate-800 dark:from-slate-300 dark:via-white dark:to-slate-300"></div>

  <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-8 w-full max-w-sm">
    <a href="/login" class="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 mb-6 inline-block">← Retour à la connexion</a>

    <h1 class="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">Mot de passe oublié</h1>
    <p class="text-sm text-slate-500 dark:text-slate-400 mb-6">Saisissez votre email pour recevoir un lien de réinitialisation.</p>

    {#if sent}
      <div class="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
        <p class="text-sm text-green-700 dark:text-green-400 font-medium">Email envoyé !</p>
        <p class="text-xs text-green-600 dark:text-green-500 mt-1">Si un compte existe pour cette adresse, vous recevrez un lien valable 15 minutes.</p>
      </div>
    {:else}
      <form onsubmit={handleSubmit} class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1" for="email">Email</label>
          <input id="email" type="email" bind:value={email} required
            class="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 transition-colors"
            placeholder="votre@email.com" />
        </div>

        {#if error}
          <p class="text-red-600 dark:text-red-400 text-sm">{error}</p>
        {/if}

        <button type="submit" disabled={loading}
          class="w-full bg-slate-800 dark:bg-slate-700 text-white py-2 rounded-lg text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors">
          {loading ? 'Envoi…' : 'Envoyer le lien'}
        </button>
      </form>
    {/if}
  </div>
</div>
