export interface SignatureData {
  firstName: string
  lastName: string
  designations?: string | null
  jobTitle?: string | null
  phoneExtension?: string | null
  avatarUrl?: string | null
  microSiteUrl?: string | null
  companyName: string
  companyPhone?: string | null
  companyAddress?: string | null
  ticoRegistration?: string | null
  tagline?: string | null
  showAvatar?: boolean
}

export function buildSignatureHtml(data: SignatureData): string {
  const parts: string[] = []

  // Line 1: Name, Designations | Title
  let nameLine = `<strong>${data.firstName} ${data.lastName}</strong>`
  if (data.designations) nameLine += `, ${data.designations}`
  if (data.jobTitle) nameLine += ` | ${data.jobTitle}`
  parts.push(nameLine)

  // Tagline (if set)
  if (data.tagline) {
    parts.push(`<em style="color:#6b7280;">${data.tagline}</em>`)
  }

  // MicroSite URL
  if (data.microSiteUrl) {
    parts.push(`<a href="${data.microSiteUrl}" style="color:#c59746;">${data.microSiteUrl}</a>`)
  }

  // Company name
  parts.push(data.companyName)

  // Phone with extension
  if (data.companyPhone) {
    let phoneLine = data.companyPhone
    if (data.phoneExtension) phoneLine += ` ext ${data.phoneExtension}`
    parts.push(phoneLine)
  }

  // Address
  if (data.companyAddress) {
    parts.push(data.companyAddress)
  }

  // TICO
  if (data.ticoRegistration) {
    parts.push(`<span style="font-size:11px;color:#6b7280;">TICO Ontario Registration No: ${data.ticoRegistration}</span>`)
  }

  // Build the HTML
  let html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#333;line-height:1.5;">'

  // Avatar (optional, floated left)
  if (data.showAvatar && data.avatarUrl) {
    html += `<img src="${data.avatarUrl}" alt="${data.firstName} ${data.lastName}" style="width:60px;height:60px;border-radius:50%;float:left;margin-right:12px;margin-bottom:8px;" />`
  }

  html += parts.join('<br />')
  html += '</div>'

  // Clear float
  if (data.showAvatar && data.avatarUrl) {
    html += '<div style="clear:both;"></div>'
  }

  return html
}
