<script lang="ts">
  import '../app.css'
  import { page } from '$app/stores'
  import { onMount } from 'svelte'

  let { children } = $props()
  const isAuthPage = $derived($page.url.pathname === '/login')

  // 'light' | 'dark' | 'system'
  let themeMode = $state<'light' | 'dark' | 'system'>('system')
  let dark = $state(false)

  function applyDark(isDark: boolean) {
    dark = isDark
    document.documentElement.classList.toggle('dark', isDark)
  }

  onMount(() => {
    const stored = localStorage.getItem('theme')
    themeMode = stored === 'dark' ? 'dark' : stored === 'light' ? 'light' : 'system'
    const mq = window.matchMedia('(prefers-color-scheme: dark)')

    if (themeMode === 'system') {
      applyDark(mq.matches)
    } else {
      applyDark(themeMode === 'dark')
    }

    // Réagir aux changements de préférence système si mode auto
    mq.addEventListener('change', (e) => {
      if (themeMode === 'system') applyDark(e.matches)
    })
  })

  function toggleTheme() {
    // Cycle : system → light → dark → system
    if (themeMode === 'system') {
      themeMode = 'light'
      localStorage.setItem('theme', 'light')
      applyDark(false)
    } else if (themeMode === 'light') {
      themeMode = 'dark'
      localStorage.setItem('theme', 'dark')
      applyDark(true)
    } else {
      themeMode = 'system'
      localStorage.removeItem('theme')
      applyDark(window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
  }
</script>

{#if isAuthPage}
  {@render children()}
{:else}
  <div class="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors">
    <!-- Bande signature amber -->
    <div class="h-0.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500"></div>

    <nav class="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3 flex items-center justify-between transition-colors">
      <a href="/dashboard" class="flex items-center gap-2.5 group">
        <!-- Logo harfang avec couleurs adaptatives via CSS vars -->
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

      <div class="flex items-center gap-0.5 text-sm">
        <a href="/dashboard" class="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">Sites</a>
        <a href="/settings/integrations" class="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">Intégrations</a>
        <a href="/settings/webhooks" class="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">Webhooks</a>
        <a href="/settings/users" class="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">Membres</a>
        <span class="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-2"></span>
        <!-- Toggle dark mode (cycle: system → light → dark) -->
        <button
          onclick={toggleTheme}
          aria-label={themeMode === 'system' ? 'Mode auto (suit le système)' : themeMode === 'light' ? 'Mode clair' : 'Mode sombre'}
          title={themeMode === 'system' ? 'Auto (système)' : themeMode === 'light' ? 'Clair' : 'Sombre'}
          class="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          {#if themeMode === 'system'}
            <!-- Icône système (écran + cercle) -->
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <path stroke-linecap="round" d="M8 21h8M12 17v4"/>
            </svg>
          {:else if dark}
            <!-- Soleil -->
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="4"/>
              <path stroke-linecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
            </svg>
          {:else}
            <!-- Lune -->
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          {/if}
        </button>
        <span class="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-2"></span>
        <a href="/login" class="px-3 py-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-xs">Déconnexion</a>
      </div>
    </nav>

    <main class="max-w-6xl mx-auto px-6 py-8">
      {@render children()}
    </main>
  </div>
{/if}
