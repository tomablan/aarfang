<script lang="ts">
  interface Props {
    size?: number
    class?: string
    variant?: 'mark' | 'full' | 'wordmark'
  }
  let { size = 32, class: className = '', variant = 'full' }: Props = $props()
</script>

{#if variant === 'mark' || variant === 'full'}
  <!-- Harfang des neiges — marque symbolique -->
  <svg
    width={size}
    height={Math.round(size * 1.1)}
    viewBox="0 0 40 44"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    class={className}
    aria-label="aarfang"
    role="img"
  >
    <!-- Silhouette du harfang -->
    <!-- Aigrettes (ear tufts) -->
    <path d="M13 13 L10 3 L17 10 Z" fill="#1e293b"/>
    <path d="M27 13 L30 3 L23 10 Z" fill="#1e293b"/>

    <!-- Corps / tête -->
    <ellipse cx="20" cy="26" rx="16" ry="15" fill="#1e293b"/>

    <!-- Ventre — reflet plumes blanches du harfang -->
    <ellipse cx="20" cy="31" rx="9" ry="8" fill="#f1f5f9" opacity="0.12"/>

    <!-- Disque facial -->
    <ellipse cx="20" cy="24" rx="12" ry="11" fill="#334155" opacity="0.5"/>

    <!-- Œil gauche -->
    <circle cx="13.5" cy="23" r="5.5" fill="white"/>
    <circle cx="13.5" cy="23" r="3.8" fill="#f59e0b"/>
    <circle cx="13.5" cy="23" r="2.1" fill="#0f172a"/>
    <circle cx="14.7" cy="21.8" r="0.85" fill="white"/>

    <!-- Œil droit -->
    <circle cx="26.5" cy="23" r="5.5" fill="white"/>
    <circle cx="26.5" cy="23" r="3.8" fill="#f59e0b"/>
    <circle cx="26.5" cy="23" r="2.1" fill="#0f172a"/>
    <circle cx="27.7" cy="21.8" r="0.85" fill="white"/>

    <!-- Bec -->
    <path d="M18 27 Q20 30 22 27 Q20 25.5 18 27Z" fill="#cbd5e1"/>
  </svg>
{/if}

{#if variant === 'full'}
  <!-- Marque + nom -->
  <span class="inline-flex items-center gap-2.5 {className}">
    <svg
      width={size}
      height={Math.round(size * 1.1)}
      viewBox="0 0 40 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M13 13 L10 3 L17 10 Z" fill="#1e293b"/>
      <path d="M27 13 L30 3 L23 10 Z" fill="#1e293b"/>
      <ellipse cx="20" cy="26" rx="16" ry="15" fill="#1e293b"/>
      <ellipse cx="20" cy="31" rx="9" ry="8" fill="#f1f5f9" opacity="0.12"/>
      <ellipse cx="20" cy="24" rx="12" ry="11" fill="#334155" opacity="0.5"/>
      <circle cx="13.5" cy="23" r="5.5" fill="white"/>
      <circle cx="13.5" cy="23" r="3.8" fill="#f59e0b"/>
      <circle cx="13.5" cy="23" r="2.1" fill="#0f172a"/>
      <circle cx="14.7" cy="21.8" r="0.85" fill="white"/>
      <circle cx="26.5" cy="23" r="5.5" fill="white"/>
      <circle cx="26.5" cy="23" r="3.8" fill="#f59e0b"/>
      <circle cx="26.5" cy="23" r="2.1" fill="#0f172a"/>
      <circle cx="27.7" cy="21.8" r="0.85" fill="white"/>
      <path d="M18 27 Q20 30 22 27 Q20 25.5 18 27Z" fill="#cbd5e1"/>
    </svg>
    <span class="text-xl font-bold tracking-tight text-slate-900">aarfang</span>
  </span>
{/if}

{#if variant === 'wordmark'}
  <span class="inline-flex items-center gap-2 {className}">
    <svg width={size} height={Math.round(size * 1.1)} viewBox="0 0 40 44" fill="none">
      <path d="M13 13 L10 3 L17 10 Z" fill="currentColor"/>
      <path d="M27 13 L30 3 L23 10 Z" fill="currentColor"/>
      <ellipse cx="20" cy="26" rx="16" ry="15" fill="currentColor"/>
      <ellipse cx="20" cy="31" rx="9" ry="8" fill="white" opacity="0.12"/>
      <ellipse cx="20" cy="24" rx="12" ry="11" fill="currentColor" opacity="0.4"/>
      <circle cx="13.5" cy="23" r="5.5" fill="white"/>
      <circle cx="13.5" cy="23" r="3.8" fill="#f59e0b"/>
      <circle cx="13.5" cy="23" r="2.1" fill="currentColor"/>
      <circle cx="14.7" cy="21.8" r="0.85" fill="white"/>
      <circle cx="26.5" cy="23" r="5.5" fill="white"/>
      <circle cx="26.5" cy="23" r="3.8" fill="#f59e0b"/>
      <circle cx="26.5" cy="23" r="2.1" fill="currentColor"/>
      <circle cx="27.7" cy="21.8" r="0.85" fill="white"/>
      <path d="M18 27 Q20 30 22 27 Q20 25.5 18 27Z" fill="white" opacity="0.6"/>
    </svg>
    <span class="font-bold tracking-tight">aarfang</span>
  </span>
{/if}
