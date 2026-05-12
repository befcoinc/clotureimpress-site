import { createContext, useContext, useState, ReactNode } from "react";
import type { User } from "@shared/schema";

export type RoleKey = "admin" | "sales_director" | "install_director" | "sales_rep" | "installer";

interface RoleContextValue {
  currentUser: User | null;
  setCurrentUser: (u: User | null) => void;
  role: RoleKey;
  can: (perm: Permission) => boolean;
}

export type Permission =
  | "view_admin"
  | "view_sales"
  | "view_install"
  | "view_sectors"
  | "edit_lead"
  | "edit_sales"
  | "edit_install"
  | "edit_price"
  | "assign_sales"
  | "assign_installer"
  | "view_all_quotes"
  | "view_own_quotes";

const RoleContext = createContext<RoleContextValue | null>(null);

const PERMISSIONS: Record<RoleKey, Permission[]> = {
  admin: [
    "view_admin", "view_sales", "view_install", "view_sectors",
    "edit_lead", "edit_sales", "edit_install", "edit_price",
    "assign_sales", "assign_installer", "view_all_quotes",
  ],
  sales_director: [
    "view_admin", "view_sales", "view_install", "view_sectors",
    "edit_lead", "edit_sales", "edit_price",
    "assign_sales", "view_all_quotes",
  ],
  install_director: [
    "view_admin", "view_sales", "view_install", "view_sectors",
    "edit_install", "edit_price",
    "assign_installer", "view_all_quotes",
  ],
  sales_rep: [
    "view_sales", "edit_sales", "edit_lead", "view_own_quotes",
  ],
  installer: [
    "view_install", "edit_install", "view_own_quotes",
  ],
};

export function RoleProvider({ children, initialUser }: { children: ReactNode; initialUser: User | null }) {
  const [currentUser, setCurrentUser] = useState<User | null>(initialUser);
  const role = (currentUser?.role || "admin") as RoleKey;
  const can = (perm: Permission) => PERMISSIONS[role]?.includes(perm) ?? false;
  return (
    <RoleContext.Provider value={{ currentUser, setCurrentUser, role, can }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within RoleProvider");
  return ctx;
}
