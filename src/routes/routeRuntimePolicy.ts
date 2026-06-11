export type InitialBlockingMode = "defer" | "eager" | "none";

export type PolicyRouteId =
  | "admin-workspace"
  | "landing"
  | "form-create"
  | "form-compose"
  | "admin-create-form"
  | "dashboard-workspace"
  | "my-responses"
  | "private-unmapped"
  | "public-form"
  | "public-roadmap"
  | "manifest-restore"
  | "public-auth"
  | "submitted-history"
  | "troubleshooting";

export type RouteRuntimeMetadata = {
  optionalWallet: boolean;
  publicRoute: boolean;
  walletRequired: boolean;
  policyId: PolicyRouteId;
  requiresWallet: boolean;
  showWalletUi: boolean;
  mountWalletProviders: boolean;
  initialBlockingMode: InitialBlockingMode;
  isDashboardRoot: boolean;
};

export const POLICY_IDS = {
  ADMIN_WORKSPACE: "admin-workspace",
  CREATE: "form-create",
  CREATE_NEW_FORM: "admin-create-form",
  CREATE_COMPOSE: "form-compose",
  DASHBOARD: "dashboard-workspace",
  LANDING: "landing",
  MY_RESPONSES: "my-responses",
  PRIVATE_UNMAPPED: "private-unmapped",
  PUBLIC_FORM: "public-form",
  PUBLIC_AUTH: "public-auth",
  PUBLIC_ROADMAP: "public-roadmap",
  MANIFEST_RESTORE: "manifest-restore",
  SUBMISSIONS: "submitted-history",
  TROUBLESHOOTING: "troubleshooting",
} as const;

function getPathname(routePath: string) {
  return routePath.split(/[?#]/)[0] || "/";
}

type PolicyRule = {
  policyId: PolicyRouteId;
  initialBlockingMode: InitialBlockingMode;
  match: RegExp;
  mountWalletProviders: boolean;
  optionalWallet: boolean;
  publicRoute: boolean;
  requiresWallet: boolean;
  showWalletUi: boolean;
  isDashboardRoot?: boolean;
};

const ROUTE_POLICY_RULES: readonly PolicyRule[] = [
  {
    policyId: POLICY_IDS.LANDING,
    match: /^\/$/,
    publicRoute: true,
    showWalletUi: false,
    mountWalletProviders: false,
    requiresWallet: false,
    optionalWallet: false,
    initialBlockingMode: "none",
  },
  {
    policyId: POLICY_IDS.PUBLIC_FORM,
    match: /^\/f\//,
    publicRoute: true,
    showWalletUi: false,
    mountWalletProviders: false,
    requiresWallet: false,
    optionalWallet: false,
    initialBlockingMode: "none",
  },
  {
    policyId: POLICY_IDS.PUBLIC_ROADMAP,
    match: /^\/roadmap\//,
    publicRoute: true,
    showWalletUi: false,
    mountWalletProviders: false,
    requiresWallet: false,
    optionalWallet: false,
    initialBlockingMode: "none",
  },
  {
    policyId: POLICY_IDS.MANIFEST_RESTORE,
    match: /^\/m\//,
    publicRoute: true,
    showWalletUi: false,
    mountWalletProviders: false,
    requiresWallet: false,
    optionalWallet: false,
    initialBlockingMode: "none",
  },
  {
    policyId: POLICY_IDS.PUBLIC_AUTH,
    match: /^\/auth\/zklogin\//,
    publicRoute: true,
    showWalletUi: false,
    mountWalletProviders: false,
    requiresWallet: false,
    optionalWallet: false,
    initialBlockingMode: "none",
  },
  {
    policyId: POLICY_IDS.DASHBOARD,
    match: /^\/dashboard$/,
    publicRoute: false,
    showWalletUi: true,
    mountWalletProviders: false,
    requiresWallet: false,
    optionalWallet: true,
    initialBlockingMode: "defer",
    isDashboardRoot: true,
  },
  {
    policyId: POLICY_IDS.CREATE,
    match: /^\/create$/,
    publicRoute: false,
    showWalletUi: true,
    mountWalletProviders: false,
    requiresWallet: false,
    optionalWallet: true,
    initialBlockingMode: "defer",
  },
  {
    policyId: POLICY_IDS.CREATE,
    match: /^\/compose$/,
    publicRoute: false,
    showWalletUi: true,
    mountWalletProviders: false,
    requiresWallet: false,
    optionalWallet: true,
    initialBlockingMode: "defer",
  },
  {
    policyId: POLICY_IDS.CREATE_NEW_FORM,
    match: /^\/admin\/forms\/new$/,
    publicRoute: false,
    showWalletUi: false,
    mountWalletProviders: false,
    requiresWallet: false,
    optionalWallet: false,
    initialBlockingMode: "none",
  },
  {
    policyId: POLICY_IDS.TROUBLESHOOTING,
    match: /^\/troubleshooting$/,
    publicRoute: false,
    showWalletUi: true,
    mountWalletProviders: true,
    requiresWallet: false,
    optionalWallet: true,
    initialBlockingMode: "eager",
  },
  {
    policyId: POLICY_IDS.SUBMISSIONS,
    match: /^\/(?:my-submissions|submitted)(?:\/.*)?$/,
    publicRoute: false,
    showWalletUi: true,
    mountWalletProviders: true,
    requiresWallet: false,
    optionalWallet: true,
    initialBlockingMode: "eager",
  },
  {
    policyId: POLICY_IDS.MY_RESPONSES,
    match: /^\/my-responses(?:\/.*)?$/,
    publicRoute: false,
    showWalletUi: false,
    mountWalletProviders: false,
    requiresWallet: false,
    optionalWallet: false,
    initialBlockingMode: "none",
  },
  {
    policyId: POLICY_IDS.ADMIN_WORKSPACE,
    match: /^\/admin(?:\/.*)?$/,
    publicRoute: false,
    showWalletUi: true,
    mountWalletProviders: true,
    requiresWallet: false,
    optionalWallet: true,
    initialBlockingMode: "eager",
  },
  {
    policyId: POLICY_IDS.ADMIN_WORKSPACE,
    match: /^\/dashboard(?:\/.*)?$/,
    publicRoute: false,
    showWalletUi: true,
    mountWalletProviders: true,
    requiresWallet: false,
    optionalWallet: true,
    initialBlockingMode: "defer",
  },
];

function findRouteRule(pathname: string) {
  return ROUTE_POLICY_RULES.find((rule) => rule.match.test(pathname));
}

export function getRouteRuntimeMetadata(routePath: string): RouteRuntimeMetadata {
  const pathname = getPathname(routePath);
  const routeRule = findRouteRule(pathname);

  if (!routeRule) {
    return {
      optionalWallet: false,
      publicRoute: false,
      walletRequired: false,
      policyId: POLICY_IDS.PRIVATE_UNMAPPED,
      requiresWallet: false,
      showWalletUi: false,
      mountWalletProviders: false,
      initialBlockingMode: "none",
      isDashboardRoot: false,
    };
  }

  return {
    optionalWallet: routeRule.optionalWallet,
    publicRoute: routeRule.publicRoute,
    walletRequired: routeRule.requiresWallet,
    policyId: routeRule.policyId,
    requiresWallet: routeRule.requiresWallet,
    showWalletUi: routeRule.showWalletUi,
    mountWalletProviders: routeRule.mountWalletProviders,
    initialBlockingMode: routeRule.initialBlockingMode,
    isDashboardRoot: Boolean(routeRule.isDashboardRoot),
  };
}

export function shouldMountWalletProviders(routePath: string) {
  return getRouteRuntimeMetadata(routePath).mountWalletProviders;
}

export function shouldShowWalletUi(routePath: string) {
  return getRouteRuntimeMetadata(routePath).showWalletUi;
}

export function isDashboardRoute(routePath: string) {
  const pathname = getPathname(routePath);
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

export function isDashboardRootRoute(routePath: string) {
  return getPathname(routePath) === "/dashboard";
}

export function shouldHashRoute(routePath: string) {
  const pathname = getPathname(routePath);
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/create" ||
    pathname === "/compose" ||
    pathname === "/troubleshooting"
  );
}

export function isPublicRoutePath(routePath: string) {
  return getRouteRuntimeMetadata(routePath).publicRoute;
}

export function usesPublicChrome(routePath: string) {
  return getRouteRuntimeMetadata(routePath).publicRoute;
}

export function requiresWorkspaceBoot(routePath: string) {
  const pathname = getPathname(routePath);
  if (usesPublicChrome(routePath)) {
    return false;
  }
  return pathname !== "/explore" && pathname !== "/signals";
}
