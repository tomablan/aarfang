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
    conformite: 'Conformité',
    seo_technique: 'SEO Technique',
    seo_local: 'SEO Local',
    opportunites: 'Expérience de navigation',
    sea: 'SEA & Tracking',
    accessibilite: 'Accessibilité',
    ecoconception: 'Éco-conception',
  }
  return labels[cat] ?? cat
}

export function categoryDescription(cat: string): string {
  const descriptions: Record<string, string> = {
    securite: 'La sécurité protège le site et ses visiteurs contre les attaques, les fuites de données et les avertissements navigateur. Un site non sécurisé pénalise le référencement et détruit la confiance des utilisateurs.',
    conformite: 'La conformité légale est obligatoire : mentions légales, politique de confidentialité, gestion des cookies. Un manquement expose à des sanctions RGPD et fragilise la crédibilité de l\'entreprise.',
    accessibilite: 'L\'accessibilité garantit que le site est utilisable par tous, y compris les personnes en situation de handicap. Elle améliore l\'expérience globale, élargit l\'audience et réduit les risques juridiques.',
    technique: 'La performance technique conditionne directement l\'expérience utilisateur et le référencement. Un site lent perd des visiteurs et est pénalisé par Google, qui intègre les Core Web Vitals dans son algorithme.',
    seo_technique: 'Le SEO technique assure que Google peut découvrir, explorer et indexer le site correctement. Sans ces fondations, même un contenu de qualité reste invisible dans les résultats de recherche.',
    seo_local: 'Le SEO local maximise la visibilité dans les recherches géolocalisées (Google Maps, "près de moi"). Indispensable pour les entreprises ayant une présence physique ou une zone de chalandise définie.',
    opportunites: 'L\'expérience de navigation évalue la capacité du site à convertir les visiteurs en contacts ou clients : clarté des appels à l\'action, facilité de contact, éléments de réassurance.',
    sea: 'La maturité SEA mesure la préparation du site pour les campagnes publicitaires payantes. Un tracking mal configuré gaspille le budget publicitaire et empêche d\'optimiser les conversions.',
    ecoconception: 'L\'éco-conception réduit l\'empreinte environnementale du site (énergie, bande passante, requêtes réseau). Elle améliore aussi la performance perçue et réduit les coûts d\'infrastructure.',
  }
  return descriptions[cat] ?? ''
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
    social_presence: 'Réseaux sociaux',
    trust_signals: 'Signaux de confiance',
    live_chat: 'Chat en ligne',
    cookie_consent: 'Gestion des cookies (RGPD)',
    legal_pages: 'Pages légales obligatoires',
    gsc_search_performance: 'Visibilité Google Search Console',
    local_schema: 'Schema LocalBusiness',
    review_schema: 'Avis & Rich Snippets (étoiles)',
    core_web_vitals: 'Core Web Vitals (données terrain)',
    crawl_duplicate_titles: 'Titres dupliqués',
    crawl_broken_pages: 'Pages en erreur',
    crawl_redirects: 'Redirections',
    crawl_thin_content: 'Contenu insuffisant',
    crawl_depth: 'Profondeur de crawl',
    crawl_noindex: 'Pages noindex',
    crawl_internal_linking: 'Maillage interne',
    crawl_cannibalization: 'Cannibalisation sémantique',
    crawl_meta_coverage: 'Couverture des meta descriptions',
    keyword_consistency: 'Cohérence des mots-clés',
    gsc_keyword_opportunities: 'Opportunités de mots-clés (GSC)',
    accessibility_interactive: 'Éléments interactifs accessibles',
    accessibility_structure: 'Structure documentaire (WCAG)',
    analytics_setup: 'Analytics & Tag Manager',
    google_ads_tag: 'Tag Google Ads',
    meta_pixel: 'Meta Pixel & Réseaux sociaux',
    sea_readiness: 'Maturité SEA (score composite)',
    landing_page_detection: 'Landing pages de conversion',
    lead_capture: 'Capture email / Newsletter',
    blog_presence: 'Blog & actualités',
    content_freshness: 'Fraîcheur du contenu',
    video_presence: 'Vidéo de présentation',
    pricing_page: 'Page tarifs',
    eco_page_weight: 'Poids de la page HTML',
    eco_compression: 'Compression HTTP (Gzip / Brotli)',
    eco_cache_policy: 'Politique de cache HTTP',
    eco_image_optimization: 'Optimisation des images (lazy loading, formats modernes)',
    eco_third_party_scripts: 'Scripts et domaines tiers',
    eco_fonts: 'Polices web externes',
  }
  return labels[id] ?? id
}

export function faviconUrl(siteUrl: string): string {
  try {
    const host = new URL(siteUrl).hostname
    return `https://www.google.com/s2/favicons?sz=64&domain=${host}`
  } catch {
    return ''
  }
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}
