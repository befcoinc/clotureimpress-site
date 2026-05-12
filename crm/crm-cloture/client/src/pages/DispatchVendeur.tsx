import { useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { UserCheck, Briefcase } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useRole } from "@/lib/role-context";
import { useToast } from "@/hooks/use-toast";
import type { Lead, User, Quote } from "@shared/schema";

export function DispatchVendeur() {
  const { currentUser, can } = useRole();
  const { toast } = useToast();
  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: quotes = [] } = useQuery<Quote[]>({ queryKey: ["/api/quotes"] });
  const salesReps = users.filter(u => u.role === "sales_rep");

  const assignMut = useMutation({
    mutationFn: async ({ id, salesId }: { id: number; salesId: number }) =>
      apiRequest("PATCH", `/api/leads/${id}`, {
        assignedSalesId: salesId, status: "assigne",
        _userId: currentUser?.id, _userName: currentUser?.name, _userRole: currentUser?.role,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({ title: "Lead assigné" });
    },
  });

  // Charge by sales rep
  const charge = useMemo(() => {
    return salesReps.map(rep => {
      const repLeads = leads.filter(l => l.assignedSalesId === rep.id);
      const active = repLeads.filter(l => !["gagne", "perdu"].includes(l.status));
      const repQuotes = quotes.filter(q => q.assignedSalesId === rep.id && q.salesStatus !== "perdue" && q.salesStatus !== "signee");
      const pipelineValue = repQuotes.reduce((s, q) => s + (q.estimatedPrice || 0), 0);
      return { rep, leads: repLeads, active, quotes: repQuotes, pipelineValue };
    });
  }, [salesReps, leads, quotes]);

  const unassigned = leads.filter(l => !l.assignedSalesId);
  const moneyFmt = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

  return (
    <>
      <PageHeader
        title="Dispatch vendeur"
        description="Assigner les leads entrants à un vendeur selon la charge et le secteur géographique."
      />
      <div className="p-6 lg:p-8 space-y-6">
        {/* Charge par vendeur */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Briefcase className="h-4 w-4" /> Charge par vendeur</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {charge.map(({ rep, active, pipelineValue }) => (
                <div key={rep.id} className="rounded-md border border-card-border bg-card p-3" data-testid={`charge-${rep.id}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-[13px] truncate">{rep.name}</div>
                      <div className="text-[11px] text-muted-foreground">{rep.region} · {(rep.cities ? JSON.parse(rep.cities) : []).join(", ")}</div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{active.length} actifs</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[12px]">
                    <div><div className="text-muted-foreground">Pipeline</div><div className="font-bold tabular">{moneyFmt.format(pipelineValue)}</div></div>
                    <div><div className="text-muted-foreground">Capacité</div>
                      <div className={`font-bold tabular ${active.length > 8 ? "text-rose-600" : active.length > 5 ? "text-amber-600" : "text-emerald-600"}`}>
                        {active.length > 8 ? "Saturé" : active.length > 5 ? "Élevée" : "OK"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Unassigned leads */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><UserCheck className="h-4 w-4" /> Leads à assigner ({unassigned.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {unassigned.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun lead en attente d'assignation.</p>
            ) : (
              <div className="space-y-2">
                {unassigned.map(lead => {
                  const recommended = salesReps.filter(r => {
                    if (r.region !== lead.province) return false;
                    if (!lead.city || !r.cities) return true;
                    const cities = JSON.parse(r.cities);
                    return cities.some((c: string) => c.toLowerCase() === lead.city!.toLowerCase());
                  });
                  return (
                    <div key={lead.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-card-border bg-card p-3 hover-elevate" data-testid={`unassigned-${lead.id}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[13px]">{lead.clientName}</span>
                          <StatusBadge status={lead.status} />
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          <Badge variant="outline" className="text-[10px] mr-1">{lead.province}</Badge>
                          {lead.sector} · {lead.fenceType}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {recommended.length > 0 && (
                          <div className="hidden md:flex flex-col items-end text-[10px] text-muted-foreground">
                            <span>Recommandé :</span>
                            <span className="font-medium text-foreground">{recommended[0].name}</span>
                          </div>
                        )}
                        <Select onValueChange={(val) => can("assign_sales") && assignMut.mutate({ id: lead.id, salesId: Number(val) })}>
                          <SelectTrigger className="w-[200px] h-9" data-testid={`select-assign-${lead.id}`}>
                            <SelectValue placeholder="Assigner à..." />
                          </SelectTrigger>
                          <SelectContent>
                            {salesReps.map(r => (
                              <SelectItem key={r.id} value={r.id.toString()}>
                                {r.name} {r.region === lead.province ? "★" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
