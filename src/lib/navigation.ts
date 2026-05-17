export function isSignalInboxPath(pathname: string) {
  return (
    pathname === "/admin" ||
    pathname === "/dashboard" ||
    pathname.startsWith("/admin/forms") ||
    pathname.startsWith("/admin/submissions") ||
    pathname.startsWith("/dashboard/forms")
  );
}
