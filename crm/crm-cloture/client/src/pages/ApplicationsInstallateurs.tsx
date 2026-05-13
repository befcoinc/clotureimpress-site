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
import { Building2, CalendarDays, Mail, MapPin, Phone, Wrench } from "lucide-react";

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
  const [selected, setSelected] = useState<InstallerApplication | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [notes, setNotes] = useState("");

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
          <DialogContent className="max-w-xl">
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

              <div className="flex justify-end gap-2 pt-2">
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
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
