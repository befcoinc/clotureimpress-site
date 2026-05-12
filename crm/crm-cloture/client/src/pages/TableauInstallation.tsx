import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Quote, User, Crew } from "@shared/schema";
import { INSTALL_STATUSES } from "@shared/schema";
import { Wrench, AlertTriangle, CheckCircle2, Calendar } from "lucide-react";

export function TableauInstallation() {
  const { data: quotes = [] } = useQuery<Quote[]>({ queryKey: ["/api/quotes"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: crews = [] } = useQuery<Crew[]>({ queryKey: ["/api/crews"] });
  const installers = users.filter(u => u.role === "installer");

  const aPlanifier = quotes.filter(q => q.salesStatus === "signee" && q.installStatus === "a_planifier").length;
  const enCours = quotes.filter(q => ["en_cours", "en_route", "materiel"].includes(q.installStatus)).length;
  const terminees = quotes.filter(q => q.installStatus === "terminee").length;
  const problemes = quotes.filter(q => q.installStatus === "probleme").length;

  const installerPerf = installers.map(inst => {
    const insts = quotes.filter(q => q.assignedInstallerId === inst.id);
    return {
      installer: inst,
      total: insts.length,
      active: insts.filter(q => !["terminee"].includes(q.installStatus)).length,
      done: insts.filter(q => q.installStatus === "terminee").length,
    };
  });

  return (
    <>
      <PageHeader
        title="Tableau de bord Installation"
        description="État des installations en cours, planifiées et historiques. Performance des équipes."
      />
      <div className="p-6 lg:p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="À planifier" value={aPlanifier} icon={<Calendar className="h-4 w-4" />} accent="warning" />
          <KpiCard label="En cours" value={enCours} icon={<Wrench className="h-4 w-4" />} accent="info" />
          <KpiCard label="Terminées" value={terminees} icon={<CheckCircle2 className="h-4 w-4" />} accent="success" />
          <KpiCard label="Problèmes" value={problemes} icon={<AlertTriangle className="h-4 w-4" />} accent={problemes > 0 ? "danger" : "default"} />
        </div>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Statuts d'installation</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(INSTALL_STATUSES).map(([k, v]) => {
                const n = quotes.filter(q => q.installStatus === k).length;
                return (
                  <div key={k} className="rounded-md border border-card-border bg-muted/30 p-3">
                    <StatusBadge status={k} />
                    <div className="mt-2 text-2xl font-bold tabular">{n}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Performance installateurs</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 font-semibold">Installateur</th>
                    <th className="py-2 pr-3 font-semibold">Région</th>
                    <th className="py-2 pr-3 font-semibold">Villes</th>
                    <th className="py-2 pr-3 font-semibold text-right">Total</th>
                    <th className="py-2 pr-3 font-semibold text-right">Actifs</th>
                    <th className="py-2 pr-3 font-semibold text-right">Terminés</th>
                  </tr>
                </thead>
                <tbody>
                  {installerPerf.map(p => (
                    <tr key={p.installer.id} className="border-b border-border/50 hover-elevate">
                      <td className="py-2.5 pr-3 font-medium">{p.installer.name}</td>
                      <td className="py-2.5 pr-3 text-[12px]"><Badge variant="outline" className="text-[10px]">{p.installer.region}</Badge></td>
                      <td className="py-2.5 pr-3 text-[12px] text-muted-foreground">{p.installer.cities ? JSON.parse(p.installer.cities).join(", ") : "—"}</td>
                      <td className="py-2.5 pr-3 text-right tabular">{p.total}</td>
                      <td className="py-2.5 pr-3 text-right tabular text-amber-600 font-semibold">{p.active}</td>
                      <td className="py-2.5 pr-3 text-right tabular text-emerald-600 font-semibold">{p.done}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
