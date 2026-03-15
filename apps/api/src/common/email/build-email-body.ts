export interface BuildEmailBodyOptions {
  signatureHtml?: string | null
  complianceFooter?: string | null
}

/**
 * Appends agent signature and compliance footer to email HTML content.
 * Used by both EmailService (transactional) and SmtpSendService (agent-composed).
 */
export function buildEmailBody(
  contentHtml: string,
  options: BuildEmailBodyOptions,
): string {
  let html = contentHtml

  if (options.signatureHtml) {
    html += '<br><div class="email-signature">' + options.signatureHtml + '</div>'
  }

  if (options.complianceFooter) {
    html +=
      '<hr style="border:none;border-top:1px solid #ccc;margin:20px 0">'
    html +=
      '<div class="email-footer" style="font-size:11px;color:#666">' +
      options.complianceFooter +
      '</div>'
  }

  return html
}
