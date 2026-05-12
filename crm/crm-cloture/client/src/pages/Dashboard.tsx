import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Inbox, FileText, CheckCircle2, Calendar, AlertTriangle, DollarSign, Users, MapPin } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Lead, Quote, User, Activity } from "@shared/schema";
import { LEAD_STATUSES, SALES_STATUSES } from "@shared/schema";

interface Stats {
  leadsCount: number; newLeads: number; quotesInProgress: number; quotesWon: number;
  installsPlanned: number; installsLate: number; estimatedValue: number; crewsCount: number; usersCount: number;
}

export function Dashboard() {
  const { data: stats } = useQuery<Stats>({ queryKey: ["/api/stats"] });
  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const { data: quotes = [] } = useQuery<Quote[]>({ queryKey: ["/api/quotes"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: activities = [] } = useQuery<Activity[]>({ queryKey: ["/api/activities"] });

  const moneyFmt = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

  // Pipeline groups
  const pipelineGroups: Array<{ key: string; label: string; items: Quote[] }> = [
    { key: "rdv_mesure", label: "Rendez-vous mesure", items: quotes.filter(q => q.salesStatus === "rdv_mesure") },
    { key: "envoyee", label: "Soumissions envoyées", items: quotes.filter(q => q.salesStatus === "envoyee") },
    { key: "suivi", label: "Suivi en cours", items: quotes.filter(q => q.salesStatus === "suivi") },
    { key: "rendez_vous", label: "Rendez-vous", items: quotes.filter(q => q.salesStatus === "rendez_vous") },
    { key: "signee", label: "Signées", items: quotes.filter(q => q.salesStatus === "signee") },
  ];

  // Sector groupings
  const sectorMap = new Map<string, { count: number; value: number; province: string }>();
  for (const l of leads) {
    const key = l.sector || "Non classé";
    const p = l.province || "??";
    const cur = sectorMap.get(key) || { count: 0, value: 0, province: p };
    cur.count += 1; cur.value += l.estimatedValue || 0;
    sectorMap.set(key, cur);
  }
  const topSectors = Array.from(sectorMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8);

  // Urgent actions
  const urgent: Array<{ label: string; href: string; tone: "danger" | "warning" | "info" }> = [];
  const unassignedLeads = leads.filter(l => !l.assignedSalesId && (l.status === "nouveau" || l.status === "a_qualifier"));
  if (unassignedLeads.length > 0) urgent.push({ label: `${unassignedLeads.length} lead(s) sans vendeur assigné`, href: "/dispatch-vendeur", tone: "danger" });
  const noInstaller = quotes.filter(q => q.salesStatus === "signee" && !q.assignedInstallerId);
  if (noInstaller.length > 0) urgent.push({ label: `${noInstaller.length} contrat(s) signé(s) sans installateur`, href: "/dispatch-installation", tone: "warning" });
  const unscheduled = quotes.filter(q => q.salesStatus === "signee" && q.installStatus === "a_planifier");
  if (unscheduled.length > 0) urgent.push({ label: `${unscheduled.length} installation(s) à planifier`, href: "/dispatch-installation", tone: "warning" });
  const pendingFollowup = quotes.filter(q => q.salesStatus === "envoyee" || q.salesStatus === "suivi" || q.salesStatus === "rendez_vous");
  if (pendingFollowup.length > 0) urgent.push({ label: `${pendingFollowup.length} soumission(s) en attente de signature`, href: "/soumissions", tone: "info" });

  return (
    <>
      <PageHeader
        title="Tableau de bord Admin"
        description="Vue d'ensemble du pipeline, des leads, des soumissions et des installations à travers le Canada."
      />
      <div className="p-6 lg:p-8 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard testId="kpi-new-leads" label="Nouveaux leads" value={stats?.newLeads ?? "—"} hint={`${stats?.leadsCount ?? 0} au total`} icon={<Inbox className="h-4 w-4" />} accent="info" />
          <KpiCard testId="kpi-in-progress" label="Soumissions en cours" value={stats?.quotesInProgress ?? "—"} icon={<FileText className="h-4 w-4" />} />
          <KpiCard testId="kpi-won" label="Soumissions gagnées" value={stats?.quotesWon ?? "—"} icon={<CheckCircle2 className="h-4 w-4" />} accent="success" />
          <KpiCard testId="kpi-installs" label="Installations planifiées" value={stats?.installsPlanned ?? "—"} icon={<Calendar className="h-4 w-4" />} />
          <KpiCard testId="kpi-late" label="Retards" value={stats?.installsLate ?? 0} icon={<AlertTriangle className="h-4 w-4" />} accent={stats && stats.installsLate > 0 ? "danger" : "default"} />
          <KpiCard testId="kpi-value" label="Valeur estimée" value={stats ? moneyFmt.format(stats.estimatedValue) : "—"} icon={<DollarSign className="h-4 w-4" />} accent="success" />
        </div>

        {/* Urgent actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Actions urgentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {urgent.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune action urgente. Tout est sous contrôle.</p>
            ) : (
              <ul className="space-y-2">
                {urgent.map((u, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 rounded-md border border-card-border bg-card p-3 hover-elevate">
                    <span className="text-sm">{u.label}</span>
                    <Link href={u.href}>
                      <Button size="sm" variant="outline" data-testid={`button-urgent-${i}`}>Traiter</Button>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Pipeline */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pipeline ventes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {pipelineGroups.map((g) => (
                  <div key={g.key} className="rounded-md border border-card-border bg-muted/30 p-3">
                    <div className="flex items-baseline justify-between mb-2">
                      <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{g.label}</div>
                      <div className="text-lg font-bold tabular">{g.items.length}</div>
                    </div>
                    <div className="text-[11px] text-muted-foreground tabular">
                      {moneyFmt.format(g.items.reduce((s, q) => s + (q.estimatedPrice || 0), 0))}
                    </div>
                    <ul className="mt-2 space-y-1">
                      {g.items.slice(0, 3).map(q => (
                        <li key={q.id} className="text-[12px] truncate">
                          <Link href={`/soumissions/${q.id}`}>
                            <span className="cursor-pointer hover:underline">{q.clientName}</span>
                          </Link>
                        </li>
                      ))}
                      {g.items.length > 3 && (
                        <li className="text-[11px] text-muted-foreground">+ {g.items.length - 3} de plus</li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Activity feed */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Activité récente</CardTitle>
            </CardHeader>
            <CardContent className="px-3">
              <ul className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {activities.slice(0, 12).map((a) => (
                  <li key={a.id} className="text-[12px] border-l-2 border-primary/40 pl-2.5 py-1">
                    <div className="text-foreground">{a.note || a.action}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {a.userName || "Système"} · {new Date(a.createdAt).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" })}
                    </div>
                  </li>
                ))}
                {activities.length === 0 && <li className="text-sm text-muted-foreground">Aucune activité.</li>}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Sectors */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Regroupement par secteur
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {topSectors.map(([sector, info]) => (
                <div key={sector} className="rounded-md border border-card-border bg-card p-3 hover-elevate">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <Badge variant="outline" className="text-[10px] font-semibold">{info.province}</Badge>
                    <span className="text-lg font-bold tabular">{info.count}</span>
                  </div>
                  <div className="text-[12px] font-medium truncate" title={sector}>{sector}</div>
                  <div className="text-[11px] text-muted-foreground tabular mt-0.5">{moneyFmt.format(info.value)}</div>
                </div>
              ))}
              {topSectors.length === 0 && <p className="text-sm text-muted-foreground">Aucun secteur.</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
