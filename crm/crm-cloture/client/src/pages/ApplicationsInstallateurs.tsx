import { useState, useMemo } from "react";
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
import { getInstallerFichePricingGaps, INSTALLER_FICHE_PRICING_LABELS } from "@shared/installerFichePricing";
import { useLocation } from "wouter";
import { Building2, CalendarDays, FileText, Mail, MapPin, Phone, Send, UserPlus, Wrench, CheckCircle2, AlertCircle } from "lucide-react";

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
  const [isSendingFicheIncomplete, setIsSendingFicheIncomplete] = useState(false);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [showFicheData, setShowFicheData] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const { data: applications = [], isLoading } = useQuery<InstallerApplication[]>({
    queryKey: ["/api/installer-applications", showArchived ? "archived" : "active"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/installer-applications${showArchived ? "?archived=1" : ""}`, undefined);
      if (!res.ok) throw new Error("Failed to load installer applications");
      return res.json();
    },
  });

  const { data: archivedApplications = [] } = useQuery<InstallerApplication[]>({
    queryKey: ["/api/installer-applications", "archived-count"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/installer-applications?archived=1", undefined);
      if (!res.ok) throw new Error("Failed to load archived installer applications");
      return res.json();
    },
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

  const selectedPricingGaps = useMemo(() => {
    if (!selected?.ficheData) return getInstallerFichePricingGaps({});
    try {
      return getInstallerFichePricingGaps(JSON.parse(selected.ficheData) as Record<string, unknown>);
    } catch {
      return getInstallerFichePricingGaps({});
    }
  }, [selected?.ficheData]);

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

  async function sendFicheIncomplete(app: InstallerApplication) {
    setIsSendingFicheIncomplete(true);
    try {
      const res = await apiRequest("POST", `/api/installer-applications/${app.id}/send-fiche-incomplete`, {});
      const data = await res.json().catch(() => ({})) as any;
      if (!res.ok) {
        toast({ title: data?.error || (language === "fr" ? "Erreur" : "Error"), variant: "destructive" });
        return;
      }
      setSelected((prev) => (prev && prev.id === app.id ? { ...prev, ficheCompletedAt: null } : prev));
      queryClient.invalidateQueries({ queryKey: ["/api/installer-applications"] });
      toast({
        title: data.emailSent
          ? (language === "fr" ? "Courriel « fiche incomplète » envoyé" : "Incomplete reminder sent")
          : (language === "fr" ? "Échec envoi courriel" : "Email failed"),
        description: data.ficheUrl,
      });
    } catch {
      toast({ title: language === "fr" ? "Erreur réseau" : "Network error", variant: "destructive" });
    } finally {
      setIsSendingFicheIncomplete(false);
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
      queryClient.invalidateQueries({ queryKey: ["/api/installer-applications", "archived-count"] });
      toast({ title: language === "fr" ? "Compte créé et invitation envoyée" : "Account created and invite sent" });
      setSelected(null);
    } catch {
      toast({ title: language === "fr" ? "Erreur réseau" : "Network error", variant: "destructive" });
    } finally {
      setIsCreatingAccount(false);
    }
  }

  async function archiveApplication(app: InstallerApplication) {
    if (!confirm(isFr
      ? `Retirer ${app.companyName} de la liste active? La demande restera conservée.`
      : `Remove ${app.companyName} from the active list? The request will stay in the database.`
    )) return;
    setIsArchiving(true);
    try {
      const res = await apiRequest("POST", `/api/installer-applications/${app.id}/archive`, {});
      const data = await res.json().catch(() => ({})) as any;
      if (!res.ok) {
        toast({ title: data?.error || (isFr ? "Erreur" : "Error"), variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/installer-applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/installer-applications", "archived-count"] });
      toast({ title: isFr ? "Retiré de la liste active" : "Removed from active list" });
      setSelected(null);
    } catch {
      toast({ title: isFr ? "Erreur réseau" : "Network error", variant: "destructive" });
    } finally {
      setIsArchiving(false);
    }
  }

  async function restoreApplication(app: InstallerApplication) {
    if (!confirm(isFr
      ? `Remettre ${app.companyName} dans la liste active?`
      : `Restore ${app.companyName} to the active list?`
    )) return;
    setIsArchiving(true);
    try {
      const res = await apiRequest("POST", `/api/installer-applications/${app.id}/restore`, {});
      const data = await res.json().catch(() => ({})) as any;
      if (!res.ok) {
        toast({ title: data?.error || (isFr ? "Erreur" : "Error"), variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/installer-applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/installer-applications", "archived-count"] });
      toast({ title: isFr ? "Remis dans la liste active" : "Restored to active list" });
      setSelected(null);
    } catch {
      toast({ title: isFr ? "Erreur réseau" : "Network error", variant: "destructive" });
    } finally {
      setIsArchiving(false);
    }
  }

  const isFr = language === "fr";
  const statusLabels = isFr ? STATUS_LABELS : STATUS_LABELS_EN;

  return (
    <div>
      <PageHeader
        title={isFr ? "Applications installateurs" : "Installer Applications"}
        description={isFr ? "Candidatures reçues depuis le site web" : "Applications received from the website"}
        leadingAction={
          <Button
            variant={showArchived ? "default" : "outline"}
            size="sm"
            className={showArchived
              ? "h-9 border-amber-700 bg-amber-600 text-white shadow-md shadow-amber-200 hover:bg-amber-700 hover:text-white"
              : "h-9 border-amber-500 bg-amber-50 text-amber-800 shadow-sm hover:bg-amber-100 hover:text-amber-900"}
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived
              ? (isFr ? "Voir les fiches actives" : "View active applications")
              : `${isFr ? "Fiches retirées" : "Removed applications"}${archivedApplications.length ? ` (${archivedApplications.length})` : ""}`}
          </Button>
        }
      />

      {isLoading ? (
        <p className="text-muted-foreground text-sm p-4">{isFr ? "Chargement..." : "Loading..."}</p>
      ) : applications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {showArchived
              ? (isFr ? "Aucune fiche retirée pour le moment." : "No removed applications yet.")
              : (isFr ? "Aucune candidature reçue pour le moment." : "No applications received yet.")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {applications.map((app) => (
            <Card
              key={app.id}
              className={showArchived
                ? "cursor-pointer border-amber-200 bg-amber-50/40 hover:border-amber-400 transition-colors"
                : "cursor-pointer hover:border-primary/50 transition-colors"}
              onClick={() => openDetail(app)}
            >
              <CardContent className="py-4 px-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-base">{app.companyName}</span>
                      {showArchived && (
                        <Badge variant="destructive" className="bg-amber-600 hover:bg-amber-700 text-white">
                          Retirée
                        </Badge>
                      )}
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
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                <span>{selected.companyName}</span>
                {showArchived && (
                  <Badge variant="destructive" className="bg-amber-600 hover:bg-amber-700 text-white">
                    Fiche retirée
                  </Badge>
                )}
              </DialogTitle>
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
                    <div className="mt-3 max-h-[60vh] overflow-auto rounded bg-white p-3 text-sm">
                      <FicheRenderer raw={selected.ficheData} isFr={isFr} />
                    </div>
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
                    variant="outline"
                    size="sm"
                    disabled={isSendingFicheIncomplete || selectedPricingGaps.length === 0}
                    onClick={() => sendFicheIncomplete(selected)}
                    title={
                      selectedPricingGaps.length === 0
                        ? (isFr ? "La tarification est déjà complète" : "Pricing section is complete")
                        : undefined
                    }
                  >
                    <AlertCircle size={14} className="mr-1" />
                    {isSendingFicheIncomplete
                      ? (isFr ? "Envoi..." : "Sending...")
                      : (isFr ? "Rappel fiche incomplète" : "Incomplete form reminder")}
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
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isArchiving}
                    onClick={() => archiveApplication(selected)}
                  >
                    {isFr ? "Retirer de la liste" : "Remove from list"}
                  </Button>
                  {showArchived && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isArchiving}
                      onClick={() => restoreApplication(selected)}
                    >
                      {isFr ? "Remettre dans la liste" : "Restore to list"}
                    </Button>
                  )}
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

// ---------- Fiche renderer (structured view of submitted form data) ----------

function yesNo(d: any, yesKey: string, noKey: string, isFr: boolean): string {
  if (d?.[yesKey]) return isFr ? "Oui" : "Yes";
  if (d?.[noKey]) return isFr ? "Non" : "No";
  return "—";
}

function val(v: any): string {
  if (v == null) return "—";
  const s = String(v).trim();
  return s ? s : "—";
}

function FicheSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-md mb-3 overflow-hidden">
      <div className="bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 border-b">
        {title}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function FicheGrid({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      {rows.map((r) => (
        <div key={r.label} className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{r.label}</p>
          <p className="font-medium text-sm break-words">{r.value}</p>
        </div>
      ))}
    </div>
  );
}

function FicheRenderer({ raw, isFr }: { raw: string; isFr: boolean }) {
  let d: any;
  try {
    d = JSON.parse(raw);
  } catch {
    return <pre className="text-xs whitespace-pre-wrap break-all">{raw}</pre>;
  }

  const provinces: string[] = [];
  if (d.province_qc) provinces.push("QC");
  if (d.province_on) provinces.push("ON");
  if (d.province_ab) provinces.push("AB");
  if (d.province_bc) provinces.push("BC");
  if (d.province_autres) provinces.push(isFr ? "Autres" : "Other");

  const equipements: string[] = [];
  const eqMap: Record<string, string> = {
    eq_tariere: "Tarière",
    eq_excavatrice: "Mini-excavatrice",
    eq_betonniere: "Bétonnière",
    eq_coupe: "Outils de coupe",
    eq_soudeuse: "Soudeuse",
    eq_laser: "Niveau laser",
    eq_securite: "Équipement de sécurité",
    eq_autres: "Autres",
  };
  for (const k of Object.keys(eqMap)) if (d[k]) equipements.push(eqMap[k]);

  const pricingRows = INSTALLER_FICHE_PRICING_LABELS.map((label, i) => {
    const offered = !!d[`pricing${i}_offered`];
    const offerState = d[`pricing${i}_offerState`];
    const rateRaw = String(d[`pricing${i}_rate`] ?? "").trim();
    const notesRaw = String(d[`pricing${i}_notes`] ?? "").trim();
    const explicitNo = offerState === "no";
    const offeredDisplay = offered
      ? (isFr ? "Oui" : "Yes")
      : explicitNo || rateRaw || notesRaw
        ? (isFr ? "Non" : "No")
        : "—";
    return {
      label,
      offered,
      offeredDisplay,
      rate: val(d[`pricing${i}_rate`]),
      notes: val(d[`pricing${i}_notes`]),
    };
  });

  const refs = [1, 2, 3].map((n) => ({
    company: val(d[`ref${n}_company`]),
    contact: val(d[`ref${n}_contact`]),
    phone: val(d[`ref${n}_phone`]),
    project: val(d[`ref${n}_project`]),
  })).filter((r) => r.company !== "—" || r.contact !== "—" || r.phone !== "—");

  return (
    <div>
      <FicheSection title={isFr ? "1. Identification de l'entreprise" : "1. Company"}>
        <FicheGrid rows={[
          { label: isFr ? "Raison sociale" : "Legal name", value: val(d.companyLegalName) },
          { label: isFr ? "Nom commercial" : "Trade name", value: val(d.companyTradeName) },
          { label: isFr ? "Responsable" : "Contact", value: val(d.contactName) },
          { label: "Email", value: val(d.email) },
          { label: isFr ? "Téléphone principal" : "Phone", value: val(d.phonePrimary) },
          { label: isFr ? "Téléphone secondaire" : "Phone 2", value: val(d.phoneSecondary) },
          { label: isFr ? "Adresse" : "Address", value: val(d.address) },
          { label: isFr ? "Ville" : "City", value: val(d.city) },
          { label: "Province", value: val(d.province) },
          { label: isFr ? "Code postal" : "Postal", value: val(d.postalCode) },
          { label: "NEQ", value: val(d.neq) },
          { label: isFr ? "Site web" : "Website", value: val(d.website) },
        ]} />
      </FicheSection>

      <FicheSection title={isFr ? "2. Territoire et heatmap" : "2. Territory & heatmap"}>
        <FicheGrid rows={[
          { label: isFr ? "Régions desservies" : "Regions", value: val(d.regions) },
          { label: isFr ? "Rayon (km)" : "Radius (km)", value: val(d.radiusKm) },
          { label: isFr ? "Code postal heatmap" : "Heatmap postal code", value: val(d.postalCodeHeatmap) },
          { label: isFr ? "Hors région" : "Outside region", value: yesNo(d, "hors_region_oui", "hors_region_non", isFr) },
          { label: isFr ? "Provinces acceptées" : "Provinces", value: provinces.length ? provinces.join(", ") : "—" },
        ]} />
      </FicheSection>

      <FicheSection title={isFr ? "3. Expérience et tarification" : "3. Experience & pricing"}>
        <FicheGrid rows={[
          { label: isFr ? "Années d'expérience" : "Years of experience", value: val(d.yearsExperience) },
          { label: isFr ? "Nb installateurs" : "Installers", value: val(d.installersCount) },
          { label: isFr ? "Nb équipes" : "Teams", value: val(d.teamsCount) },
          { label: isFr ? "Capacité / semaine" : "Weekly capacity", value: val(d.capacityWeek) },
          { label: isFr ? "Spécialités" : "Specialties", value: val(d.specialties) },
        ]} />
        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
            {isFr ? "Tarification (au pied linéaire)" : "Pricing (per linear foot)"}
          </p>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className="px-2 py-1 border">{isFr ? "Type" : "Type"}</th>
                <th className="px-2 py-1 border">{isFr ? "Offert" : "Offered"}</th>
                <th className="px-2 py-1 border">{isFr ? "Tarif" : "Rate"}</th>
                <th className="px-2 py-1 border">{isFr ? "Notes" : "Notes"}</th>
              </tr>
            </thead>
            <tbody>
              {pricingRows.map((r) => (
                <tr key={r.label} className={r.offered ? "" : "text-muted-foreground"}>
                  <td className="px-2 py-1 border">{r.label}</td>
                  <td className="px-2 py-1 border">{r.offeredDisplay}</td>
                  <td className="px-2 py-1 border">{r.rate}</td>
                  <td className="px-2 py-1 border">{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FicheSection>

      <FicheSection title={isFr ? "4. Équipement et véhicules" : "4. Equipment & vehicles"}>
        <FicheGrid rows={[
          { label: isFr ? "Camions / remorques" : "Vehicles", value: val(d.vehicles) },
          { label: isFr ? "Équipements" : "Equipment", value: equipements.length ? equipements.join(", ") : "—" },
          { label: isFr ? "Transport matériaux" : "Material transport", value: yesNo(d, "transport_oui", "transport_non", isFr) },
        ]} />
      </FicheSection>

      <FicheSection title={isFr ? "5. Conformité et assurances" : "5. Compliance & insurance"}>
        <FicheGrid rows={[
          { label: isFr ? "Assurance RC" : "Liability insurance", value: yesNo(d, "assur_oui", "assur_non", isFr) },
          { label: isFr ? "Assureur" : "Insurer", value: val(d.insurerName) },
          { label: isFr ? "Police" : "Policy #", value: val(d.insurerPolicy) },
          { label: isFr ? "Couverture" : "Coverage", value: val(d.insurerCoverage) },
          { label: isFr ? "Expiration" : "Expiry", value: val(d.insurerExpiry) },
          { label: "CNESST / WCB", value: yesNo(d, "cnesst_oui", "cnesst_non", isFr) },
          { label: isFr ? "Dossier CNESST" : "CNESST file", value: val(d.cnesstFile) },
          { label: "RBQ", value: val(d.rbq) },
          { label: "TPS", value: val(d.tps) },
          { label: "TVQ / TVH", value: val(d.tvq) },
        ]} />
      </FicheSection>

      <FicheSection title={isFr ? "6. Disponibilité" : "6. Availability"}>
        <FicheGrid rows={[
          { label: isFr ? "Dispo immédiate" : "Available now", value: yesNo(d, "dispo_oui", "dispo_non", isFr) },
          { label: isFr ? "Date de disponibilité" : "Available from", value: val(d.dispoDate) },
          { label: isFr ? "Préavis requis" : "Notice required", value: val(d.dispoNotice) },
          { label: isFr ? "Commentaires" : "Comments", value: val(d.dispoComments) },
        ]} />
      </FicheSection>

      {refs.length > 0 && (
        <FicheSection title={isFr ? "7. Références" : "7. References"}>
          <div className="space-y-2">
            {refs.map((r, i) => (
              <div key={i} className="border rounded p-2">
                <p className="text-xs font-semibold mb-1">{(isFr ? "Référence " : "Reference ") + (i + 1)}</p>
                <FicheGrid rows={[
                  { label: isFr ? "Entreprise" : "Company", value: r.company },
                  { label: isFr ? "Contact" : "Contact", value: r.contact },
                  { label: isFr ? "Téléphone" : "Phone", value: r.phone },
                  { label: isFr ? "Projet" : "Project", value: r.project },
                ]} />
              </div>
            ))}
          </div>
        </FicheSection>
      )}

      <FicheSection title={isFr ? "8. Engagement" : "8. Commitments"}>
        <FicheGrid rows={[
          { label: isFr ? "Standards qualité / délais / sécurité" : "Quality / deadlines / safety", value: yesNo(d, "eng_qual_oui", "eng_qual_non", isFr) },
          { label: isFr ? "Photos avant / après" : "Before/after photos", value: yesNo(d, "eng_photo_oui", "eng_photo_non", isFr) },
          { label: isFr ? "Outil de suivi de chantier" : "Job tracking tool", value: yesNo(d, "eng_suivi_oui", "eng_suivi_non", isFr) },
          { label: isFr ? "Commentaires" : "Comments", value: val(d.comments) },
        ]} />
      </FicheSection>

      <FicheSection title={isFr ? "9. Signature" : "9. Signature"}>
        <FicheGrid rows={[
          { label: isFr ? "Nom du signataire" : "Signer name", value: val(d.sigName) },
          { label: isFr ? "Fonction" : "Role", value: val(d.sigRole) },
          { label: "Date", value: val(d.sigDate) },
          { label: isFr ? "Signature (texte)" : "Signature (text)", value: val(d.sigText) },
        ]} />
      </FicheSection>
    </div>
  );
}
