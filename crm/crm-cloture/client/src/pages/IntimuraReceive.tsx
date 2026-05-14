import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Status = "loading" | "ok" | "error";

interface Result {
  fetched?: number;
  createdLeads?: number;
  createdQuotes?: number;
  skipped?: number;
  message?: string;
  error?: string;
}

export function IntimuraReceive() {
  const [status, setStatus] = useState<Status>("loading");
  const [result, setResult] = useState<Result>({});
  const [rowCount, setRowCount] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        // Retrieve token and payload from sessionStorage set by the bookmarklet
        const token = sessionStorage.getItem("intimura_token") || "";
        const dataRaw = sessionStorage.getItem("intimura_payload") || "";
        // Clean up immediately so refresh doesn't reprocess
        sessionStorage.removeItem("intimura_token");
        sessionStorage.removeItem("intimura_payload");

        if (!token || !dataRaw) {
          setStatus("error");
          setResult({ message: "Donnees manquantes. Le bookmarklet n'a pas transmis les informations correctement." });
          return;
        }
        let payload: any;
        try {
          payload = JSON.parse(dataRaw);
        } catch {
          setStatus("error");
          setResult({ message: "Données illisibles (JSON invalide)." });
          return;
        }
        setRowCount(Array.isArray(payload) ? payload.length : 0);

        const r = await fetch(
          `/api/intimura/ingest?token=${encodeURIComponent(token)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payload }),
          }
        );
        const j = await r.json().catch(() => ({}));
        if (r.ok) {
          setStatus("ok");
          setResult(j);
        } else {
          setStatus("error");
          setResult(j);
        }
      } catch (e: any) {
        setStatus("error");
        setResult({ message: e?.message || "Erreur inconnue" });
      }
    })();
  }, []);

  return (
    <>
      <PageHeader
        title="Import Intimura"
        description="Réception des données depuis le bookmarklet."
      />
      <div className="p-6 lg:p-8 max-w-2xl">
        <Card>
          <CardContent className="pt-6 space-y-4">
            {status === "loading" && (
              <div className="flex items-center gap-3 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Import en cours… ({rowCount} ligne(s) reçue(s))</span>
              </div>
            )}
            {status === "ok" && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-emerald-700">
                  <CheckCircle2 className="h-6 w-6" />
                  <span className="text-lg font-semibold">Import réussi</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 rounded bg-emerald-50 border border-emerald-200">
                    <div className="text-emerald-900 font-bold text-2xl">
                      {result.createdLeads ?? 0}
                    </div>
                    <div className="text-emerald-700">Nouveaux leads</div>
                  </div>
                  <div className="p-3 rounded bg-amber-50 border border-amber-200">
                    <div className="text-amber-900 font-bold text-2xl">
                      {result.skipped ?? 0}
                    </div>
                    <div className="text-amber-700">Doublons (déjà importés)</div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {result.fetched ?? 0} ligne(s) traitée(s) depuis Intimura.
                </p>
                <div className="flex gap-2 pt-2">
                  <Button onClick={() => (window.location.hash = "#/leads")}>
                    Voir les leads
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.close()}
                  >
                    Fermer cet onglet
                  </Button>
                </div>
              </div>
            )}
            {status === "error" && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-red-700">
                  <XCircle className="h-6 w-6" />
                  <span className="text-lg font-semibold">Échec de l'import</span>
                </div>
                <div className="text-sm p-3 rounded bg-red-50 border border-red-200 text-red-900">
                  {result.message || result.error || "Erreur inconnue"}
                </div>
                <Button
                  variant="outline"
                  onClick={() => (window.location.hash = "#/intimura-bookmarklet")}
                >
                  Retour à la configuration
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
