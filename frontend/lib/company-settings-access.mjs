/** UI follows the company API: tenant recruiters may read; tenant admins may edit. */
export function companySettingsAccess(user) {
  const member = Boolean(user?.tenant_id) && ["admin", "recruiter"].includes(user?.role);
  return { read: member, edit: member && user.role === "admin" };
}
