export function scoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'text-slate-400'
  if (score >= 80) return 'text-green-500'
  if (score >= 50) return 'text-amber-500'
  return 'text-red-500'
}

export function scoreBg(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'bg-slate-100'
  if (score >= 80) return 'bg-green-50 border-green-200'
  if (score >= 50) return 'bg-amber-50 border-amber-200'
  return 'bg-red-50 border-red-200'
}

export function statusColor(status: string): string {
  switch (status) {
    case 'good': return 'text-green-600 bg-green-50'
    case 'warning': return 'text-amber-600 bg-amber-50'
    case 'critical': return 'text-red-600 bg-red-50'
    default: return 'text-slate-500 bg-slate-50'
  }
}

export function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    technique: 'Technique',
    securite: 'Sécurité',
    seo_technique: 'SEO Technique',
    seo_local: 'SEO Local',
    opportunites: 'Opportunités',
  }
  return labels[cat] ?? cat
}

export function signalLabel(id: string): string {
  const labels: Record<string, string> = {
    https_enabled: 'HTTPS activé',
    ssl_expiry: 'Certificat SSL',
    security_headers: 'En-têtes de sécurité',
    meta_title: 'Balise Title',
    meta_description: 'Meta Description',
    h1_tag: 'Balise H1',
    canonical_tag: 'Canonical',
    sitemap: 'Sitemap.xml',
    robots_txt: 'Robots.txt',
    page_speed: 'Performance (PageSpeed)',
    server_response_time: 'Temps de réponse serveur',
    viewport_meta: 'Balise Viewport',
    structured_data: 'Données structurées (JSON-LD)',
    images_alt: 'Attributs Alt des images',
    open_graph: 'Balises Open Graph',
    cta_presence: 'Appels à l\'action (CTA)',
    phone_visible: 'Numéro de téléphone',
    contact_form: 'Formulaire de contact',
  }
  return labels[id] ?? id
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}
