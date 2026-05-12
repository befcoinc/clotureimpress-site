import { useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Calendar, Wrench, MapPin, Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useRole } from "@/lib/role-context";
import { useToast } from "@/hooks/use-toast";
import type { Quote, User, Crew } from "@shared/schema";
import { INSTALL_STATUSES } from "@shared/schema";

export function DispatchInstallation() {
  const { currentUser, can } = useRole();
  const { toast } = useToast();
  const { data: quotes = [] } = useQuery<Quote[]>({ queryKey: ["/api/quotes"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: crews = [] } = useQuery<Crew[]>({ queryKey: ["/api/crews"] });

  const installers = users.filter(u => u.role === "installer");
  const moneyFmt = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

  const assignMut = useMutation({
    mutationFn: async ({ id, installerId }: { id: number; installerId: number }) =>
      apiRequest("PATCH", `/api/quotes/${id}`, {
        assignedInstallerId: installerId, installStatus: "planifiee",
        _userId: currentUser?.id, _userName: currentUser?.name, _userRole: currentUser?.role,
        _timelineStep: "Planifiée",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Installateur assigné" });
    },
  });

  // Installations to schedule = signed but no scheduled date or no installer
  const toSchedule = quotes.filter(q => q.salesStatus === "signee" && q.installStatus === "a_planifier");

  // Group by sector
  const groupedBySector = useMemo(() => {
    const map = new Map<string, Quote[]>();
    for (const q of quotes.filter(q => q.installStatus !== "terminee" && q.salesStatus === "signee")) {
      const key = q.sector || "Non classé";
      const list = map.get(key) || [];
      list.push(q);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [quotes]);

  // Group by date for next 7 days
  const groupedByDate = useMemo(() => {
    const map = new Map<string, Quote[]>();
    for (const q of quotes.filter(q => q.scheduledDate)) {
      const list = map.get(q.scheduledDate!) || [];
      list.push(q);
      map.set(q.scheduledDate!, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [quotes]);

  return (
    <>
      <PageHeader
        title="Dispatch installation"
        description="Planifier les installations, assigner les équipes/sous-traitants et regrouper par secteur/journée."
      />
      <div className="p-6 lg:p-8 space-y-6">
        {/* Available crews */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Équipes et sous-traitants</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {crews.map(c => (
                <div key={c.id} className="rounded-md border border-card-border bg-card p-3 hover-elevate" data-testid={`crew-${c.id}`}>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <div className="font-semibold text-[13px] truncate">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground capitalize">{c.type} · {c.province}</div>
                    </div>
                    <Badge variant="outline" className={`text-[10px] ${c.status === "disponible" ? "border-emerald-500 text-emerald-700 dark:text-emerald-300" : c.status === "occupe" ? "border-amber-500 text-amber-700 dark:text-amber-300" : "border-rose-500 text-rose-700 dark:text-rose-300"}`}>
                      {c.status}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground line-clamp-1">{c.cities ? JSON.parse(c.cities).join(", ") : ""}</div>
                  <div className="flex items-center gap-3 text-[11px] mt-1.5 text-muted-foreground">
                    <span>Capacité: <span className="font-semibold text-foreground tabular">{c.capacity}</span></span>
                    <span>Note: <span className="font-semibold text-foreground tabular">{c.rating?.toFixed(1)}</span> ★</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* To schedule */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" /> À planifier ({toSchedule.length})</CardTitle></CardHeader>
          <CardContent>
            {toSchedule.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune installation en attente.</p>
            ) : (
              <div className="space-y-2">
                {toSchedule.map(q => (
                  <div key={q.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-card-border bg-card p-3 hover-elevate" data-testid={`schedule-${q.id}`}>
                    <div className="min-w-0 flex-1">
                      <Link href={`/soumissions/${q.id}`}>
                        <span className="font-semibold text-[13px] hover:underline cursor-pointer">{q.clientName}</span>
                      </Link>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        <Badge variant="outline" className="text-[10px] mr-1">{q.province}</Badge>
                        {q.sector} · {q.fenceType} · {q.estimatedLength} pi · {q.estimatedPrice ? moneyFmt.format(q.estimatedPrice) : "—"}
                      </div>
                    </div>
                    <Select onValueChange={(v) => can("assign_installer") && assignMut.mutate({ id: q.id, installerId: Number(v) })}>
                      <SelectTrigger className="w-[220px] h-9" data-testid={`select-installer-${q.id}`}><SelectValue placeholder="Assigner installateur" /></SelectTrigger>
                      <SelectContent>
                        {installers.map(i => <SelectItem key={i.id} value={i.id.toString()}>{i.name} ({i.region})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* By sector */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" /> Par secteur</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                {groupedBySector.map(([sector, qs]) => (
                  <div key={sector} className="rounded-md border border-card-border bg-muted/30 p-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-[12px] truncate">{sector}</span>
                      <Badge variant="outline" className="text-[10px]">{qs.length} job(s)</Badge>
                    </div>
                    <ul className="space-y-1">
                      {qs.map(q => (
                        <li key={q.id} className="flex items-center justify-between text-[11px] gap-2">
                          <Link href={`/soumissions/${q.id}`}>
                            <span className="cursor-pointer hover:underline truncate">{q.clientName}</span>
                          </Link>
                          <StatusBadge status={q.installStatus} className="text-[9px]" />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {groupedBySector.length === 0 && <p className="text-sm text-muted-foreground">Aucun travail planifié.</p>}
              </div>
            </CardContent>
          </Card>

          {/* By date */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4" /> Calendrier</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                {groupedByDate.map(([date, qs]) => (
                  <div key={date} className="rounded-md border border-card-border bg-muted/30 p-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-[12px]">{new Date(date).toLocaleDateString("fr-CA", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}</span>
                      <Badge variant="outline" className="text-[10px]">{qs.length}</Badge>
                    </div>
                    <ul className="space-y-1">
                      {qs.map(q => {
                        const inst = users.find(u => u.id === q.assignedInstallerId);
                        return (
                          <li key={q.id} className="flex items-center justify-between gap-2 text-[11px]">
                            <Link href={`/soumissions/${q.id}`}>
                              <span className="cursor-pointer hover:underline truncate">{q.clientName} — {q.city}</span>
                            </Link>
                            <span className="text-muted-foreground">{inst?.name || "?"}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
                {groupedByDate.length === 0 && <p className="text-sm text-muted-foreground">Aucune date planifiée.</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
