<script lang="ts">
  interface Props {
    scores: number[]
    width?: number
    height?: number
  }
  let { scores, width = 120, height = 32 }: Props = $props()

  const points = $derived(() => {
    if (scores.length < 2) return ''
    const n = scores.length
    const xStep = width / (n - 1)
    return scores.map((s, i) => {
      const x = i * xStep
      const y = height - (s / 100) * height
      return `${x},${y}`
    }).join(' ')
  })

  const lastScore = $derived(scores[scores.length - 1] ?? null)
  const color = $derived(
    lastScore === null ? '#94a3b8'
    : lastScore >= 80 ? '#22c55e'
    : lastScore >= 50 ? '#f59e0b'
    : '#ef4444'
  )
</script>

{#if scores.length >= 2}
  <svg {width} {height} viewBox="0 0 {width} {height}" class="overflow-visible">
    <polyline
      points={points()}
      fill="none"
      stroke={color}
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <!-- Point final -->
    {#if scores.length > 0}
      {@const lastX = (scores.length - 1) * (width / (scores.length - 1))}
      {@const lastY = height - ((scores[scores.length - 1] ?? 0) / 100) * height}
      <circle cx={lastX} cy={lastY} r="3" fill={color} />
    {/if}
  </svg>
{/if}
