import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Inbox, FileText, CheckCircle2, Calendar, AlertTriangle, DollarSign, Users, MapPin, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { useRole } from "@/lib/role-context";
import { DIRECTOR_ROLES } from "@/lib/role-constants";
import type { Lead, Quote, User, Activity } from "@shared/schema";
import { LEAD_STATUSES, SALES_STATUSES } from "@shared/schema";
import { computeWeightedPipeline } from "@/lib/win-probability";

interface Stats {
  leadsCount: number; newLeads: number; quotesInProgress: number; quotesWon: number;
  installsPlanned: number; installsLate: number; estimatedValue: number; crewsCount: number; usersCount: number;
}

export function Dashboard() {
  const { language } = useLanguage();
  const { can } = useRole();
  const { data: stats } = useQuery<Stats>({ queryKey: ["/api/stats"] });
  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const { data: quotes = [] } = useQuery<Quote[]>({ queryKey: ["/api/quotes"] });
  const { data: activities = [] } = useQuery<Activity[]>({ queryKey: ["/api/activities"] });
  const [openSector, setOpenSector] = useState<string | null>(null);

  const isEn = language === "en";
  const moneyFmt = new Intl.NumberFormat(isEn ? "en-CA" : "fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
  const activeLeads = leads.filter(l => l.status !== "test");
  
  // Calculate weighted pipeline
  const inProgressQuotes = quotes.filter(q => !["signee", "perdue"].includes(q.salesStatus));
  const weightedValue = computeWeightedPipeline(
    inProgressQuotes.map((q) => ({
      estimatedPrice: q.estimatedPrice ?? undefined,
      salesStatus: q.salesStatus,
    })),
  );

  // Pipeline groups
  const pipelineGroups: Array<{ key: string; label: string; items: Quote[] }> = [
    { key: "rdv_mesure", label: isEn ? "Measurement appointment" : "Rendez-vous mesure", items: quotes.filter(q => q.salesStatus === "rdv_mesure") },
    { key: "envoyee", label: isEn ? "Sent quotes" : "Soumissions envoyées", items: quotes.filter(q => q.salesStatus === "envoyee") },
    { key: "suivi", label: isEn ? "Follow-up" : "Suivi en cours", items: quotes.filter(q => q.salesStatus === "suivi") },
    { key: "rendez_vous", label: isEn ? "Appointments" : "Rendez-vous", items: quotes.filter(q => q.salesStatus === "rendez_vous") },
    { key: "signee", label: isEn ? "Signed" : "Signées", items: quotes.filter(q => q.salesStatus === "signee") },
  ];

  // Sector groupings
  const sectorMap = new Map<string, { count: number; value: number; province: string }>();
  for (const l of activeLeads) {
    const key = l.sector || (isEn ? "Uncategorized" : "Non classé");
    const p = l.province || "??";
    const cur = sectorMap.get(key) || { count: 0, value: 0, province: p };
    cur.count += 1; cur.value += l.estimatedValue || 0;
    sectorMap.set(key, cur);
  }
  const topSectors = Array.from(sectorMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8);

  // Precompute sector-to-quotes mapping
  const sectorQuotesMap = useMemo(() => {
    const map = new Map<string, Quote[]>();
    for (const [sector] of topSectors) {
      const sectorLeadIds = new Set(activeLeads.filter(l => l.sector === sector).map(l => l.id));
      map.set(sector, quotes.filter(q => q.leadId && sectorLeadIds.has(q.leadId)));
    }
    return map;
  }, [topSectors, activeLeads, quotes]);

  // Urgent actions
  const urgent: Array<{ label: string; href: string; tone: "danger" | "warning" | "info" }> = [];
  const unassignedLeads = activeLeads.filter(l => !l.assignedSalesId && (l.status === "nouveau" || l.status === "a_qualifier"));
  if (unassignedLeads.length > 0) urgent.push({ label: isEn ? `${unassignedLeads.length} lead(s) without assigned rep` : `${unassignedLeads.length} lead(s) sans vendeur assigné`, href: "/dispatch-vendeur", tone: "danger" });
  const noInstaller = quotes.filter(q => q.salesStatus === "signee" && !q.assignedInstallerId);
  if (noInstaller.length > 0) urgent.push({ label: isEn ? `${noInstaller.length} signed contract(s) without installer` : `${noInstaller.length} contrat(s) signé(s) sans installateur`, href: "/dispatch-installation", tone: "warning" });
  const unscheduled = quotes.filter(q => q.salesStatus === "signee" && q.installStatus === "a_planifier");
  if (unscheduled.length > 0) urgent.push({ label: isEn ? `${unscheduled.length} installation(s) to schedule` : `${unscheduled.length} installation(s) à planifier`, href: "/dispatch-installation", tone: "warning" });
  const pendingFollowup = quotes.filter(q => q.salesStatus === "envoyee" || q.salesStatus === "suivi" || q.salesStatus === "rendez_vous");
  if (pendingFollowup.length > 0) urgent.push({ label: isEn ? `${pendingFollowup.length} quote(s) waiting for signature` : `${pendingFollowup.length} soumission(s) en attente de signature`, href: "/soumissions", tone: "info" });

  return (
    <>
      <PageHeader
        title={isEn ? "Admin Dashboard" : "Tableau de bord Admin"}
        description={isEn ? "Pipeline, leads, quotes and installation overview across Canada." : "Vue d'ensemble du pipeline, des leads, des soumissions et des installations à travers le Canada."}
      />
      <div className="p-6 lg:p-8 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard testId="kpi-new-leads" label={isEn ? "New leads" : "Nouveaux leads"} value={stats?.newLeads ?? "—"} hint={`${stats?.leadsCount ?? 0} ${isEn ? "total" : "au total"}`} icon={<Inbox className="h-4 w-4" />} accent="info" href="/leads?status=nouveau" />
          <KpiCard testId="kpi-in-progress" label={isEn ? "Quotes in progress" : "Soumissions en cours"} value={stats?.quotesInProgress ?? "—"} icon={<FileText className="h-4 w-4" />} href="/soumissions?filter=in-progress" />
          <KpiCard testId="kpi-won" label={isEn ? "Won quotes" : "Soumissions gagnées"} value={stats?.quotesWon ?? "—"} icon={<CheckCircle2 className="h-4 w-4" />} accent="success" href="/soumissions?filter=signee" />
          <KpiCard testId="kpi-installs" label={isEn ? "Scheduled installations" : "Installations planifiées"} value={stats?.installsPlanned ?? "—"} icon={<Calendar className="h-4 w-4" />} href="/calendrier" />
          <KpiCard testId="kpi-late" label={isEn ? "Delays" : "Retards"} value={stats?.installsLate ?? 0} icon={<AlertTriangle className="h-4 w-4" />} accent={stats && stats.installsLate > 0 ? "danger" : "default"} href="/dispatch-installation?filter=retards" />
          <KpiCard testId="kpi-weighted-value" label={isEn ? "Weighted pipeline" : "Pipeline pondéré"} value={moneyFmt.format(weightedValue)} hint={isEn ? "adjusted by win %" : "ajusté par prob."} icon={<TrendingUp className="h-4 w-4" />} accent="success" href="/tableau-ventes" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard testId="kpi-value" label={isEn ? "Estimated value" : "Valeur estimée"} value={stats ? moneyFmt.format(stats.estimatedValue) : "—"} icon={<DollarSign className="h-4 w-4" />} accent="success" href="/tableau-ventes" />
        </div>

        {/* Urgent actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> {isEn ? "Urgent actions" : "Actions urgentes"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {urgent.length === 0 ? (
              <p className="text-sm text-muted-foreground">{isEn ? "No urgent action. Everything is under control." : "Aucune action urgente. Tout est sous contrôle."}</p>
            ) : (
              <ul className="space-y-2">
                {urgent.map((u, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 rounded-md border border-card-border bg-card p-3 hover-elevate">
                    <span className="text-sm">{u.label}</span>
                    <Link href={u.href}>
                      <Button size="sm" variant="outline" data-testid={`button-urgent-${i}`}>{isEn ? "Handle" : "Traiter"}</Button>
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
              <CardTitle className="text-base">{isEn ? "Sales pipeline" : "Pipeline ventes"}</CardTitle>
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
                        <li className="text-[11px] text-muted-foreground">+ {g.items.length - 3} {isEn ? "more" : "de plus"}</li>
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
              <CardTitle className="text-base">{isEn ? "Recent activity" : "Activité récente"}</CardTitle>
            </CardHeader>
            <CardContent className="px-3">
              <ul className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {activities.slice(0, 12).map((a) => (
                  <li key={a.id} className="text-[12px] border-l-2 border-primary/40 pl-2.5 py-1">
                    <div className="text-foreground">{a.note || a.action}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {a.userName || (isEn ? "System" : "Système")} · {new Date(a.createdAt).toLocaleString(isEn ? "en-CA" : "fr-CA", { dateStyle: "short", timeStyle: "short" })}
                    </div>
                  </li>
                ))}
                {activities.length === 0 && <li className="text-sm text-muted-foreground">{isEn ? "No activity." : "Aucune activité."}</li>}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Sectors */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4" /> {isEn ? "Grouping by sector" : "Regroupement par secteur"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {topSectors.map(([sector, info]) => {
                const sectorQuotes = sectorQuotesMap.get(sector) || [];
                return (
                  <div key={sector} className="rounded-md border border-card-border bg-card p-3 hover-elevate">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px] font-semibold">{info.province}</Badge>
                      <span className="text-lg font-bold tabular">{info.count}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="text-[12px] font-medium truncate" title={sector}>{sector}</div>
                      {can("view_all_quotes") && (
                        <Button size="sm" variant="ghost" className="p-1 h-6" onClick={() => setOpenSector(openSector === sector ? null : sector)}>
                          {openSector === sector ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground tabular mt-0.5">{moneyFmt.format(info.value)}</div>
                    {can("view_all_quotes") && openSector === sector && (
                      <div className="mt-2 border rounded bg-muted/50 max-h-48 overflow-y-auto">
                        {sectorQuotes.length === 0 && <div className="text-xs p-2 text-muted-foreground">{isEn ? "No quotes" : "Aucune soumission"}</div>}
                        {sectorQuotes.map(q => (
                          <Link key={q.id} href={`/soumissions/${q.id}`}
                            className="block px-3 py-1 text-xs hover:bg-accent/60 cursor-pointer border-b last:border-b-0">
                            <span className="font-semibold">{q.clientName}</span>
                            {q.status ? <span className="ml-2 text-muted-foreground">({q.status})</span> : null}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {topSectors.length === 0 && <p className="text-sm text-muted-foreground">{isEn ? "No sector." : "Aucun secteur."}</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
