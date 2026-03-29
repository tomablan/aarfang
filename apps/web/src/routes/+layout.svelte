<script lang="ts">
  import '../app.css'
  import { page } from '$app/stores'
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { authApi } from '$lib/api.js'
  import { auth, setAuth, clearAuth, loadStoredToken } from '$lib/stores/auth.svelte.js'

  let { children } = $props()
  const isAuthPage = $derived($page.url.pathname === '/login')

  // ── Thème ─────────────────────────────────────────────────────────────────
  let themeMode = $state<'light' | 'dark' | 'system'>('system')
  let dark = $state(false)

  function applyDark(isDark: boolean) {
    dark = isDark
    document.documentElement.classList.toggle('dark', isDark)
  }

  // ── Menu utilisateur ───────────────────────────────────────────────────────
  let menuOpen = $state(false)
  let menuRef = $state<HTMLDivElement | undefined>()

  function handleDocClick(e: MouseEvent) {
    if (menuOpen && menuRef && !menuRef.contains(e.target as Node)) {
      menuOpen = false
    }
  }

  onMount(async () => {
    // Thème
    const stored = localStorage.getItem('theme')
    themeMode = stored === 'dark' ? 'dark' : stored === 'light' ? 'light' : 'system'
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    applyDark(themeMode === 'system' ? mq.matches : themeMode === 'dark')
    mq.addEventListener('change', (e) => { if (themeMode === 'system') applyDark(e.matches) })

    // Hydrater l'utilisateur depuis le token stocké
    const token = loadStoredToken()
    if (token && !auth.user) {
      try {
        const { user, org } = await authApi.me(token)
        setAuth(token, user, org)
      } catch {
        clearAuth()
      }
    }

    document.addEventListener('click', handleDocClick)
    return () => document.removeEventListener('click', handleDocClick)
  })

  function toggleTheme() {
    if (themeMode === 'system') {
      themeMode = 'light'; localStorage.setItem('theme', 'light'); applyDark(false)
    } else if (themeMode === 'light') {
      themeMode = 'dark'; localStorage.setItem('theme', 'dark'); applyDark(true)
    } else {
      themeMode = 'system'; localStorage.removeItem('theme')
      applyDark(window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
  }

  function logout() {
    clearAuth()
    goto('/login')
  }

  const userInitials = $derived(() => {
    const u = auth.user
    if (!u) return '?'
    if (u.firstName && u.lastName) return (u.firstName[0] + u.lastName[0]).toUpperCase()
    if (u.firstName) return u.firstName.slice(0, 2).toUpperCase()
    return u.email.slice(0, 2).toUpperCase()
  })

  const userName = $derived(auth.user
    ? [auth.user.firstName, auth.user.lastName].filter(Boolean).join(' ') || auth.user.email
    : '')
</script>

{#if isAuthPage}
  {@render children()}
{:else}
  <div class="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors">
    <!-- Bande signature -->
    <div class="h-0.5 bg-gradient-to-r from-slate-800 via-slate-600 to-slate-800 dark:from-slate-300 dark:via-white dark:to-slate-300"></div>

    <nav class="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3 flex items-center justify-between transition-colors">
      <!-- Logo -->
      <a href="/dashboard" class="flex items-center gap-2.5 group">
        <svg width="26" height="29" viewBox="0 0 40 44" fill="none" class="shrink-0 transition-opacity group-hover:opacity-80">
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
        <span class="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors">aarfang</span>
      </a>

      <div class="flex items-center gap-1">
        <!-- Lien Sites (masqué pour super_admin) / Lien Admin -->
        {#if auth.user?.role === 'super_admin'}
          <a href="/superadmin" class="px-3 py-1.5 rounded-lg text-sm font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors">Administration</a>
        {:else}
          <a href="/dashboard" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"/>
            </svg>
            Sites
          </a>
        {/if}

        <!-- Menu utilisateur -->
        <div class="relative" bind:this={menuRef}>
          <button
            onclick={() => menuOpen = !menuOpen}
            aria-label="Menu utilisateur"
            class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-1"
          >
            <div class="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 flex items-center justify-center text-xs font-bold select-none">
              {userInitials()}
            </div>
            <svg class="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 transition-transform {menuOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/>
            </svg>
          </button>

          {#if menuOpen}
            <div class="absolute right-0 top-full mt-1.5 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-1 z-50">
              <!-- Infos utilisateur -->
              <div class="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
                <p class="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{userName}</p>
                {#if auth.user?.email && auth.user.email !== userName}
                  <p class="text-xs text-slate-400 dark:text-slate-500 truncate">{auth.user.email}</p>
                {/if}
                {#if auth.org}
                  <p class="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">{auth.org.name}</p>
                {/if}
              </div>

              <!-- Mon profil -->
              <div class="px-2 pt-1">
                <a href="/settings/profile" onclick={() => menuOpen = false}
                  class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/>
                  </svg>
                  Mon profil
                </a>
              </div>

              <!-- Dark mode toggle -->
              <div class="px-2 py-1">
                <button
                  onclick={toggleTheme}
                  class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {#if themeMode === 'system'}
                    <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path stroke-linecap="round" d="M8 21h8M12 17v4"/></svg>
                    <span>Apparence : Auto</span>
                  {:else if dark}
                    <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path stroke-linecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
                    <span>Apparence : Clair</span>
                  {:else}
                    <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                    <span>Apparence : Sombre</span>
                  {/if}
                </button>
              </div>

              {#if auth.user?.role !== 'super_admin'}
              <div class="h-px bg-slate-100 dark:bg-slate-800 mx-2 my-1"></div>

              <!-- Navigation settings -->
              <div class="px-2 py-1">
                <a href="/settings/integrations" onclick={() => menuOpen = false}
                  class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z"/></svg>
                  Intégrations
                </a>
                <a href="/settings/webhooks" onclick={() => menuOpen = false}
                  class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"/></svg>
                  Webhooks
                </a>
                <a href="/settings/users" onclick={() => menuOpen = false}
                  class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/></svg>
                  Membres
                </a>
              </div>
              {/if}

              <div class="h-px bg-slate-100 dark:bg-slate-800 mx-2 my-1"></div>

              <!-- Déconnexion -->
              <div class="px-2 py-1">
                <button onclick={logout}
                  class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                  <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"/></svg>
                  Déconnexion
                </button>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </nav>

    <main class="max-w-6xl mx-auto px-6 py-8">
      {@render children()}
    </main>
  </div>
{/if}
