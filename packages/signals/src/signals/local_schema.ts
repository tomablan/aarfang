import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

// Types schema.org considérés comme LocalBusiness
const LOCAL_BUSINESS_TYPES = new Set([
  'LocalBusiness',
  'Restaurant', 'CafeOrCoffeeShop', 'FastFoodRestaurant', 'Bakery', 'BarOrPub',
  'FoodEstablishment', 'IceCreamShop', 'Winery', 'Brewery',
  'Hotel', 'LodgingBusiness', 'Motel', 'BedAndBreakfast', 'Hostel',
  'MedicalBusiness', 'Dentist', 'Physician', 'Hospital', 'Pharmacy',
  'Optician', 'Veterinary', 'MedicalClinic',
  'LegalService', 'Lawyer', 'Notary', 'Attorney',
  'AccountingService', 'FinancialService', 'InsuranceAgency', 'BankOrCreditUnion',
  'Store', 'ClothingStore', 'BookStore', 'ElectronicsStore', 'HomeGoodsStore',
  'HardwareStore', 'GroceryStore', 'SportingGoodsStore', 'ToyStore',
  'AutoDealer', 'AutoRepair', 'GasStation',
  'BeautySalon', 'HairSalon', 'NailSalon', 'SpaOrFitnessCenter', 'GymOrFitnessCenter',
  'TravelAgency', 'RealEstateAgent', 'Plumber', 'HVACBusiness', 'MovingCompany',
  'ChildCare', 'DaySpa', 'EntertainmentBusiness', 'AmusementPark',
])

interface JsonLd { [key: string]: unknown }

/** Extrait récursivement tous les objets JSON-LD (y compris ceux dans @graph). */
function extractObjects(json: unknown): JsonLd[] {
  if (!json || typeof json !== 'object') return []
  if (Array.isArray(json)) return json.flatMap(extractObjects)
  const obj = json as JsonLd
  const results: JsonLd[] = [obj]
  if (Array.isArray(obj['@graph'])) results.push(...extractObjects(obj['@graph']))
  return results
}

function hasValue(obj: JsonLd, key: string): boolean {
  const val = obj[key]
  if (!val) return false
  if (typeof val === 'string') return val.trim().length > 0
  if (typeof val === 'object') return Object.keys(val as object).length > 0
  if (Array.isArray(val)) return (val as unknown[]).length > 0
  return true
}

export const localSchema: Signal = {
  id: 'local_schema',
  category: 'seo_local',
  weight: 2,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    const allObjects: JsonLd[] = []

    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        allObjects.push(...extractObjects(JSON.parse($(el).html() ?? '')))
      } catch {}
    })

    // Chercher un objet LocalBusiness (ou sous-type)
    const lb = allObjects.find((obj) => {
      const type = obj['@type']
      if (typeof type === 'string') return LOCAL_BUSINESS_TYPES.has(type)
      if (Array.isArray(type)) return (type as string[]).some((t) => LOCAL_BUSINESS_TYPES.has(t))
      return false
    })

    if (!lb) {
      return {
        score: 20,
        status: 'warning',
        details: { found: false, types: allObjects.map((o) => o['@type']).filter(Boolean) },
        recommendations: [
          'Aucun schema LocalBusiness détecté — ajouter un JSON-LD `LocalBusiness` améliore la présence dans Google Maps et les résultats locaux.',
          'Inclure au minimum : nom, adresse, téléphone et horaires.',
        ],
        summary: 'Schema LocalBusiness absent',
      }
    }

    // Évaluer la complétude
    const type = lb['@type'] as string
    const checks = {
      name: hasValue(lb, 'name'),
      address: hasValue(lb, 'address') || hasValue(lb, 'streetAddress'),
      telephone: hasValue(lb, 'telephone'),
      openingHours: hasValue(lb, 'openingHours') || hasValue(lb, 'openingHoursSpecification'),
      geo: hasValue(lb, 'geo'),
      image: hasValue(lb, 'image'),
      url: hasValue(lb, 'url'),
    }

    const filled = Object.values(checks).filter(Boolean).length
    const total = Object.keys(checks).length
    const completeness = Math.round((filled / total) * 100)

    const missing = (Object.entries(checks) as [string, boolean][])
      .filter(([, v]) => !v)
      .map(([k]) => k)

    const recommendations: string[] = []
    if (missing.includes('address')) recommendations.push('Ajouter l\'adresse dans le schema LocalBusiness pour apparaître dans Google Maps.')
    if (missing.includes('telephone')) recommendations.push('Ajouter le numéro de téléphone dans le schema pour faciliter le contact depuis les résultats de recherche.')
    if (missing.includes('openingHours')) recommendations.push('Ajouter les horaires d\'ouverture (champ `openingHours`) pour les afficher dans les SERPs.')
    if (missing.includes('geo')) recommendations.push('Ajouter les coordonnées GPS (`geo`) pour améliorer la précision dans Google Maps.')

    let score: number
    let status: 'good' | 'warning' | 'critical'
    if (completeness >= 85) { score = 100; status = 'good' }
    else if (completeness >= 57) { score = 70; status = 'warning' }
    else { score = 35; status = 'critical' }

    return {
      score,
      status,
      details: { found: true, type, completeness, checks },
      recommendations,
      summary: `${type} · complétude ${completeness}% (${filled}/${total} champs)`,
    }
  },
}
