import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { UploadCloud, CheckCircle2, AlertTriangle, Copy, Workflow, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useRole } from "@/lib/role-context";
import { useLanguage } from "@/lib/language-context";
import { useToast } from "@/hooks/use-toast";

type ParsedLead = {
  clientName: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  neighborhood?: string;
  fenceType?: string;
  message?: string;
  source: "intimura";
  status: "nouveau";
};

const sample = `Nom,Téléphone,Email,Adresse,Ville,Province,Code postal,Quartier,Type,Message
Jean Client,514-555-1212,jean@email.com,123 rue Principale,Montréal,QC,H2X 1A1,Plateau,Bois traité,Demande reçue dans Intimura pour une clôture arrière`;

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === "," && !inQuotes) {
      cells.push(current.trim().replace(/^"|"$/g, ""));
      current = "";
    } else current += char;
  }
  cells.push(current.trim().replace(/^"|"$/g, ""));
  return cells;
}

function pick(row: Record<string, string>, names: string[]) {
  const key = Object.keys(row).find(k => names.includes(k.toLowerCase().trim()));
  return key ? row[key] : "";
}

function parseIntimuraExport(raw: string): ParsedLead[] {
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = Object.fromEntries(headers.map((h, i) => [h, cells[i] || ""]));
    const first = pick(row, ["nom", "name", "client", "clientname", "client name"]);
    const city = pick(row, ["ville", "city"]);
    const province = pick(row, ["province", "prov"]) || "QC";
    return {
      clientName: first || "Client Intimura sans nom",
      phone: pick(row, ["téléphone", "telephone", "phone", "tel"]),
      email: pick(row, ["email", "courriel", "e-mail"]),
      address: pick(row, ["adresse", "address"]),
      city,
      province,
      postalCode: pick(row, ["code postal", "postal", "postalcode", "zip"]),
      neighborhood: pick(row, ["quartier", "neighborhood", "secteur"]),
      fenceType: pick(row, ["type", "type de clôture", "fence type"]) || "Bois traité",
      message: pick(row, ["message", "notes", "description", "demande"]) || "Lead importé depuis Intimura.",
      source: "intimura",
      status: "nouveau",
    };
  });
}

export function Intimura() {
  const { currentUser } = useRole();
  const { language } = useLanguage();
  const isEn = language === "en";
  const { toast } = useToast();
  const [raw, setRaw] = useState(sample);
  const parsed = useMemo(() => parseIntimuraExport(raw), [raw]);

  const importMut = useMutation({
    mutationFn: async () => {
      const results = [];
      for (const lead of parsed) {
        results.push(await apiRequest("POST", "/api/leads", {
          ...lead,
          _userId: currentUser?.id,
          _userName: currentUser?.name,
          _userRole: currentUser?.role,
        }));
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({ title: isEn ? "Intimura import completed" : "Import Intimura terminé", description: isEn ? `${parsed.length} lead(s) added to CRM.` : `${parsed.length} lead(s) ajouté(s) au CRM.` });
    },
  });

  const syncMut = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/intimura/sync", {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({
        title: isEn ? "Intimura sync completed" : "Synchronisation Intimura terminée",
        description: isEn ? `${data.createdLeads} new lead(s), ${data.skipped} duplicate(s) skipped.` : `${data.createdLeads} nouveau(x) lead(s), ${data.skipped} doublon(s) ignoré(s).`,
      });
    },
    onError: (err: any) => {
      toast({
        title: isEn ? "Synchronization unavailable" : "Synchronisation non disponible",
        description: err?.message || (isEn ? "Intimura session missing or expired." : "Session Intimura manquante ou expirée."),
        variant: "destructive",
      });
    },
  });

  return (
    <>
      <PageHeader
        title={isEn ? "Lead source - Intimura" : "Source des leads — Intimura"}
        description={isEn ? "Leads come from crm.intimura.com. This page prepares real import and already supports CSV exports into pipeline." : "Les leads proviennent de crm.intimura.com. Cette page prépare l’import réel et permet déjà d’entrer les exports Intimura dans le pipeline."}
        action={<div className="flex gap-2">
          <Button data-testid="button-sync-intimura" disabled={syncMut.isPending} onClick={() => syncMut.mutate()} className="gap-2">
            <Workflow className="h-4 w-4" />{syncMut.isPending ? (isEn ? "Synchronizing..." : "Synchronisation...") : (isEn ? "Sync Intimura" : "Synchroniser Intimura")}
          </Button>
          <Button data-testid="button-import-intimura" variant="outline" disabled={!parsed.length || importMut.isPending} onClick={() => importMut.mutate()} className="gap-2"><UploadCloud className="h-4 w-4" />{isEn ? "Import CSV" : "Importer CSV"}</Button>
        </div>}
      />

      <div className="p-6 lg:p-8 space-y-4">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Copy className="h-4 w-4" /> {isEn ? "Temporary CSV export import" : "Import temporaire par export CSV"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {isEn ? "Paste an Intimura CSV export here. CRM creates leads with source" : "Colle ici un export Intimura en CSV. Le CRM crée les leads avec la source"} <Badge variant="outline">intimura</Badge>{isEn ? ", then classifies each client by province, city, neighborhood and postal code." : ", puis classe chaque client par province, ville, quartier et code postal."}
              </p>
              <Textarea
                data-testid="textarea-intimura-import"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                rows={12}
                className="font-mono text-xs"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{parsed.length} {isEn ? "lead(s) detected" : "lead(s) détecté(s)"}</span>
                <span>{isEn ? "Recognized columns: name, phone, email, address, city, province, postal code, neighborhood, type, message." : "Colonnes reconnues : nom, téléphone, email, adresse, ville, province, code postal, quartier, type, message."}</span>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Workflow className="h-4 w-4" /> {isEn ? "Target workflow" : "Workflow cible"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {(isEn ? [
                  "Lead created in Intimura",
                  "Export, webhook, or API into this CRM",
                  "Automatic sector detection",
                  "Assign to sales rep",
                  "Quote, follow-up, signature",
                  "Installation dispatch by sector",
                ] : [
                  "Lead créé dans Intimura",
                  "Export, webhook ou API vers ce CRM",
                  "Détection automatique du secteur",
                  "Assignation au vendeur",
                  "Soumission, suivi, signature",
                  "Dispatch installation par secteur",
                ]).map((step, i) => (
                  <div key={step} className="flex items-center gap-2">
                    <Badge variant="secondary" className="w-6 justify-center">{i + 1}</Badge>
                    <span>{step}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4" /> {isEn ? "Intimura connection" : "Connexion Intimura"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" /><span>{isEn ? "Sync button reads authenticated Intimura data and blocks duplicates by Intimura ID." : "Le bouton de synchronisation lit les données Intimura authentifiées et bloque les doublons avec l’ID Intimura."}</span></div>
                <div className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" /><span>{isEn ? "If Intimura provides CSV export, this module can become an automated file import." : "Si Intimura permet un export CSV, ce module peut devenir un import fichier automatisé."}</span></div>
                <div className="flex gap-2"><AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" /><span>{isEn ? "For 24/7 sync, temporary session must be replaced by a Cloudflare Service Token or Intimura API." : "Pour une sync 24/7, il faut remplacer la session temporaire par un Service Token Cloudflare ou une API Intimura."}</span></div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isEn ? "Detected leads preview" : "Aperçu des leads détectés"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {parsed.map((lead, i) => (
                <div key={`${lead.clientName}-${i}`} data-testid={`preview-intimura-${i}`} className="rounded-lg border border-border p-3 text-sm">
                  <div className="font-semibold">{lead.clientName}</div>
                  <div className="text-xs text-muted-foreground">{lead.address} {lead.city}, {lead.province} {lead.postalCode}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="outline">{lead.source}</Badge>
                    {lead.neighborhood && <Badge variant="secondary">{lead.neighborhood}</Badge>}
                    {lead.fenceType && <Badge variant="secondary">{lead.fenceType}</Badge>}
                  </div>
                </div>
              ))}
              {!parsed.length && <div className="text-sm text-muted-foreground">{isEn ? "No lead detected. Keep first row as CSV headers." : "Aucun lead détecté. Garde la première ligne comme en-têtes CSV."}</div>}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
