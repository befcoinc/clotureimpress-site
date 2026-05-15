import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, AlertCircle, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/lib/language-context";
import { useToast } from "@/hooks/use-toast";
import { useRole } from "@/lib/role-context";
import { apiRequest, queryClient } from "@/lib/queryClient";

export function IntimuraBookmarklet() {
  const { language } = useLanguage();
  const { currentUser } = useRole();
  const { toast } = useToast();
  const isEn = language === "en";
  const canSync =
    currentUser?.role === "admin" || currentUser?.role === "sales_director";

  const { data: credsStatus, isLoading, isError } = useQuery<{
    bookmarkletToken: string;
    hasServerCredentials?: boolean;
    hasCookie?: boolean;
    hasCfServiceToken?: boolean;
  }>({
    queryKey: ["/api/intimura/credentials"],
    enabled: !!currentUser && canSync,
  });

  const { data: autoSync } = useQuery<{
    enabled: boolean;
    intervalMinutes: number;
    lastAt: string | null;
    lastOk: boolean;
    lastError: string | null;
    lastResult?: { createdLeads?: number; skipped?: number; detailsUpdated?: number };
  }>({
    queryKey: ["/api/intimura/auto-sync/status"],
    enabled: !!currentUser && canSync,
    refetchInterval: 60_000,
  });

  const serverSyncMut = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/intimura/sync", {}),
    onSuccess: (data: {
      createdLeads?: number;
      createdQuotes?: number;
      skipped?: number;
      detailsUpdated?: number;
      fetchedFromIntimura?: number;
    }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/intimura/auto-sync/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({
        title: isEn ? "Server sync complete" : "Sync serveur terminée",
        description: isEn
          ? `${data.createdLeads ?? 0} new lead(s), ${data.createdQuotes ?? 0} quote(s), ${data.detailsUpdated ?? 0} full sheet(s). ${data.skipped ?? 0} skipped.`
          : `${data.createdLeads ?? 0} nouveau(x) lead(s), ${data.createdQuotes ?? 0} soumission(s), ${data.detailsUpdated ?? 0} fiche(s) complète(s). ${data.skipped ?? 0} ignoré(s).`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: isEn ? "Sync failed" : "Échec de la sync",
        description: err?.message || String(err),
        variant: "destructive",
      });
    },
  });

  const apiBase = typeof window !== "undefined" ? window.location.origin : "";
  const token = credsStatus?.bookmarkletToken || "";
  const syncDragRef = useRef<HTMLAnchorElement | null>(null);

  /** Favori court → charge /api/intimura/bookmarklet.js (évite favori tronqué = rien ne se passe). */
  const syncBookmarkletJs = token
    ? `javascript:(function(){var b='${apiBase}';var t='${token}';var o=document.getElementById('ci-sync-status');if(o)o.remove();var s=document.createElement('script');s.src=b+'/api/intimura/bookmarklet.js?token='+encodeURIComponent(t);s.onerror=function(){alert('Script sync non charge. Reinstalle le favori depuis '+b+'/#/intimura-bookmarklet');};document.head.appendChild(s);})();`
    : "";

  useEffect(() => {
    if (syncDragRef.current && syncBookmarkletJs) {
      syncDragRef.current.setAttribute("href", syncBookmarkletJs);
    }
  }, [syncBookmarkletJs]);

  const copyBookmarklet = () => {
    navigator.clipboard.writeText(syncBookmarkletJs);
    toast({
      title: isEn ? "Bookmarklet copied" : "Bookmarklet copié",
      description: isEn
        ? "Paste as bookmark URL (must start with javascript:)"
        : "Colle comme URL du favori (doit commencer par javascript:)",
    });
  };

  return (
    <>
      <PageHeader
        title={isEn ? "Intimura sync" : "Synchronisation Intimura"}
        description={
          isEn
            ? "One bookmark on the quotes list: imports leads and full submission sheets into ClôturePro."
            : "Un seul favori sur la liste des soumissions : importe les leads et les fiches complètes dans ClôturePro."
        }
      />

      <div className="p-6 lg:p-8 space-y-6">
        {!canSync ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="pt-6 text-sm">
              {isEn
                ? "Only admins and sales directors can configure Intimura sync."
                : "Seuls les administrateurs et la direction des ventes peuvent configurer la synchronisation Intimura."}
            </CardContent>
          </Card>
        ) : isLoading ? (
          <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/40">
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm font-medium text-amber-900">
                  {isEn ? "Loading credentials..." : "Chargement des identifiants..."}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : isError || !token ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="text-sm space-y-1">
                  <p className="font-medium">
                    {isEn ? "Unable to load sync token" : "Impossible de charger le jeton de synchronisation"}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {isEn ? "Reload the page or contact an administrator." : "Recharge la page ou contacte un administrateur."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-red-300 bg-red-50 dark:bg-red-950/30">
              <CardContent className="pt-6 text-sm text-red-900 dark:text-red-100 space-y-2">
                <p className="font-semibold">
                  {isEn ? "Remove old bookmarks first" : "Supprime d'abord les anciens favoris"}
                </p>
                <p className="text-xs">
                  {isEn
                    ? "Delete « Sync nouveaux leads » and « Sync détails » from your bar — they are replaced by a single button below."
                    : "Supprime « Sync nouveaux leads » et « Sync détails » de ta barre de favoris — remplacés par un seul bouton ci-dessous."}
                </p>
              </CardContent>
            </Card>

            <Card className="border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20">
              <CardHeader>
                <CardTitle className="text-base">
                  {isEn ? "Single bookmark — full sync" : "Un seul favori — sync complète"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button asChild className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700">
                  <a href="/sync-intimura-install" target="_blank" rel="noreferrer">
                    {isEn ? "Open install page (drag the button)" : "Ouvrir la page d'installation (glisser le bouton)"}
                  </a>
                </Button>
                <p className="text-sm text-muted-foreground">
                  {isEn
                    ? "On crm.intimura.com/app/quotes, click once: each visible row becomes a lead + full submission in ClôturePro (same data as opening each quote)."
                    : "Sur crm.intimura.com/app/quotes, un clic : chaque ligne visible devient un lead + une soumission complète dans ClôturePro (mêmes données que si tu cliquais sur chaque nom)."}
                </p>
                <div className="flex gap-2 items-start flex-wrap">
                  <a
                    ref={syncDragRef}
                    href="#"
                    draggable
                    onClick={(e) => e.preventDefault()}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      copyBookmarklet();
                    }}
                    className="inline-block px-8 py-4 rounded-lg bg-emerald-600 text-white font-bold text-lg shadow-lg hover:bg-emerald-700 cursor-grab active:cursor-grabbing"
                    data-testid="bookmarklet-drag-sync"
                  >
                    ⇩ {isEn ? "Sync Intimura → ClôturePro" : "Sync Intimura → ClôturePro"}
                  </a>
                  <Button size="sm" variant="outline" className="gap-2" onClick={copyBookmarklet}>
                    <Copy className="h-4 w-4" />
                    {isEn ? "Copy code" : "Copier le code"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isEn
                    ? "When you click it on Intimura, a green box appears top-right (progress). If nothing appears, reinstall this bookmark."
                    : "Au clic sur Intimura, une boîte verte en haut à droite affiche la progression. Si rien n'apparaît, réinstalle ce favori."}
                </p>
              </CardContent>
            </Card>

            <Card className={autoSync?.enabled ? "border-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/30" : "border-border"}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <RefreshCw className={`h-4 w-4 ${autoSync?.enabled ? "text-emerald-600" : ""}`} />
                  {isEn ? "Optional: automatic sync (server)" : "Optionnel : sync automatique (serveur)"}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                {autoSync?.enabled ? (
                  <>
                    <p className="text-emerald-800 dark:text-emerald-200">
                      {isEn
                        ? `Runs every ${autoSync.intervalMinutes} min without opening Intimura.`
                        : `Tourne toutes les ${autoSync.intervalMinutes} min sans ouvrir Intimura.`}
                    </p>
                    {autoSync.lastAt && (
                      <p className="text-xs text-muted-foreground">
                        {isEn ? "Last run" : "Dernière exécution"} :{" "}
                        {new Date(autoSync.lastAt).toLocaleString(isEn ? "en-CA" : "fr-CA")}
                        {!autoSync.lastOk && autoSync.lastError && (
                          <span className="text-red-600 block mt-1">{autoSync.lastError}</span>
                        )}
                      </p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      disabled={serverSyncMut.isPending}
                      onClick={() => serverSyncMut.mutate()}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 mr-2 ${serverSyncMut.isPending ? "animate-spin" : ""}`} />
                      {isEn ? "Run server sync now" : "Lancer la sync serveur"}
                    </Button>
                  </>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    {isEn
                      ? "Not configured on Render. The bookmark above is enough for manual sync."
                      : "Non configuré sur Render. Le favori ci-dessus suffit pour la sync manuelle."}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/40">
              <CardContent className="pt-6 text-sm text-amber-900 space-y-2">
                <p className="font-medium">
                  {isEn ? "Token invalid?" : "Token invalide ?"}
                </p>
                <ul className="text-xs text-amber-800 list-disc pl-4 space-y-1">
                  <li>
                    {isEn
                      ? "Install the bookmark from this page while logged into ClôturePro."
                      : "Installe le favori depuis cette page, connecté à ClôturePro."}
                  </li>
                  <li>
                    {isEn
                      ? "Never copy the URL from the address bar (%27 breaks the token)."
                      : "Ne copie jamais l'URL depuis la barre d'adresse (les %27 cassent le token)."}
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{isEn ? "How to use" : "Mode d'emploi"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ol className="list-decimal pl-5 space-y-2">
                  <li>
                    {isEn ? "Delete the two old bookmarks from your bar." : "Supprime les 2 anciens favoris de ta barre."}
                  </li>
                  <li>
                    {isEn ? "Drag " : "Glisse "}
                    <Badge className="bg-emerald-600">{isEn ? "Sync Intimura → ClôturePro" : "Sync Intimura → ClôturePro"}</Badge>
                    {isEn ? " to the bookmarks bar (from this page)." : " dans la barre de favoris (depuis cette page)."}
                  </li>
                  <li>
                    {isEn ? "Open " : "Ouvre "}
                    <a href="https://crm.intimura.com/app/quotes" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                      crm.intimura.com/app/quotes
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    {isEn ? " (the list, max 40 visible rows)." : " (la liste, max 40 lignes visibles)."}
                  </li>
                  <li>
                    {isEn ? "Click the bookmark once. Wait for the summary alert, then check " : "Clique le favori une fois. Attends le message de fin, puis va dans "}
                    <Badge variant="secondary">{isEn ? "Submissions" : "Soumissions"}</Badge>
                    {isEn ? " in ClôturePro." : " dans ClôturePro."}
                  </li>
                </ol>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
