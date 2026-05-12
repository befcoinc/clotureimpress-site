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
import { cn } from "@/lib/utils";
import type { Permission } from "@/lib/role-context";
import type { Quote } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface NavItem {
  href: string;
  label: string;
  icon: any;
  perm?: Permission;
  badge?: string;
}

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Opérations",
    items: [
      { href: "/", label: "Tableau de bord", icon: LayoutDashboard, perm: "view_admin" },
      { href: "/leads", label: "Leads Intimura", icon: Inbox, perm: "view_sales" },
      { href: "/intimura", label: "Import Intimura", icon: UploadCloud, perm: "edit_lead", badge: "source" },
      { href: "/dispatch-vendeur", label: "Dispatch vendeur", icon: UserCheck, perm: "assign_sales" },
      { href: "/soumissions", label: "Soumissions", icon: FileText, perm: "view_sales" },
      { href: "/calendrier", label: "Calendrier partagé", icon: CalendarDays, badge: "team" },
      { href: "/dispatch-installation", label: "Dispatch installation", icon: Wrench, perm: "view_install" },
      { href: "/heatmap", label: "Heatmap secteurs", icon: Flame, perm: "view_sectors", badge: "hot" },
    ],
  },
  {
    label: "Pilotage",
    items: [
      { href: "/tableau-ventes", label: "Tableau ventes", icon: ShieldCheck, perm: "view_sales" },
      { href: "/tableau-installation", label: "Tableau installation", icon: Hammer, perm: "view_install" },
      { href: "/secteurs", label: "Secteurs & planification", icon: MapPin, perm: "view_sectors" },
    ],
  },
  {
    label: "Système",
    items: [
      { href: "/utilisateurs", label: "Utilisateurs & rôles", icon: Users },
      { href: "/architecture", label: "Architecture CRM", icon: Network },
    ],
  },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { can, role, currentUser } = useRole();
  const { logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden md:flex md:w-64 lg:w-72 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="px-5 pt-5 pb-4 border-b border-sidebar-border">
          <Logo />
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-3">
          {NAV_SECTIONS.map((section) => {
            const visible = section.items.filter((it) => !it.perm || can(it.perm));
            if (visible.length === 0) return null;
            return (
              <div key={section.label} className="mb-5">
                <div className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/40">
                  {section.label}
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
                              "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium cursor-pointer transition-colors hover-elevate",
                              isActive
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "text-sidebar-foreground/80 hover:text-sidebar-foreground"
                            )}
                          >
                            <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                            <span className="truncate">{item.label}</span>
                            {item.badge && (
                              <span className="ml-auto rounded-full bg-sidebar-primary px-1.5 py-0.5 text-[10px] font-semibold text-sidebar-primary-foreground">
                                {item.badge}
                              </span>
                            )}
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

        <div className="px-4 py-3 border-t border-sidebar-border space-y-2">
          {/* Admin-only: impersonate another user */}
          {role === "admin" && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/40 mb-1.5">
                Vue simulée
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
              title="Se déconnecter"
              onClick={() => logout()}
              className="shrink-0 rounded-md p-1.5 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="md:hidden border-b border-border bg-sidebar text-sidebar-foreground px-4 py-3 flex items-center justify-between">
          <Logo />
          <RoleSwitcher compact />
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
          <div className="text-sm font-semibold">Dossiers à mettre à jour</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Ces soumissions ouvertes n’ont pas été mises à jour depuis plus de 24 h.
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
                  <div className="mt-0.5 text-xs text-muted-foreground">{quote.city || "Ville non définie"} · dernière mise à jour : {lastUpdate ? lastUpdate.toLocaleDateString("fr-CA") : "à confirmer"}</div>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">Relance</Badge>
              </div>
              <Link href={`/soumissions/${quote.id}`}>
                <Button size="sm" className="mt-2 h-8 w-full" data-testid={`button-open-reminder-${quote.id}`}>
                  Ouvrir et cocher l’étape
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
