<script lang="ts">
  import { goto } from '$app/navigation'
  import { authApi } from '$lib/api.js'
  import { setAuth } from '$lib/stores/auth.svelte.js'

  let email = $state('')
  let password = $state('')
  let error = $state('')
  let loading = $state(false)

  async function handleLogin(e: SubmitEvent) {
    e.preventDefault()
    error = ''
    loading = true
    try {
      const { accessToken, user } = await authApi.login(email, password)
      const { org } = await authApi.me(accessToken)
      setAuth(accessToken, user, org)
      goto('/dashboard')
    } catch (err: any) {
      error = err.message ?? 'Identifiants invalides'
    } finally {
      loading = false
    }
  }
</script>

<div class="min-h-screen bg-slate-50 flex items-center justify-center">
  <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-8 w-full max-w-sm">
    <h1 class="text-2xl font-bold text-slate-800 mb-1">aarfang</h1>
    <p class="text-slate-500 text-sm mb-6">Audit qualité de sites internet</p>

    <form onsubmit={handleLogin} class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-1" for="email">Email</label>
        <input id="email" type="email" bind:value={email} required
          class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          placeholder="admin@aarfang.io" />
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-1" for="password">Mot de passe</label>
        <input id="password" type="password" bind:value={password} required
          class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
      </div>

      {#if error}
        <p class="text-red-600 text-sm">{error}</p>
      {/if}

      <button type="submit" disabled={loading}
        class="w-full bg-slate-800 text-white py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors">
        {loading ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  </div>
</div>
