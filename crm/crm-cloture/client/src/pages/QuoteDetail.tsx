import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { ArrowLeft, MapPin, Ruler, DollarSign, Calendar, Phone, Mail, User as UserIcon, Check } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useRole } from "@/lib/role-context";
import { useToast } from "@/hooks/use-toast";
import type { Quote, User, Activity, Crew, Lead } from "@shared/schema";
import { SALES_STATUSES, INSTALL_STATUSES } from "@shared/schema";

const TIMELINE_STEPS = [
  { label: "Lead reçu", aliases: ["Lead reçu", "Lead créé"], team: "sales" },
  { label: "Soumission envoyée", aliases: ["Soumission envoyée"], team: "sales", payload: { salesStatus: "envoyee", status: "envoyee" } },
  { label: "Suivi", aliases: ["Suivi", "Contacté"], team: "sales", payload: { salesStatus: "suivi" } },
  { label: "Rendez-vous vente / mesure", aliases: ["Rendez-vous vente / mesure", "Rendez-vous mesure", "Rendez-vous"], team: "sales", payload: { salesStatus: "rendez_vous" } },
  { label: "Signature estimation", aliases: ["Signature estimation", "Signée"], team: "sales", payload: { salesStatus: "signee", status: "signee" } },
  { label: "Dépôt payé", aliases: ["Dépôt payé", "Dépôt payer", "Acompte reçu"], team: "sales" },
  { label: "Matériel commandé", aliases: ["Matériel commandé", "Matériel à préparer", "Matériel préparé"], team: "install", payload: { installStatus: "materiel" } },
  { label: "Matériel en route", aliases: ["Matériel en route", "En route"], team: "install", payload: { installStatus: "en_route" } },
  { label: "Matériel livré", aliases: ["Matériel livré"], team: "install" },
  { label: "Installation", aliases: ["Installation", "Installation en cours", "En cours", "Planifiée", "Date d'installation planifiée", "Calendrier installation modifié"], team: "install", payload: { installStatus: "en_cours" } },
  { label: "Installation terminée et approuvée par client", aliases: ["Installation terminée et approuvée par client", "Signature de satisfaction client", "Terminée", "Installée", "Inspection", "Inspectée"], team: "install", payload: { installStatus: "terminee" } },
  { label: "Paiement final", aliases: ["Paiement final", "Payée", "Payé"], team: "sales", payload: { paidDate: new Date().toISOString().slice(0, 10) } },
];

export function QuoteDetail() {
  const [, params] = useRoute("/soumissions/:id");
  const id = Number(params?.id);
  const { currentUser, can, role } = useRole();
  const { toast } = useToast();
  const [newNote, setNewNote] = useState("");
  const [salesNotes, setSalesNotes] = useState("");
  const [installNotes, setInstallNotes] = useState("");

  const { data: quote } = useQuery<Quote>({ queryKey: ["/api/quotes", id], enabled: !!id });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: crews = [] } = useQuery<Crew[]>({ queryKey: ["/api/crews"] });
  const { data: lead } = useQuery<Lead>({ queryKey: ["/api/leads", quote?.leadId], enabled: !!quote?.leadId });
  const { data: activities = [] } = useQuery<Activity[]>({
    queryKey: ["/api/activities", { quoteId: id }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/activities?quoteId=${id}`);
      return res.json();
    },
    enabled: !!id,
  });

  const rep = users.find(u => u.id === quote?.assignedSalesId);
  const installer = users.find(u => u.id === quote?.assignedInstallerId);
  const moneyFmt = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

  const updateMut = useMutation({
    mutationFn: async (data: any) => apiRequest("PATCH", `/api/quotes/${id}`, {
      ...data, _userId: currentUser?.id, _userName: currentUser?.name, _userRole: currentUser?.role,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities", { quoteId: id }] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Soumission mise à jour" });
    },
  });

  if (!quote) {
    return <div className="p-8 text-muted-foreground">Chargement…</div>;
  }

  const timeline: Array<{ step: string; date?: string; note?: string }> = quote.timeline ? JSON.parse(quote.timeline) : [];
  const canEditSales = can("edit_sales") && (role !== "sales_rep" || quote.assignedSalesId === currentUser?.id);
  const canEditInstall = can("edit_install") && (role !== "installer" || quote.assignedInstallerId === currentUser?.id);
  const canMarkStep = (team: string) => canEditSales || (team === "install" && canEditInstall);
  const stepKey = (label: string) => label.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  const markStep = (step: typeof TIMELINE_STEPS[number]) => updateMut.mutate({
    ...(step.payload || {}),
    _timelineStep: step.label,
    _note: `Étape cochée : ${step.label}`,
  });
  const unmarkStep = (step: typeof TIMELINE_STEPS[number]) => {
    const updatedTimeline = timeline.filter(t => !step.aliases.includes(t.step));
    updateMut.mutate({
      timeline: JSON.stringify(updatedTimeline),
      ...(step.label === "Paiement final" ? { paidDate: null } : {}),
      _note: `Étape décochée : ${step.label}`,
    });
  };

  return (
    <>
      <PageHeader
        title={`Soumission #${quote.id} — ${quote.clientName}`}
        description={`${quote.fenceType || "Type non défini"} · ${quote.sector || "Secteur non défini"}`}
        action={
          <Link href="/soumissions">
            <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-back-quotes"><ArrowLeft className="h-4 w-4" /> Retour</Button>
          </Link>
        }
      />

      <div className="p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Client info */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Client & adresse</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <Info icon={<UserIcon className="h-3.5 w-3.5" />} label="Client" value={quote.clientName} />
              <Info icon={<MapPin className="h-3.5 w-3.5" />} label="Adresse" value={`${quote.address || ""}, ${quote.city || ""}`} />
              <Info icon={<Phone className="h-3.5 w-3.5" />} label="Téléphone" value={lead?.phone || "—"} />
              <Info icon={<Mail className="h-3.5 w-3.5" />} label="Courriel" value={lead?.email || "—"} />
              <Info icon={<Ruler className="h-3.5 w-3.5" />} label="Longueur estimée" value={quote.estimatedLength ? `${quote.estimatedLength} pi` : "—"} />
              <Info icon={<DollarSign className="h-3.5 w-3.5" />} label="Prix estimé" value={quote.estimatedPrice ? moneyFmt.format(quote.estimatedPrice) : "—"} />
              <Info icon={<UserIcon className="h-3.5 w-3.5" />} label="Vendeur" value={rep?.name || "Non assigné"} />
              <Info icon={<UserIcon className="h-3.5 w-3.5" />} label="Installateur" value={installer?.name || "Non assigné"} />
            </CardContent>
          </Card>

          {/* Status controls */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Statuts</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Vente</div>
                  <div className="flex items-center gap-2 mb-2"><StatusBadge status={quote.salesStatus} /></div>
                  {canEditSales && (
                    <Select value={quote.salesStatus} onValueChange={(v) => updateMut.mutate({ salesStatus: v, _timelineStep: SALES_STATUSES[v as keyof typeof SALES_STATUSES] })}>
                      <SelectTrigger className="w-full" data-testid="select-sales-status"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(SALES_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Installation</div>
                  <div className="flex items-center gap-2 mb-2"><StatusBadge status={quote.installStatus} /></div>
                  {canEditInstall && (
                    <Select value={quote.installStatus} onValueChange={(v) => updateMut.mutate({ installStatus: v, _timelineStep: INSTALL_STATUSES[v as keyof typeof INSTALL_STATUSES] })}>
                      <SelectTrigger className="w-full" data-testid="select-install-status"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(INSTALL_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Notes vente</div>
                  <Textarea
                    rows={4}
                    defaultValue={quote.salesNotes || ""}
                    onChange={(e) => setSalesNotes(e.target.value)}
                    disabled={!canEditSales}
                    data-testid="textarea-sales-notes"
                  />
                  {canEditSales && (
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => updateMut.mutate({ salesNotes })} data-testid="button-save-sales-notes">Enregistrer notes vente</Button>
                  )}
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Notes installation</div>
                  <Textarea
                    rows={4}
                    defaultValue={quote.installNotes || ""}
                    onChange={(e) => setInstallNotes(e.target.value)}
                    disabled={!canEditInstall}
                    data-testid="textarea-install-notes"
                  />
                  {canEditInstall && (
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => updateMut.mutate({ installNotes })} data-testid="button-save-install-notes">Enregistrer notes installation</Button>
                  )}
                </div>
              </div>

              {/* Price (admin / sales_director / install_director) */}
              {can("edit_price") && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Prix estimé</div>
                    <Input type="number" defaultValue={quote.estimatedPrice ?? ""}
                      onBlur={(e) => updateMut.mutate({ estimatedPrice: parseFloat(e.target.value) || null })}
                      data-testid="input-estimated-price" />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Prix final</div>
                    <Input type="number" defaultValue={quote.finalPrice ?? ""}
                      onBlur={(e) => updateMut.mutate({ finalPrice: parseFloat(e.target.value) || null })}
                      data-testid="input-final-price" />
                  </div>
                </div>
              )}

              {/* Assign installer (install_director / admin) */}
              {can("assign_installer") && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Assigner un installateur</div>
                  <Select value={quote.assignedInstallerId?.toString() || ""} onValueChange={(v) => updateMut.mutate({ assignedInstallerId: Number(v) })}>
                    <SelectTrigger className="w-full max-w-md" data-testid="select-assign-installer"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                    <SelectContent>
                      {users.filter(u => u.role === "installer").map(i => <SelectItem key={i.id} value={i.id.toString()}>{i.name} ({i.region})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Add note */}
              <div>
                <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Ajouter une note d'activité</div>
                <div className="flex gap-2">
                  <Input placeholder="Note rapide..." value={newNote} onChange={e => setNewNote(e.target.value)} data-testid="input-new-note" />
                  <Button size="sm" disabled={!newNote.trim()} onClick={() => {
                    updateMut.mutate({ _note: newNote });
                    setNewNote("");
                  }} data-testid="button-add-note">Ajouter</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar : timeline + activity */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-2">
                {TIMELINE_STEPS.map((step) => {
                  const match = timeline.find(t => step.aliases.includes(t.step));
                  const done = !!match;
                  return (
                    <li key={step.label} className="flex items-start gap-2.5">
                      <button
                        type="button"
                        disabled={!canMarkStep(step.team)}
                        data-testid={`${done ? "button-unmark-step" : "button-mark-step"}-${stepKey(step.label)}`}
                        onClick={() => done ? unmarkStep(step) : markStep(step)}
                        className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0 border transition-colors ${done ? "bg-primary border-primary text-primary-foreground" : "bg-card border-border hover:border-primary"} ${!done && canMarkStep(step.team) ? "cursor-pointer" : "cursor-default opacity-80"}`}
                        title={done ? "Décocher cette étape" : canMarkStep(step.team) ? "Cocher cette étape" : "Permission insuffisante"}
                      >
                        {done && <Check className="h-3 w-3" />}
                      </button>
                      <div className="min-w-0">
                        <div className={`text-[13px] ${done ? "font-medium" : "text-muted-foreground"}`}>{step.label}</div>
                        {done && (
                          <div className="text-[10px] text-muted-foreground">
                            {match?.date && new Date(match.date).toLocaleDateString("fr-CA")}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Activité</CardTitle></CardHeader>
            <CardContent className="px-3">
              <ul className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {activities.map(a => (
                  <li key={a.id} className="text-[12px] border-l-2 border-primary/40 pl-2.5 py-1">
                    <div>{a.note || a.action}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{a.userName} · {formatActivityDate(a.createdAt)}</div>
                  </li>
                ))}
                {activities.length === 0 && <li className="text-sm text-muted-foreground">Aucune activité.</li>}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{icon} {label}</div>
      <div className="text-[13px]">{value}</div>
    </div>
  );
}

function formatActivityDate(value?: string | null) {
  if (!value || value === "CURRENT_TIMESTAMP") return "Date non disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date non disponible";
  return date.toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" });
}
