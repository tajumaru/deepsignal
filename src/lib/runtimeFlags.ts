export const REQUIRE_GLOBAL_WALRUS_RUNTIME =
  String(import.meta.env.VITE_REQUIRE_WALRUS || "").toLowerCase() === "true";
