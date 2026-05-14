import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/lib/language-context";
import { useToast } from "@/hooks/use-toast";
import type { RepresentativeApplication } from "@shared/schema";
import { useLocation } from "wouter";
import { Building2, CalendarDays, FileText, Mail, MapPin, Phone, Send, UserPlus, CheckCircle2 } from "lucide-react";

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  en_attente: "secondary",
  approuve: "default",
  refuse: "destructive",
};

function formatDate(dateStr: string) {
  if (!dateStr || dateStr === "CURRENT_TIMESTAMP") return "—";
  try {
    return new Date(dateStr).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

export function ApplicationsRepresentants() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const isFr = language === "fr";

  const [selected, setSelected] = useState<RepresentativeApplication | null>(null);
  const [newStatus, setNewStatus] = useState("en_attente");
  const [notes, setNotes] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showFicheData, setShowFicheData] = useState(false);
  const [isSendingFiche, setIsSendingFiche] = useState(false);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const { data: applications = [], isLoading } = useQuery<RepresentativeApplication[]>({
    queryKey: ["/api/representative-applications", showArchived ? "archived" : "active"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/representative-applications${showArchived ? "?archived=1" : ""}`, undefined);
      if (!res.ok) throw new Error("Failed to load representative applications");
      return res.json();
    },
  });

  const { data: archivedApplications = [] } = useQuery<RepresentativeApplication[]>({
    queryKey: ["/api/representative-applications", "archived-count"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/representative-applications?archived=1", undefined);
      if (!res.ok) throw new Error("Failed to load archived representative applications");
      return res.json();
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: number; status: string; notes: string }) =>
      apiRequest("PATCH", `/api/representative-applications/${id}`, { status, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/representative-applications"] });
      setSelected(null);
      toast({ title: isFr ? "Mis à jour" : "Updated" });
    },
    onError: () => {
      toast({ title: isFr ? "Erreur lors de la mise à jour" : "Update failed", variant: "destructive" });
    },
  });

  function openDetail(app: RepresentativeApplication) {
    setSelected(app);
    setNewStatus(app.status);
    setNotes(app.notes || "");
    setShowFicheData(false);
  }

  function viewOnHeatmap(app: RepresentativeApplication) {
    const region = String(app.regions || "").split("–")[0].trim();
    navigate("/heatmap" + (region ? `?installer=${encodeURIComponent(region)}` : ""));
  }

  async function sendFicheLink(app: RepresentativeApplication) {
    setIsSendingFiche(true);
    try {
      const res = await apiRequest("POST", `/api/representative-applications/${app.id}/send-fiche`, {});
      const data = await res.json().catch(() => ({})) as any;
      if (!res.ok) {
        toast({ title: data?.error || (isFr ? "Erreur" : "Error"), variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/representative-applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/representative-applications", "archived-count"] });
      toast({ title: isFr ? "Lien fiche représentant envoyé" : "Representative form link sent", description: data.ficheUrl });
    } catch {
      toast({ title: isFr ? "Erreur réseau" : "Network error", variant: "destructive" });
    } finally {
      setIsSendingFiche(false);
    }
  }

  async function createAccount(app: RepresentativeApplication) {
    if (!confirm(isFr ? `Créer un compte représentant pour ${app.contactName} (${app.email}) ?` : `Create a sales representative account for ${app.contactName} (${app.email})?`)) return;
    setIsCreatingAccount(true);
    try {
      const res = await apiRequest("POST", `/api/representative-applications/${app.id}/convert`, {});
      const data = await res.json().catch(() => ({})) as any;
      if (!res.ok) {
        toast({ title: data?.error || (isFr ? "Erreur" : "Error"), variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/representative-applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/representative-applications", "archived-count"] });
      toast({ title: isFr ? "Compte représentant créé" : "Representative account created" });
      setSelected(null);
    } catch {
      toast({ title: isFr ? "Erreur réseau" : "Network error", variant: "destructive" });
    } finally {
      setIsCreatingAccount(false);
    }
  }

  async function archiveOrRestore(app: RepresentativeApplication) {
    const endpoint = showArchived ? "restore" : "archive";
    setIsArchiving(true);
    try {
      const res = await apiRequest("POST", `/api/representative-applications/${app.id}/${endpoint}`, {});
      const data = await res.json().catch(() => ({})) as any;
      if (!res.ok) {
        toast({ title: data?.error || (isFr ? "Erreur" : "Error"), variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/representative-applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/representative-applications", "archived-count"] });
      toast({ title: showArchived ? (isFr ? "Remis dans la liste active" : "Restored") : (isFr ? "Retiré de la liste" : "Removed") });
      setSelected(null);
    } catch {
      toast({ title: isFr ? "Erreur réseau" : "Network error", variant: "destructive" });
    } finally {
      setIsArchiving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={isFr ? "Applications représentants" : "Representative Applications"}
        description={isFr ? "Candidatures de représentants vendeurs" : "Sales representative applications"}
        leadingAction={
          <Button
            variant={showArchived ? "default" : "outline"}
            size="sm"
            className={showArchived ? "h-9 border-amber-700 bg-amber-600 text-white" : "h-9 border-amber-500 bg-amber-50 text-amber-800"}
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? (isFr ? "Voir les fiches actives" : "View active") : `${isFr ? "Fiches retirées" : "Removed"}${archivedApplications.length ? ` (${archivedApplications.length})` : ""}`}
          </Button>
        }
      />

      {isLoading ? <p className="text-muted-foreground text-sm p-4">{isFr ? "Chargement..." : "Loading..."}</p> : (
        <div className="grid gap-3 p-4">
          {applications.map((app) => (
            <Card key={app.id} className={showArchived ? "cursor-pointer border-amber-200 bg-amber-50/40" : "cursor-pointer"} onClick={() => openDetail(app)}>
              <CardContent className="py-4 px-5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{app.companyName}</span>
                  {showArchived && <Badge className="bg-amber-600 text-white">{isFr ? "Retirée" : "Removed"}</Badge>}
                  <Badge variant={STATUS_COLORS[app.status] ?? "outline"}>{app.status}</Badge>
                  {app.ficheCompletedAt && <Badge className="bg-emerald-600 text-white"><CheckCircle2 size={11} className="mr-1" />{isFr ? "Fiche complétée" : "Form completed"}</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><Building2 size={13} />{app.contactName}</span>
                  <span className="flex items-center gap-1"><Phone size={13} />{app.phone}</span>
                  <span className="flex items-center gap-1"><Mail size={13} />{app.email}</span>
                  {app.regions && <span className="flex items-center gap-1"><MapPin size={13} />{app.regions}</span>}
                  <span className="flex items-center gap-1"><CalendarDays size={12} />{formatDate(app.createdAt)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
          {applications.length === 0 && (
            <Card><CardContent className="py-10 text-center text-muted-foreground">{showArchived ? (isFr ? "Aucune fiche retirée." : "No removed forms.") : (isFr ? "Aucune candidature." : "No applications.")}</CardContent></Card>
          )}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        {selected && (
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{selected.companyName}</DialogTitle></DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                {[{label:isFr?"Responsable":"Contact",value:selected.contactName},{label:isFr?"Téléphone":"Phone",value:selected.phone},{label:"Email",value:selected.email},{label:isFr?"Régions":"Regions",value:selected.regions},{label:isFr?"Expérience":"Experience",value:selected.yearsExperience},{label:isFr?"Marché préféré":"Preferred market",value:selected.preferredMarket}].filter(r=>r.value).map((row)=><div key={row.label}><p className="text-xs text-muted-foreground">{row.label}</p><p className="font-medium">{row.value}</p></div>)}
              </div>
              {selected.ficheData && (
                <div className="rounded-md border p-3">
                  <Button variant="ghost" size="sm" onClick={() => setShowFicheData(v => !v)}><FileText size={13} className="mr-1" />{showFicheData ? (isFr ? "Masquer" : "Hide") : (isFr ? "Voir la fiche" : "View form")}</Button>
                  {showFicheData && <pre className="mt-2 max-h-72 overflow-auto rounded bg-white p-2 text-xs whitespace-pre-wrap break-all">{(() => { try { return JSON.stringify(JSON.parse(selected.ficheData || "{}"), null, 2); } catch { return selected.ficheData || ""; } })()}</pre>}
                </div>
              )}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isFr ? "Statut" : "Status"}</label>
                <Select value={newStatus} onValueChange={setNewStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en_attente">{isFr ? "En attente" : "Pending"}</SelectItem><SelectItem value="approuve">{isFr ? "Approuvé" : "Approved"}</SelectItem><SelectItem value="refuse">{isFr ? "Refusé" : "Rejected"}</SelectItem></SelectContent></Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isFr ? "Notes internes" : "Internal notes"}</label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder={isFr ? "Ajouter une note..." : "Add a note..."} />
              </div>
              <div className="flex flex-wrap justify-between gap-2 pt-2">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => viewOnHeatmap(selected)}><MapPin size={14} className="mr-1" />{isFr ? "Voir sur la carte" : "View on map"}</Button>
                  <Button variant="outline" size="sm" disabled={isSendingFiche} onClick={() => sendFicheLink(selected)}><Send size={14} className="mr-1" />{isFr ? "Envoyer la fiche à remplir" : "Send form"}</Button>
                  <Button variant="default" size="sm" disabled={isCreatingAccount || !!selected.convertedUserId} onClick={() => createAccount(selected)}><UserPlus size={14} className="mr-1" />{selected.convertedUserId ? (isFr ? "Compte déjà créé" : "Account already created") : (isFr ? "Créer compte représentant" : "Create representative account")}</Button>
                  <Button variant="outline" size="sm" disabled={isArchiving} onClick={() => archiveOrRestore(selected)}>{showArchived ? (isFr ? "Remettre dans la liste" : "Restore") : (isFr ? "Retirer de la liste" : "Remove from list")}</Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setSelected(null)}>{isFr ? "Annuler" : "Cancel"}</Button>
                  <Button onClick={() => patchMutation.mutate({ id: selected.id, status: newStatus, notes })} disabled={patchMutation.isPending}>{patchMutation.isPending ? (isFr ? "Enregistrement..." : "Saving...") : (isFr ? "Enregistrer" : "Save")}</Button>
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
