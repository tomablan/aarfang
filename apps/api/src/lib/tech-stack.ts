export interface TechStack {
  cms?: string
  ecommerce?: string
  framework?: string
  server?: string
  cdn?: string
  hosting?: string
  language?: string
  country?: string
}

const TLD_COUNTRIES: Record<string, string> = {
  fr: 'France', de: 'Allemagne', es: 'Espagne', it: 'Italie',
  gb: 'Royaume-Uni', uk: 'Royaume-Uni', be: 'Belgique', ch: 'Suisse',
  nl: 'Pays-Bas', pt: 'Portugal', pl: 'Pologne', at: 'Autriche',
  se: 'Suède', no: 'Norvège', dk: 'Danemark', fi: 'Finlande',
  lu: 'Luxembourg', re: 'France', mc: 'Monaco',
  ca: 'Canada', au: 'Australie', nz: 'Nouvelle-Zélande',
  jp: 'Japon', cn: 'Chine', br: 'Brésil', mx: 'Mexique',
  in: 'Inde', za: 'Afrique du Sud', ru: 'Russie',
}

const CF_COUNTRY_NAMES: Record<string, string> = {
  FR: 'France', DE: 'Allemagne', ES: 'Espagne', IT: 'Italie',
  GB: 'Royaume-Uni', BE: 'Belgique', CH: 'Suisse', NL: 'Pays-Bas',
  PT: 'Portugal', PL: 'Pologne', AT: 'Autriche', SE: 'Suède',
  NO: 'Norvège', DK: 'Danemark', FI: 'Finlande', LU: 'Luxembourg',
  US: 'États-Unis', CA: 'Canada', AU: 'Australie', NZ: 'Nouvelle-Zélande',
  JP: 'Japon', CN: 'Chine', BR: 'Brésil', MX: 'Mexique',
  IN: 'Inde', ZA: 'Afrique du Sud', RU: 'Russie',
}

// Détecte le stack technologique depuis les headers HTTP + le HTML de la page (pas de dépendance externe)
export function detectTechStack(
  headers: Record<string, string>,
  html: string,
  siteUrl?: string,
): TechStack {
  const stack: TechStack = {}
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.toLowerCase()]))
  const body = html.toLowerCase()

  // ── Server ──
  const serverHeader = h['server'] ?? ''
  if (serverHeader.includes('cloudflare')) stack.server = 'Cloudflare'
  else if (serverHeader.includes('nginx')) stack.server = 'Nginx'
  else if (serverHeader.includes('apache')) stack.server = 'Apache'
  else if (serverHeader.includes('litespeed')) stack.server = 'LiteSpeed'
  else if (serverHeader.includes('iis')) stack.server = 'IIS'
  else if (serverHeader.includes('openresty')) stack.server = 'OpenResty'
  else if (serverHeader) stack.server = serverHeader.split('/')[0]

  // ── CDN ──
  if (h['cf-ray'] || h['cf-cache-status']) stack.cdn = 'Cloudflare'
  else if (h['x-served-by']?.includes('cache-')) stack.cdn = 'Fastly'
  else if (h['x-cache']?.includes('cloudfront') || h['x-amz-cf-id']) stack.cdn = 'Amazon CloudFront'
  else if (h['x-azure-ref']) stack.cdn = 'Azure CDN'

  // ── Hosting / Platform ──
  if (h['x-vercel-id'] || h['x-vercel-cache']) stack.hosting = 'Vercel'
  else if (h['x-netlify'] || h['netlify-vary']) stack.hosting = 'Netlify'
  else if (h['x-github-request-id']) stack.hosting = 'GitHub Pages'
  else if (h['x-wix-request-id'] || body.includes('static.wixstatic.com')) stack.hosting = 'Wix'
  else if (body.includes('squarespace-cdn.com')) stack.hosting = 'Squarespace'
  else if (h['x-wpe-request-id'] || h['x-powered-by-wpengine']) stack.hosting = 'WP Engine'
  else if (h['x-kinsta-cache'] || body.includes('kinsta-cache')) stack.hosting = 'Kinsta'
  else if (serverHeader.includes('infomaniak') || body.includes('infomaniak')) stack.hosting = 'Infomaniak'
  else if (h['x-ovh-server'] || serverHeader.includes('ovh')) stack.hosting = 'OVH'
  else if (h['x-scaleway-lb']) stack.hosting = 'Scaleway'
  else if (h['fly-request-id']) stack.hosting = 'Fly.io'
  else if (h['x-render-origin-server']) stack.hosting = 'Render'
  else if (h['x-railway-static-url'] || h['railway-request-id']) stack.hosting = 'Railway'

  // ── Language / Runtime ──
  const poweredBy = h['x-powered-by'] ?? ''
  if (poweredBy.includes('php')) {
    const ver = poweredBy.match(/php\/([\d.]+)/i)?.[1]
    stack.language = ver ? `PHP ${ver}` : 'PHP'
  } else if (poweredBy.includes('asp.net')) {
    stack.language = 'ASP.NET'
  } else if (poweredBy.includes('express')) {
    stack.language = 'Node.js (Express)'
  } else if (poweredBy.includes('next.js')) {
    stack.language = 'Node.js'
    stack.framework = 'Next.js'
  }

  // ── CMS — détection via meta[name=generator] regex + patterns HTML ──
  const generatorMatch = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i)
                      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']generator["']/i)
  const generator = generatorMatch?.[1] ?? ''
  const gen = generator.toLowerCase()

  if (gen.includes('wordpress') || body.includes('/wp-content/') || body.includes('/wp-json/')) {
    const ver = generator.match(/[\d.]+/)?.[0]
    stack.cms = ver ? `WordPress ${ver}` : 'WordPress'
  } else if (body.includes('cdn.shopify.com') || body.includes('shopify.com/s/files')) {
    stack.cms = 'Shopify'
  } else if (gen.includes('drupal') || body.includes('/sites/default/files/')) {
    stack.cms = 'Drupal'
  } else if (gen.includes('joomla') || body.includes('/media/jui/')) {
    stack.cms = 'Joomla'
  } else if (body.includes('static.squarespace.com')) {
    stack.cms = 'Squarespace'
  } else if (body.includes('static.wixstatic.com')) {
    stack.cms = 'Wix'
  } else if (body.includes('webflow.io') || body.includes('webflow.com/css')) {
    stack.cms = 'Webflow'
  } else if (body.includes('ghost.io') || gen.includes('ghost')) {
    stack.cms = 'Ghost'
  } else if (gen.includes('typo3')) {
    stack.cms = 'TYPO3'
  } else if (body.includes('prestashop') || body.includes('/themes/prestashop')) {
    stack.cms = 'PrestaShop'
  } else if (body.includes('/skin/frontend/') || body.includes('mage/cookies') || body.includes('mage_messages') || body.includes('/js/mage/')) {
    stack.cms = 'Magento'
  } else if (generator) {
    stack.cms = generator.split(' ').slice(0, 3).join(' ')
  }

  // ── E-commerce ──
  if (!stack.ecommerce) {
    if (body.includes('woocommerce') || body.includes('wc-add-to-cart')) stack.ecommerce = 'WooCommerce'
    else if (body.includes('cdn.shopify.com')) stack.ecommerce = 'Shopify'
    else if (body.includes('prestashop')) stack.ecommerce = 'PrestaShop'
    else if (body.includes('/skin/frontend/') || body.includes('mage/cookies') || body.includes('mage_messages') || body.includes('/js/mage/')) stack.ecommerce = 'Magento'
  }

  // ── Frontend framework ──
  if (!stack.framework) {
    if (body.includes('__next') || body.includes('_next/static')) stack.framework = 'Next.js'
    else if (body.includes('__nuxt') || body.includes('nuxt.js')) stack.framework = 'Nuxt.js'
    else if (body.includes('___gatsby')) stack.framework = 'Gatsby'
    else if (body.includes('__sveltekit') || body.includes('sveltekit')) stack.framework = 'SvelteKit'
    else if (body.includes('data-v-app') || body.includes('vue.min.js')) stack.framework = 'Vue.js'
    else if (body.includes('ng-version=') || body.includes('angular/core')) stack.framework = 'Angular'
  }

  // ── Pays ──
  // 1. Via header Cloudflare (le plus fiable pour la localisation serveur)
  const cfCountry = h['cf-ipcountry']
  if (cfCountry && cfCountry !== 'xx' && cfCountry !== 't1') {
    stack.country = CF_COUNTRY_NAMES[cfCountry.toUpperCase()] ?? cfCountry.toUpperCase()
  }

  // 2. Via TLD de l'URL (si pas déjà détecté)
  if (!stack.country && siteUrl) {
    try {
      const hostname = new URL(siteUrl).hostname
      const tld = hostname.split('.').pop()?.toLowerCase()
      if (tld && tld !== 'com' && tld !== 'net' && tld !== 'org' && tld !== 'io' && tld !== 'co') {
        stack.country = TLD_COUNTRIES[tld]
      }
    } catch { /* URL invalide */ }
  }

  return stack
}
