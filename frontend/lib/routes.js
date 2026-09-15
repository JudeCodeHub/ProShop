export const HOME_BY_ROLE = {
  admin: "/admin/dashboard",
  cashier: "/pos",
};

export function homeFor(role) {
  return HOME_BY_ROLE[role] ?? "/login";
}

export function canAccess(role, pathname) {
  const isAdminArea = pathname === "/admin" || pathname.startsWith("/admin/");
  return isAdminArea ? role === "admin" : true;
}

export function destinationAfterLogin(role, next) {
  const isInternalPath =
    typeof next === "string" &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.includes("\\");
  if (!isInternalPath) {
    return homeFor(role);
  }

  const pathname = next.split(/[?#]/)[0];
  if (pathname === "/" || pathname === "/login" || pathname.startsWith("/api/")) {
    return homeFor(role);
  }
  return canAccess(role, pathname) ? next : homeFor(role);
}
