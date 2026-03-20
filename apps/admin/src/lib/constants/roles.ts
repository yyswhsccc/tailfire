export const ROLE_DISPLAY_NAMES: Record<string, string> = {
  admin: 'Admin',
  user: 'Agent',
  client_portal: 'Client',
}

export function getRoleDisplayName(role: string): string {
  return ROLE_DISPLAY_NAMES[role] ?? role
}
