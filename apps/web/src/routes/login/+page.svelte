<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { authApi } from '$lib/api.js'
  import { setAuth } from '$lib/stores/auth.svelte.js'

  let email = $state('')
  let password = $state('')
  let error = $state('')
  let loading = $state(false)

  // Sync state with what the layout has already applied
  let dark = $state(false)
  let themeMode = $state<'light' | 'dark' | 'system'>('system')

  onMount(() => {
    const stored = localStorage.getItem('theme')
    themeMode = stored === 'dark' ? 'dark' : stored === 'light' ? 'light' : 'system'
    dark = document.documentElement.classList.contains('dark')
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (themeMode === 'system') { dark = e.matches; document.documentElement.classList.toggle('dark', dark) }
    })
  })

  function toggleTheme() {
    if (themeMode === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      themeMode = prefersDark ? 'light' : 'dark'
      dark = !prefersDark
      localStorage.setItem('theme', dark ? 'dark' : 'light')
    } else if (themeMode === 'light') {
      themeMode = 'dark'; dark = true
      localStorage.setItem('theme', 'dark')
    } else {
      themeMode = 'system'
      dark = window.matchMedia('(prefers-color-scheme: dark)').matches
      localStorage.removeItem('theme')
    }
    document.documentElement.classList.toggle('dark', dark)
  }

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

<div class="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center transition-colors">
  <!-- Bande amber en haut -->
  <div class="fixed top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-slate-800 via-slate-600 to-slate-800 dark:from-slate-300 dark:via-white dark:to-slate-300"></div>

  <!-- Toggle thème (coin supérieur droit) -->
  <button
    onclick={toggleTheme}
    aria-label="Basculer le thème"
    class="fixed top-3 right-4 p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
  >
    {#if themeMode === 'system'}
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <rect x="2" y="3" width="20" height="14" rx="2"/>
        <path stroke-linecap="round" d="M8 21h8M12 17v4"/>
      </svg>
    {:else if dark}
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4"/>
        <path stroke-linecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
      </svg>
    {:else}
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    {/if}
  </button>

  <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-8 w-full max-w-sm transition-colors">
    <!-- Logo -->
    <div class="flex flex-col items-center mb-8">
      <svg width="52" height="57" viewBox="0 0 40 44" fill="none" class="mb-3">
        <path d="M13 13 L10 3 L17 10 Z" fill="var(--logo-body)"/>
        <path d="M27 13 L30 3 L23 10 Z" fill="var(--logo-body)"/>
        <ellipse cx="20" cy="26" rx="16" ry="15" fill="var(--logo-body)"/>
        <ellipse cx="20" cy="31" rx="9" ry="8" fill="#f1f5f9" opacity="var(--logo-belly-opacity)"/>
        <ellipse cx="20" cy="24" rx="12" ry="11" fill="var(--logo-overlay)" opacity="0.5"/>
        <g class="logo-eye">
          <circle cx="13.5" cy="23" r="5.5" fill="white"/>
          <circle cx="13.5" cy="23" r="3.8" fill="#f59e0b"/>
          <circle cx="13.5" cy="23" r="2.1" fill="#0f172a"/>
          <circle cx="14.7" cy="21.8" r="0.85" fill="white"/>
        </g>
        <g class="logo-eye" style="animation-delay: 0.04s">
          <circle cx="26.5" cy="23" r="5.5" fill="white"/>
          <circle cx="26.5" cy="23" r="3.8" fill="#f59e0b"/>
          <circle cx="26.5" cy="23" r="2.1" fill="#0f172a"/>
          <circle cx="27.7" cy="21.8" r="0.85" fill="white"/>
        </g>
        <path d="M18 27 Q20 30 22 27 Q20 25.5 18 27Z" fill="var(--logo-beak)"/>
      </svg>
      <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">aarfang</h1>
      <p class="text-slate-500 dark:text-slate-400 text-sm mt-1">Audit qualité de sites internet</p>
    </div>

    <form onsubmit={handleLogin} class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1" for="email">Email</label>
        <input id="email" type="email" bind:value={email} required
          class="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 transition-colors"
          placeholder="votre@email.com" />
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1" for="password">Mot de passe</label>
        <input id="password" type="password" bind:value={password} required
          class="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 transition-colors" />
      </div>

      {#if error}
        <p class="text-red-600 dark:text-red-400 text-sm">{error}</p>
      {/if}

      <button type="submit" disabled={loading}
        class="w-full bg-slate-800 dark:bg-slate-700 text-white py-2 rounded-lg text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors">
        {loading ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  </div>
</div>
