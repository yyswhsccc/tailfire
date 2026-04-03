import type { ContactListItemDto } from '@tailfire/shared-types/api'

export function openContactPrintReport(contacts: ContactListItemDto[]) {
  const rows = contacts.map(c => `
    <tr>
      <td>${esc(c.firstName)} ${esc(c.lastName)}</td>
      <td>${esc(c.email)}</td>
      <td>${esc(c.phone)}</td>
      <td>${esc(c.contactType === 'lead' ? 'Lead' : 'Client')}</td>
      <td>${esc(statusLabel(c.contactStatus))}</td>
      <td>${esc(c.city)}${c.province ? `, ${esc(c.province)}` : ''}</td>
      <td>${c.dateOfBirth ? new Date(c.dateOfBirth).toLocaleDateString('en-CA') : ''}</td>
      <td>${(c.tags || []).join(', ')}</td>
    </tr>
  `).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Contact Report - Phoenix Voyages</title>
  <style>
    @page { margin: 1cm; size: landscape; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; color: #1a1a1a; padding: 20px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #1a1a1a; }
    .header h1 { font-size: 18px; font-weight: 700; }
    .header .meta { font-size: 10px; color: #666; text-align: right; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f4f4f5; font-weight: 600; text-align: left; padding: 6px 8px; border-bottom: 2px solid #d4d4d8; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #52525b; }
    td { padding: 5px 8px; border-bottom: 1px solid #e4e4e7; }
    tr:nth-child(even) { background: #fafafa; }
    .footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #d4d4d8; font-size: 9px; color: #888; display: flex; justify-content: space-between; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Contact Report</h1>
    <div class="meta">
      <div>Phoenix Voyages — TICO #50017089</div>
      <div>${contacts.length} contact${contacts.length !== 1 ? 's' : ''} — Generated ${new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Email</th>
        <th>Phone</th>
        <th>Type</th>
        <th>Status</th>
        <th>Location</th>
        <th>DOB</th>
        <th>Tags</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <div class="footer">
    <span>Phoenix Voyages — Confidential</span>
    <span>Page 1</span>
  </div>
  <div class="no-print" style="margin-top:20px;text-align:center;">
    <button onclick="window.print()" style="padding:8px 24px;background:#1a1a1a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">Print / Save as PDF</button>
  </div>
</body>
</html>`

  const w = window.open('', '_blank')
  if (w) {
    w.document.write(html)
    w.document.close()
  }
}

function esc(val: string | null | undefined): string {
  if (!val) return ''
  return val.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function statusLabel(status: string | null): string {
  switch (status) {
    case 'prospecting': return 'Prospecting'
    case 'quoted': return 'Quoted'
    case 'booked': return 'Booked'
    case 'traveling': return 'Traveling'
    case 'returned': return 'Returned'
    case 'awaiting_next': return 'Awaiting Next'
    case 'inactive': return 'Inactive'
    default: return status || ''
  }
}
