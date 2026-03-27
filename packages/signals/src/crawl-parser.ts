import type { CrawlData, CrawlRow } from './types.js'

/**
 * Parse l'export CSV "All Exports > Internal > HTML" de Screaming Frog.
 * Gère les variations de noms de colonnes selon la version de SF.
 */
export function parseScreamingFrogCsv(csvContent: string): CrawlData {
  // Supprimer le BOM UTF-8 éventuel (\ufeff)
  const cleaned = csvContent.replace(/^\uFEFF/, '')
  const lines = cleaned.split(/\r?\n/)
  if (lines.length < 2) return { rows: [], totalUrls: 0, source: 'screaming_frog' }

  // Normaliser les noms de colonnes (lowercase, trim, sans guillemets)
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim())

  // Correspondances colonnes — SF change parfois les noms selon la version
  const col = (candidates: string[]): number => {
    for (const c of candidates) {
      const idx = headers.indexOf(c)
      if (idx !== -1) return idx
    }
    return -1
  }

  const idxAddress     = col(['address', 'url'])
  const idxStatus      = col(['status code', 'status_code', 'statuscode', 'http status code'])
  const idxContentType = col(['content type', 'content_type', 'mime type', 'mime_type'])
  const idxIndexable   = col(['indexability', 'indexable'])
  const idxTitle       = col(['title 1', 'title1', 'page title', 'title'])
  const idxTitleLen    = col(['title 1 length', 'title1 length', 'title length', 'title 1 character count'])
  const idxDesc        = col(['meta description 1', 'meta description', 'description 1', 'meta_description'])
  const idxDescLen     = col(['meta description 1 length', 'meta description length', 'description 1 length'])
  const idxH1          = col(['h1-1', 'h1 1', 'h1', 'heading 1'])
  const idxH1Count     = col(['h1 count', 'h1count', 'h1-count'])
  const idxCanonical   = col(['canonical link element 1', 'canonical', 'canonical link'])
  const idxRobots      = col(['meta robots 1', 'meta robots', 'robots'])
  const idxWords       = col(['word count', 'wordcount', 'words'])
  const idxDepth       = col(['crawl depth', 'crawldepth', 'depth'])
  const idxInlinks     = col(['unique inlinks', 'inlinks', 'unique inbound links'])

  if (idxAddress === -1) {
    throw new Error(
      `Colonne "Address" introuvable. Headers détectés : ${headers.slice(0, 8).join(', ')} — vérifiez que le fichier est un export Screaming Frog "Internal HTML"`
    )
  }

  const rows: CrawlRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cells = parseCsvLine(line)
    const url = cells[idxAddress]?.trim() ?? ''
    if (!url || !url.startsWith('http')) continue

    const contentType = idxContentType !== -1 ? (cells[idxContentType] ?? '') : ''
    // Garder uniquement les pages HTML
    if (contentType && !contentType.toLowerCase().includes('html')) continue

    const statusCode = idxStatus !== -1 ? (parseInt(cells[idxStatus] ?? '0', 10) || 0) : 200
    const indexableRaw = idxIndexable !== -1 ? (cells[idxIndexable] ?? '').toLowerCase() : 'indexable'
    const indexable = indexableRaw === 'indexable' || indexableRaw === 'true' || indexableRaw === '1'

    rows.push({
      url,
      statusCode,
      contentType: contentType || 'text/html',
      indexable,
      title: cells[idxTitle]?.trim() ?? '',
      titleLength: idxTitleLen !== -1 ? (parseInt(cells[idxTitleLen] ?? '0', 10) || 0) : (cells[idxTitle]?.trim().length ?? 0),
      metaDescription: cells[idxDesc]?.trim() ?? '',
      metaDescriptionLength: idxDescLen !== -1 ? (parseInt(cells[idxDescLen] ?? '0', 10) || 0) : (cells[idxDesc]?.trim().length ?? 0),
      h1: cells[idxH1]?.trim() ?? '',
      h1Count: idxH1Count !== -1 ? (parseInt(cells[idxH1Count] ?? '0', 10) || 0) : (cells[idxH1]?.trim() ? 1 : 0),
      canonical: cells[idxCanonical]?.trim() ?? '',
      metaRobots: (cells[idxRobots] ?? '').toLowerCase().trim(),
      wordCount: idxWords !== -1 ? (parseInt(cells[idxWords] ?? '0', 10) || 0) : 0,
      crawlDepth: idxDepth !== -1 ? (parseInt(cells[idxDepth] ?? '0', 10) || 0) : 0,
      inlinks: idxInlinks !== -1 ? (parseInt(cells[idxInlinks] ?? '0', 10) || 0) : 0,
    })
  }

  return { rows, totalUrls: rows.length, source: 'screaming_frog' }
}

/** Parser CSV minimal gérant les guillemets et virgules dans les valeurs */
function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let i = 0
  while (i < line.length) {
    if (line[i] === '"') {
      let val = ''
      i++ // sauter le guillemet ouvrant
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          val += '"'; i += 2
        } else if (line[i] === '"') {
          i++; break
        } else {
          val += line[i++]
        }
      }
      result.push(val)
      if (line[i] === ',') i++
    } else {
      const start = i
      while (i < line.length && line[i] !== ',') i++
      result.push(line.slice(start, i))
      if (line[i] === ',') i++
    }
  }
  return result
}
