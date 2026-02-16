type AdminRole = string | null

/** Only super_admin */
export function isSuperAdmin(role: AdminRole): boolean {
  return role === 'super_admin'
}

/** super_admin or admin */
export function isFullAdmin(role: AdminRole): boolean {
  return role === 'super_admin' || role === 'admin'
}

/** Any admin role (super_admin, admin, or chapter_admin) */
export function isAdmin(role: AdminRole): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'chapter_admin'
}
