<script lang="ts">
  import '../app.css'
  import { page } from '$app/stores'

  let { children } = $props()
  const isAuthPage = $derived($page.url.pathname === '/login')
</script>

{#if isAuthPage}
  {@render children()}
{:else}
  <div class="min-h-screen bg-slate-50">
    <nav class="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
      <a href="/dashboard" class="text-xl font-bold text-slate-800 tracking-tight">
        aarfang
      </a>
      <div class="flex items-center gap-4 text-sm text-slate-600">
        <a href="/dashboard" class="hover:text-slate-900">Sites</a>
        <a href="/settings/integrations" class="hover:text-slate-900">Intégrations</a>
        <a href="/settings/users" class="hover:text-slate-900">Membres</a>
        <a href="/login" class="text-slate-400 hover:text-slate-600 text-xs">Déconnexion</a>
      </div>
    </nav>
    <main class="max-w-6xl mx-auto px-6 py-8">
      {@render children()}
    </main>
  </div>
{/if}
