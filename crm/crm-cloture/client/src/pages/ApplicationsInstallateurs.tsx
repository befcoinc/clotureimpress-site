import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/lib/language-context";
import { useToast } from "@/hooks/use-toast";
import type { InstallerApplication } from "@shared/schema";
import { useLocation } from "wouter";
import { Building2, CalendarDays, FileText, Mail, MapPin, Phone, Send, UserPlus, Wrench, CheckCircle2 } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  en_attente: "En attente",
  approuve: "Approuvé",
  refuse: "Refusé",
};
const STATUS_LABELS_EN: Record<string, string> = {
  en_attente: "Pending",
  approuve: "Approved",
  refuse: "Rejected",
};

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

export function ApplicationsInstallateurs() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState<InstallerApplication | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [isSendingFiche, setIsSendingFiche] = useState(false);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [showFicheData, setShowFicheData] = useState(false);

  const { data: applications = [], isLoading } = useQuery<InstallerApplication[]>({
    queryKey: ["/api/installer-applications"],
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: number; status: string; notes: string }) =>
      apiRequest("PATCH", `/api/installer-applications/${id}`, { status, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/installer-applications"] });
      setSelected(null);
      toast({ title: language === "fr" ? "Mis à jour" : "Updated" });
    },
    onError: () => {
      toast({ title: language === "fr" ? "Erreur lors de la mise à jour" : "Update failed", variant: "destructive" });
    },
  });

  function openDetail(app: InstallerApplication) {
    setSelected(app);
    setNewStatus(app.status);
    setNotes(app.notes || "");
    setShowFicheData(false);
  }

  function postalCodeFromRegions(regions: string | null | undefined) {
    if (!regions) return "";
    return regions.split("–")[0].trim();
  }

  function viewOnHeatmap(app: InstallerApplication) {
    const postal = postalCodeFromRegions(app.regions);
    navigate("/heatmap" + (postal ? `?installer=${encodeURIComponent(postal)}` : ""));
  }

  async function sendFicheLink(app: InstallerApplication) {
    setIsSendingFiche(true);
    try {
      const res = await apiRequest("POST", `/api/installer-applications/${app.id}/send-fiche`, {});
      const data = await res.json().catch(() => ({})) as any;
      if (!res.ok) {
        toast({ title: data?.error || (language === "fr" ? "Erreur" : "Error"), variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/installer-applications"] });
      toast({
        title: data.emailSent
          ? (language === "fr" ? "Lien de la fiche envoyé par courriel" : "Form link emailed")
          : (language === "fr" ? "Lien généré (envoi courriel a échoué)" : "Link generated (email failed)"),
        description: data.ficheUrl,
      });
    } catch {
      toast({ title: language === "fr" ? "Erreur réseau" : "Network error", variant: "destructive" });
    } finally {
      setIsSendingFiche(false);
    }
  }

  async function createAccount(app: InstallerApplication) {
    if (!confirm(language === "fr"
      ? `Créer un compte installateur dans le CRM pour ${app.contactName} (${app.email}) ? Une invitation sera envoyée par courriel et SMS.`
      : `Create an installer account in the CRM for ${app.contactName} (${app.email})? An invite will be sent by email and SMS.`
    )) return;
    setIsCreatingAccount(true);
    try {
      const res = await apiRequest("POST", `/api/installer-applications/${app.id}/convert`, {});
      const data = await res.json().catch(() => ({})) as any;
      if (!res.ok) {
        toast({ title: data?.error || (language === "fr" ? "Erreur" : "Error"), variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/installer-applications"] });
      toast({ title: language === "fr" ? "Compte créé et invitation envoyée" : "Account created and invite sent" });
      setSelected(null);
    } catch {
      toast({ title: language === "fr" ? "Erreur réseau" : "Network error", variant: "destructive" });
    } finally {
      setIsCreatingAccount(false);
    }
  }

  const isFr = language === "fr";
  const statusLabels = isFr ? STATUS_LABELS : STATUS_LABELS_EN;

  return (
    <div>
      <PageHeader
        title={isFr ? "Applications installateurs" : "Installer Applications"}
        subtitle={isFr ? "Candidatures reçues depuis le site web" : "Applications received from the website"}
      />

      {isLoading ? (
        <p className="text-muted-foreground text-sm p-4">{isFr ? "Chargement..." : "Loading..."}</p>
      ) : applications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {isFr ? "Aucune candidature reçue pour le moment." : "No applications received yet."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {applications.map((app) => (
            <Card
              key={app.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => openDetail(app)}
            >
              <CardContent className="py-4 px-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-base">{app.companyName}</span>
                      <Badge variant={STATUS_COLORS[app.status] ?? "outline"}>
                        {statusLabels[app.status] ?? app.status}
                      </Badge>
                      {app.ficheCompletedAt && (
                        <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">
                          <CheckCircle2 size={11} className="mr-1" />
                          {isFr ? "Fiche complétée" : "Form completed"}
                        </Badge>
                      )}
                      {app.convertedUserId && (
                        <Badge variant="outline">
                          {isFr ? "Compte créé" : "Account created"}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Building2 size={13} />
                        {app.contactName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Phone size={13} />
                        {app.phone}
                      </span>
                      <span className="flex items-center gap-1">
                        <Mail size={13} />
                        {app.email}
                      </span>
                      {app.regions && (
                        <span className="flex items-center gap-1">
                          <MapPin size={13} />
                          {app.regions}
                        </span>
                      )}
                      {app.fenceTypes && (
                        <span className="flex items-center gap-1">
                          <Wrench size={13} />
                          {app.fenceTypes.split(",").join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                    <CalendarDays size={12} />
                    {formatDate(app.createdAt)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        {selected && (
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selected.companyName}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              {/* Details grid */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: isFr ? "Responsable" : "Contact", value: selected.contactName },
                  { label: isFr ? "Téléphone" : "Phone", value: selected.phone },
                  { label: "Email", value: selected.email },
                  { label: isFr ? "Site web" : "Website", value: selected.website },
                  { label: isFr ? "Adresse" : "Address", value: selected.address },
                  { label: isFr ? "Fondée en" : "Founded", value: selected.yearFounded },
                  { label: isFr ? "Employés" : "Employees", value: selected.employeeCount },
                  { label: isFr ? "Régions" : "Regions", value: selected.regions },
                  { label: isFr ? "Types de clôtures" : "Fence types", value: selected.fenceTypes?.split(",").join(", ") },
                  { label: isFr ? "Expérience" : "Experience", value: selected.yearsExperience },
                ].filter(r => r.value).map(row => (
                  <div key={row.label}>
                    <p className="text-xs text-muted-foreground">{row.label}</p>
                    <p className="font-medium">{row.value}</p>
                  </div>
                ))}
              </div>

              {/* Fiche completion banner */}
              {selected.ficheCompletedAt && (
                <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-emerald-800 flex items-center gap-2">
                      <CheckCircle2 size={16} />
                      {isFr
                        ? `Fiche soumise le ${new Date(selected.ficheCompletedAt).toLocaleDateString("fr-CA")}`
                        : `Form submitted on ${new Date(selected.ficheCompletedAt).toLocaleDateString("en-CA")}`}
                    </p>
                    <Button variant="ghost" size="sm" onClick={() => setShowFicheData(v => !v)}>
                      <FileText size={13} className="mr-1" />
                      {showFicheData
                        ? (isFr ? "Masquer" : "Hide")
                        : (isFr ? "Voir la fiche" : "View form")}
                    </Button>
                  </div>
                  {showFicheData && selected.ficheData && (
                    <pre className="mt-3 max-h-72 overflow-auto rounded bg-white p-2 text-xs whitespace-pre-wrap break-all">
                      {(() => {
                        try { return JSON.stringify(JSON.parse(selected.ficheData), null, 2); }
                        catch { return selected.ficheData; }
                      })()}
                    </pre>
                  )}
                </div>
              )}

              {/* Status change */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {isFr ? "Statut" : "Status"}
                </label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en_attente">{isFr ? "En attente" : "Pending"}</SelectItem>
                    <SelectItem value="approuve">{isFr ? "Approuvé" : "Approved"}</SelectItem>
                    <SelectItem value="refuse">{isFr ? "Refusé" : "Rejected"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {isFr ? "Notes internes" : "Internal notes"}
                </label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder={isFr ? "Ajouter une note..." : "Add a note..."}
                />
              </div>

              <div className="flex flex-wrap justify-between gap-2 pt-2">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => viewOnHeatmap(selected)}
                  >
                    <MapPin size={14} className="mr-1" />
                    {isFr ? "Voir sur la carte" : "View on map"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSendingFiche}
                    onClick={() => sendFicheLink(selected)}
                  >
                    <Send size={14} className="mr-1" />
                    {isSendingFiche
                      ? (isFr ? "Envoi..." : "Sending...")
                      : selected.ficheCompletedAt
                        ? (isFr ? "Réenvoyer le lien" : "Resend link")
                        : (isFr ? "Envoyer la fiche à remplir" : "Send form to fill")}
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    disabled={isCreatingAccount || !!selected.convertedUserId}
                    onClick={() => createAccount(selected)}
                  >
                    <UserPlus size={14} className="mr-1" />
                    {isCreatingAccount
                      ? (isFr ? "Création..." : "Creating...")
                      : selected.convertedUserId
                        ? (isFr ? "Compte déjà créé" : "Account already created")
                        : (isFr ? "Créer compte installateur" : "Create installer account")}
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setSelected(null)}>
                    {isFr ? "Annuler" : "Cancel"}
                  </Button>
                  <Button
                    onClick={() => patchMutation.mutate({ id: selected.id, status: newStatus, notes })}
                    disabled={patchMutation.isPending}
                  >
                    {patchMutation.isPending
                      ? (isFr ? "Enregistrement..." : "Saving...")
                      : (isFr ? "Enregistrer" : "Save")}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
