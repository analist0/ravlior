// Client-side filter for the users table. The list is small (one row per staff account).

export interface StaffFilterRow {
  email: string;
  displayName: string | null;
  roles: readonly string[];
}

export function filterStaff<T extends StaffFilterRow>(users: T[], opts: { q?: string; role?: string }): T[] {
  const q = (opts.q ?? '').trim().toLowerCase();
  return users.filter((u) => {
    if (opts.role && !u.roles.includes(opts.role)) return false;
    if (!q) return true;
    return u.email.toLowerCase().includes(q) || (u.displayName ?? '').toLowerCase().includes(q);
  });
}
