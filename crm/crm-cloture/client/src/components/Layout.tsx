import { ReactNode, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Inbox, UserCheck, FileText, Wrench, MapPin, CalendarDays,
  Network, Users, ShieldCheck, Hammer, UploadCloud, Flame, AlertTriangle, X, LogOut,
} from "lucide-react";
import { Logo } from "./Logo";
import { RoleSwitcher } from "./RoleSwitcher";
import { useRole } from "@/lib/role-context";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { cn } from "@/lib/utils";
import type { Permission } from "@/lib/role-context";
import type { InstallerApplication, Lead, Quote } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface NavItem {
  href: string;
  labelKey:
    | "nav.dashboard"
    | "nav.leads"
    | "nav.intimuraImport"
    | "nav.salesDispatch"
    | "nav.quotes"
    | "nav.sharedCalendar"
    | "nav.installDispatch"
    | "nav.sectorHeatmap"
    | "nav.salesBoard"
    | "nav.installBoard"
    | "nav.installerProfile"    | "nav.installerApplications"    | "nav.sectorsPlanning"
    | "nav.usersRoles"
    | "nav.architecture";
  icon: any;
  perm?: Permission;
  roles?: Array<"admin" | "sales_director" | "install_director" | "sales_rep" | "installer">;
  badge?: string;
}

const NAV_SECTIONS: { labelKey: "nav.operations" | "nav.pilotage" | "nav.system"; items: NavItem[] }[] = [
  {
    labelKey: "nav.operations",
    items: [
      { href: "/", labelKey: "nav.dashboard", icon: LayoutDashboard, perm: "view_admin" },
      { href: "/leads", labelKey: "nav.leads", icon: Inbox, perm: "view_sales" },
      { href: "/dispatch-vendeur", labelKey: "nav.salesDispatch", icon: UserCheck, perm: "assign_sales" },
      { href: "/soumissions", labelKey: "nav.quotes", icon: FileText, perm: "view_sales" },
      { href: "/calendrier", labelKey: "nav.sharedCalendar", icon: CalendarDays, badge: "team" },
      { href: "/dispatch-installation", labelKey: "nav.installDispatch", icon: Wrench, perm: "view_install" },
      { href: "/ma-fiche-sous-traitant", labelKey: "nav.installerProfile", icon: FileText, roles: ["installer"] },
      { href: "/heatmap", labelKey: "nav.sectorHeatmap", icon: Flame, perm: "view_sectors", badge: "hot" },
    ],
  },
  {
    labelKey: "nav.pilotage",
    items: [
      { href: "/tableau-ventes", labelKey: "nav.salesBoard", icon: ShieldCheck, perm: "view_sales" },
      { href: "/tableau-installation", labelKey: "nav.installBoard", icon: Hammer, perm: "view_install" },
      { href: "/secteurs", labelKey: "nav.sectorsPlanning", icon: MapPin, perm: "view_sectors" },
    ],
  },
  {
    labelKey: "nav.system",
    items: [
      { href: "/applications-installateurs", labelKey: "nav.installerApplications", icon: Hammer, perm: "view_admin" },
      { href: "/utilisateurs", labelKey: "nav.usersRoles", icon: Users, perm: "view_admin" },
      { href: "/architecture", labelKey: "nav.architecture", icon: Network, perm: "view_admin" },
    ],
  },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { can, role, currentUser } = useRole();
  const { logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["/api/leads"], enabled: can("view_sales") || can("assign_sales") });
  const unassignedLeadsCount = useMemo(() => leads.filter((lead) => lead.status !== "test" && !lead.assignedSalesId).length, [leads]);
  const { data: installerApps = [] } = useQuery<InstallerApplication[]>({ queryKey: ["/api/installer-applications"], enabled: can("view_admin") });
  const pendingAppsCount = useMemo(() => installerApps.filter((a) => a.status === "en_attente").length, [installerApps]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-40 md:flex md:w-60 lg:w-64 md:h-screen overflow-hidden bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="flex h-full min-h-0 w-full flex-col">
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-sidebar-border space-y-2.5">
          <Logo />
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/40 mb-1.5">
              {t("lang.label")}
            </div>
            <div className="flex rounded-md border border-sidebar-border overflow-hidden">
              <button
                type="button"
                onClick={() => setLanguage("fr")}
                data-testid="button-lang-fr"
                className={cn(
                  "h-8 flex-1 text-[11px] font-semibold",
                  language === "fr" ? "bg-sidebar-primary text-sidebar-primary-foreground" : "bg-sidebar-accent text-sidebar-foreground/70"
                )}
              >
                {t("lang.fr")}
              </button>
              <button
                type="button"
                onClick={() => setLanguage("en")}
                data-testid="button-lang-en"
                className={cn(
                  "h-8 flex-1 text-[11px] font-semibold border-l border-sidebar-border",
                  language === "en" ? "bg-sidebar-primary text-sidebar-primary-foreground" : "bg-sidebar-accent text-sidebar-foreground/70"
                )}
              >
                {t("lang.en")}
              </button>
            </div>
          </div>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-2.5 px-2.5">
          {NAV_SECTIONS.map((section) => {
            const visible = section.items.filter((it) => {
              const permOk = !it.perm || can(it.perm);
              const roleOk = !it.roles || it.roles.includes(role as any);
              return permOk && roleOk;
            });
            if (visible.length === 0) return null;
            return (
              <div key={section.labelKey} className="mb-4">
                <div className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/40">
                  {t(section.labelKey)}
                </div>
                <ul className="space-y-0.5">
                  {visible.map((item) => {
                    const isActive =
                      location === item.href ||
                      (item.href !== "/" && location.startsWith(item.href));
                    return (
                      <li key={item.href}>
                        <Link href={item.href}>
                          <div
                            data-testid={`nav-${item.href.replace(/\//g, "-")}`}
                            className={cn(
                              "group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium cursor-pointer transition-colors hover-elevate",
                              isActive
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "text-sidebar-foreground/80 hover:text-sidebar-foreground"
                            )}
                          >
                            <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                            <span className="truncate">{t(item.labelKey)}</span>
                            {item.href === "/dispatch-vendeur" && unassignedLeadsCount > 0 ? (
                              <span className="ml-auto rounded-full bg-sidebar-primary px-1.5 py-0.5 text-[10px] font-semibold text-sidebar-primary-foreground">
                                {unassignedLeadsCount}
                              </span>
                            ) : item.href === "/applications-installateurs" && pendingAppsCount > 0 ? (
                              <span className="ml-auto rounded-full bg-sidebar-primary px-1.5 py-0.5 text-[10px] font-semibold text-sidebar-primary-foreground">
                                {pendingAppsCount}
                              </span>
                            ) : item.badge ? (
                              <span className="ml-auto rounded-full bg-sidebar-primary px-1.5 py-0.5 text-[10px] font-semibold text-sidebar-primary-foreground">
                                {item.badge}
                              </span>
                            ) : null}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 px-3.5 py-2.5 border-t border-sidebar-border space-y-1.5">
          {/* Admin-only: impersonate another user */}
          {role === "admin" && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/40 mb-1.5">
                {t("layout.simulatedView")}
              </div>
              <RoleSwitcher />
            </div>
          )}
          {/* Current user + logout */}
          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium truncate">{currentUser?.name}</div>
              <div className="text-[10px] text-sidebar-foreground/50 truncate">{currentUser?.email}</div>
            </div>
            <button
              type="button"
              title={t("layout.logout")}
              onClick={() => logout()}
              className="shrink-0 rounded-md p-1.5 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="min-w-0 flex min-h-screen flex-col md:ml-60 lg:ml-64">
        <header className="md:hidden border-b border-border bg-sidebar text-sidebar-foreground px-4 py-3 flex items-center justify-between gap-2">
          <Logo />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setLanguage("fr")}
              data-testid="button-lang-fr-mobile"
              className={cn(
                "h-8 rounded-md px-2 text-[10px] font-semibold border border-sidebar-border",
                language === "fr" ? "bg-sidebar-primary text-sidebar-primary-foreground" : "bg-sidebar-accent text-sidebar-foreground/70"
              )}
            >
              {t("lang.fr")}
            </button>
            <button
              type="button"
              onClick={() => setLanguage("en")}
              data-testid="button-lang-en-mobile"
              className={cn(
                "h-8 rounded-md px-2 text-[10px] font-semibold border border-sidebar-border",
                language === "en" ? "bg-sidebar-primary text-sidebar-primary-foreground" : "bg-sidebar-accent text-sidebar-foreground/70"
              )}
            >
              {t("lang.en")}
            </button>
            <RoleSwitcher compact />
          </div>
        </header>
        <div className="flex-1 min-w-0 overflow-x-hidden">{children}</div>
        <UpdateReminderPopup canViewSales={can("view_sales")} currentUserId={currentUser?.id} role={role} />
      </main>
    </div>
  );
}

function UpdateReminderPopup({ canViewSales, currentUserId, role }: { canViewSales: boolean; currentUserId?: number; role: string }) {
  const [dismissed, setDismissed] = useState(false);
  const { data: quotes = [] } = useQuery<Quote[]>({ queryKey: ["/api/quotes"], enabled: canViewSales });
  const { language, t } = useLanguage();

  const reminders = useMemo(() => {
    if (!canViewSales) return [];
    const now = Date.now();
    return quotes
      .filter(q => !["perdue"].includes(q.salesStatus))
      .filter(q => !timelineHas(q.timeline, ["Paiement final", "Payée", "Payé"]))
      .filter(q => {
        if (role === "sales_rep") return q.assignedSalesId === currentUserId;
        return role === "admin" || role === "sales_director";
      })
      .map(q => ({ quote: q, lastUpdate: lastUpdateTime(q) }))
      .filter(item => !item.lastUpdate || now - item.lastUpdate.getTime() > 24 * 60 * 60 * 1000)
      .slice(0, 6);
  }, [canViewSales, currentUserId, quotes, role]);

  if (dismissed || reminders.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(420px,calc(100vw-2rem))] rounded-xl border border-warning/30 bg-card shadow-2xl" data-testid="popup-update-reminders">
      <div className="flex items-start gap-3 border-b border-border p-4">
        <div className="mt-0.5 rounded-full bg-warning/15 p-2 text-warning">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{t("reminder.title")}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("reminder.description")}
          </p>
        </div>
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setDismissed(true)}
          data-testid="button-dismiss-update-reminders"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-[320px] overflow-y-auto p-3">
        <div className="space-y-2">
          {reminders.map(({ quote, lastUpdate }) => (
            <div key={quote.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{quote.clientName}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {quote.city || t("reminder.cityUndefined")} · {t("reminder.lastUpdate")} : {lastUpdate ? lastUpdate.toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA") : t("reminder.toConfirm")}
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">{t("reminder.followup")}</Badge>
              </div>
              <Link href={`/soumissions/${quote.id}`}>
                <Button size="sm" className="mt-2 h-8 w-full" data-testid={`button-open-reminder-${quote.id}`}>
                  {t("reminder.openAndCheck")}
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function parseTimeline(value?: string | null): Array<{ step?: string; date?: string }> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function timelineHas(timeline?: string | null, labels: string[] = []) {
  return parseTimeline(timeline).some(item => item.step && labels.includes(item.step));
}

function lastUpdateTime(quote: Quote) {
  const dates = parseTimeline(quote.timeline)
    .map(item => item.date ? new Date(item.date) : null)
    .filter((date): date is Date => !!date && !Number.isNaN(date.getTime()));
  const created = quote.createdAt ? new Date(quote.createdAt) : null;
  if (created && !Number.isNaN(created.getTime())) dates.push(created);
  if (dates.length === 0) return null;
  return dates.sort((a, b) => b.getTime() - a.getTime())[0];
}
