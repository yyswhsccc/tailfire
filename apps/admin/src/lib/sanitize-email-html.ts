import DOMPurify from 'dompurify'

const REMOTE_URL_PATTERN = /^https?:\/\//i

interface SanitizeOptions {
  trustedDomains?: string[]
  senderDomain?: string
  allowAllImages?: boolean
}

export function sanitizeEmailHtml(html: string, options?: SanitizeOptions): { html: string; hasBlockedImages: boolean } {
  let hasBlockedImages = false

  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'a', 'b', 'i', 'u', 'em', 'strong', 'p', 'br', 'div', 'span',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img', 'blockquote',
      'pre', 'code', 'hr', 'dl', 'dt', 'dd', 'sup', 'sub', 'font',
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'class', 'style', 'width', 'height',
      'border', 'cellpadding', 'cellspacing', 'align', 'valign', 'bgcolor',
      'color', 'size', 'face', 'target', 'rel',
    ],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target'],
    // Allow data: URIs for resolved CID inline images (base64-encoded by backend)
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|data:image\/|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  })

  // Parse DOM for link rewriting and image blocking
  const parser = typeof window !== 'undefined' ? new DOMParser() : null
  if (!parser) return { html: clean, hasBlockedImages: false }

  const doc = parser.parseFromString(clean, 'text/html')

  // Force all links to open in a new tab
  doc.querySelectorAll('a[href]').forEach((a) => {
    a.setAttribute('target', '_blank')
    a.setAttribute('rel', 'noopener noreferrer')
  })

  // If sender domain is trusted, allow all images from this sender
  const senderTrusted = options?.senderDomain && options?.trustedDomains?.some(
    d => options.senderDomain === d || options.senderDomain!.endsWith(`.${d}`)
  )

  if (options?.allowAllImages || senderTrusted) {
    return { html: doc.body.innerHTML, hasBlockedImages: false }
  }

  // Handle CID inline images: resolved ones have data: URIs (pass through),
  // unresolved ones still have cid: scheme (show placeholder)
  doc.querySelectorAll('img[src^="cid:"]').forEach((img) => {
    img.setAttribute('src', 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">' +
      '<rect width="120" height="80" fill="#f3f4f6" rx="4"/>' +
      '<text x="60" y="36" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#9ca3af">Embedded</text>' +
      '<text x="60" y="50" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#9ca3af">Image</text>' +
      '</svg>'
    ))
    img.setAttribute('alt', '[Embedded image]')
    img.removeAttribute('width')
    img.removeAttribute('height')
    img.setAttribute('style', 'max-width:120px;max-height:80px;border:1px dashed #d1d5db;border-radius:4px;')
  })

  // Block remote img[src]
  doc.querySelectorAll('img[src]').forEach((img) => {
    const src = img.getAttribute('src') || ''
    if (REMOTE_URL_PATTERN.test(src) && !isAllowedDomain(src, options?.trustedDomains)) {
      img.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')
      img.setAttribute('alt', '[Image blocked]')
      img.setAttribute('style', 'opacity:0.3;max-width:20px;max-height:20px;')
      hasBlockedImages = true
    }
  })

  // Block remote background-image in inline styles
  doc.querySelectorAll('[style]').forEach((el) => {
    const style = el.getAttribute('style') || ''
    if (/url\s*\(\s*['"]?https?:\/\//i.test(style)) {
      const cleaned = style.replace(/background(-image)?\s*:\s*[^;]*url\s*\([^)]*\)[^;]*/gi, '')
      el.setAttribute('style', cleaned)
      hasBlockedImages = true
    }
  })

  return { html: doc.body.innerHTML, hasBlockedImages }
}

function isAllowedDomain(url: string, trustedDomains?: string[]): boolean {
  if (!trustedDomains?.length) return false
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return trustedDomains.some(d => hostname === d || hostname.endsWith(`.${d}`))
  } catch {
    return false
  }
}
