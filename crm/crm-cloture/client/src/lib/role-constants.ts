export const DIRECTOR_ROLES = ["admin", "sales_director", "install_director"] as const;
export const ROLE_NAMES = {
  ADMIN: "admin",
  SALES_DIRECTOR: "sales_director",
  INSTALL_DIRECTOR: "install_director",
  SALES_REP: "sales_rep",
  INSTALLER: "installer",
} as const;

/** Rôles autorisés à déplacer une soumission entre colonnes du pipeline vente. */
export const SALES_PIPELINE_MOVE_ROLES = ["admin", "sales_director", "sales_rep"] as const;

export function canMoveSalesPipeline(role: string | undefined | null) {
  return !!role && (SALES_PIPELINE_MOVE_ROLES as readonly string[]).includes(role);
}
