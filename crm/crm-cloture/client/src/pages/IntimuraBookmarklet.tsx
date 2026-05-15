import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/lib/language-context";
import { useToast } from "@/hooks/use-toast";
import { useRole } from "@/lib/role-context";

export function IntimuraBookmarklet() {
  const { language } = useLanguage();
  const { currentUser } = useRole();
  const { toast } = useToast();
  const isEn = language === "en";
  const canSync =
    currentUser?.role === "admin" || currentUser?.role === "sales_director";

  const { data: credsStatus, isLoading, isError } = useQuery<{ bookmarkletToken: string }>({
    queryKey: ["/api/intimura/credentials"],
    enabled: !!currentUser && canSync,
  });

  const apiBase = typeof window !== "undefined" ? window.location.origin : "";
  const token = credsStatus?.bookmarkletToken || "";
  const listDragRef = useRef<HTMLAnchorElement | null>(null);
  const detailsDragRef = useRef<HTMLAnchorElement | null>(null);

  const listBookmarkletJs = token
    ? `javascript:(function(){try{var t=document.querySelector('table');if(!t){alert('Va sur la liste crm.intimura.com/app/quotes');return;}var heads=[].slice.call(t.querySelectorAll('thead th, thead td')).map(function(h){return (h.textContent||'').trim().toLowerCase();});var trs=t.querySelectorAll('tbody tr');var rows=[];trs.forEach(function(tr){var tds=tr.querySelectorAll('td');if(!tds.length)return;var o={};tds.forEach(function(td,j){var key=heads[j]||('col'+j);o[key]=(td.textContent||'').trim();});var link=tr.querySelector('a[href]');if(link){var href=link.getAttribute('href')||'';o._href=href;var m=href.match(/([0-9a-fA-F-]{8,})/);if(m){o._id=m[1];}else{var n=href.match(/(\\d{2,})/);if(n)o._id=n[1];}}rows.push(o);});if(!rows.length){alert('Tableau vide.');return;}if(rows.length>40){alert('Max 40 lignes. Filtre la liste.');return;}var ingestUrl='${apiBase}/api/intimura/ingest?token=${token}';var detailsUrl='${apiBase}/api/intimura/ingest-details?token=${token}';fetch(ingestUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload:rows})}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.message||j.error||('HTTP '+r.status));return j;});}).then(function(summary){var newIds=summary.createdIntimuraIds||[];if(!newIds.length){alert('Aucun nouveau lead. '+(summary.skipped||0)+' deja dans le CRM.');return {summary:summary,details:{updated:0}};}var items=[],i=0;function next(){if(i>=newIds.length)return fetch(detailsUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:items})}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.message||j.error||('HTTP '+r.status));return {summary:summary,details:j};});});var id=newIds[i++];return fetch(location.origin+'/app/quotes/'+id+'/__data.json?x-sveltekit-invalidated=001',{credentials:'include'}).then(function(r){return r.ok?r.json():null;}).then(function(p){if(p){var n=(p.nodes||[]).find(function(x){return x&&x.type==='data';});if(n&&n.data)items.push({intimuraId:id,svelteData:n.data});}}).catch(function(){}).then(next);}return next();}).then(function(res){if(!res)return;var s=res.summary||{},d=res.details||{};alert((s.createdLeads||0)+' nouveau(x) lead(s), '+(d.updated||0)+' fiche(s) detaillee(s). '+(s.skipped||0)+' deja present(s).');window.open('${apiBase}/#/leads','_blank');}).catch(function(e){alert('Echec: '+(e&&e.message?e.message:e));});}catch(e){alert('Erreur: '+(e&&e.message?e.message:e));}})();`
    : "";

  const detailsBookmarkletJs = token
    ? `javascript:(function(){try{var m=location.pathname.match(/\\/quotes\\/([0-9a-f-]+)/i);if(!m){alert('Ouvre une fiche soumission Intimura (page /app/quotes/...).');return;}var id=m[1];var dataUrl=location.origin+'/app/quotes/'+id+'/__data.json?x-sveltekit-invalidated=001';fetch(dataUrl,{credentials:'include'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).then(function(payload){var node=(payload.nodes||[]).find(function(n){return n&&n.type==='data';});if(!node||!node.data)throw new Error('Donnees soumission introuvables');var url='${apiBase}/api/intimura/ingest-details?token=${token}';return fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intimuraId:id,svelteData:node.data})});}).then(function(r){return r.json().catch(function(){return {};}).then(function(j){if(!r.ok){throw new Error(j.message||j.error||('HTTP '+r.status));}return j;});}).then(function(j){var ok=(j.results||[]).filter(function(x){return x.ok;}).length;var skip=(j.results||[]).filter(function(x){return x.reason==='ALREADY_SYNCED').length;if(!ok){alert(skip?'Deja synchronise dans le CRM.':'Soumission introuvable. Sync la liste d abord.');return;}alert('Details importes: '+ok+' nouvelle(s) fiche(s).');window.open('${apiBase}/#/soumissions','_blank');}).catch(function(e){alert('Echec import details: '+(e&&e.message?e.message:e));});}catch(e){alert('Erreur: '+(e&&e.message?e.message:e));}})();`
    : "";

  useEffect(() => {
    if (listDragRef.current && listBookmarkletJs) {
      listDragRef.current.setAttribute("href", listBookmarkletJs);
    }
    if (detailsDragRef.current && detailsBookmarkletJs) {
      detailsDragRef.current.setAttribute("href", detailsBookmarkletJs);
    }
  }, [listBookmarkletJs, detailsBookmarkletJs]);

  const copyBookmarklet = (code: string, label: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: isEn ? "Bookmarklet copied" : "Bookmarklet copié",
      description: label,
    });
  };

  return (
    <>
      <PageHeader
        title={isEn ? "Intimura sync setup" : "Synchronisation Intimura"}
        description={
          isEn
            ? "Imports only new leads from the visible list. Existing ones are skipped automatically."
            : "Importe seulement les nouveaux leads visibles. Les existants sont ignorés automatiquement."
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
            <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/40">
              <CardContent className="pt-6 text-sm text-amber-900 space-y-2">
                <p className="font-medium">
                  {isEn ? "Seeing « invalid token » on Intimura?" : "Tu vois « token invalide » sur Intimura ?"}
                </p>
                <ul className="text-xs text-amber-800 list-disc pl-4 space-y-1">
                  <li>
                    {isEn
                      ? "Delete the old « Sync Clôture Impress » bookmark — it is outdated or corrupted."
                      : "Supprime l'ancien favori « Sync Clôture Impress » — il est périmé ou corrompu."}
                  </li>
                  <li>
                    {isEn
                      ? "Do NOT copy the URL from the address bar (you will get %27 instead of quotes and the token breaks)."
                      : "Ne copie PAS l'URL depuis la barre d'adresse (tu obtiens des %27 à la place des guillemets et le token casse)."}
                  </li>
                  <li>
                    {isEn
                      ? "Drag the green button below into your bookmarks bar, or use « Copy » and paste as bookmark URL."
                      : "Glisse le bouton vert ci-dessous dans tes favoris, ou « Copier » puis colle comme URL du favori."}
                  </li>
                  <li>
                    {isEn
                      ? "The token only works if taken from this page while logged into ClôturePro (token refreshes on deploy)."
                      : "Le token ne fonctionne que s'il vient de cette page connecté à ClôturePro."}
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {isEn ? "1 — Sync new leads only" : "1 — Sync nouveaux leads seulement"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {isEn
                    ? "Detects new rows only. Skips leads already in ClôturePro, then fetches full details for new ones."
                    : "Détecte seulement les nouvelles lignes. Ignore celles déjà dans ClôturePro, puis récupère la fiche complète pour les nouveaux."}
                </p>
                <div className="flex gap-2 items-start flex-wrap">
                  <a
                    ref={listDragRef}
                    href="#"
                    draggable
                    onClick={(e) => e.preventDefault()}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      copyBookmarklet(listBookmarkletJs, isEn ? "List bookmarklet" : "Bookmarklet liste");
                    }}
                    className="inline-block px-6 py-3 rounded-lg bg-emerald-600 text-white font-semibold shadow-lg hover:bg-emerald-700 cursor-grab active:cursor-grabbing"
                    data-testid="bookmarklet-drag-list"
                  >
                    ⇩ {isEn ? "Sync new leads" : "Sync nouveaux leads"}
                  </a>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => copyBookmarklet(listBookmarkletJs, isEn ? "Paste as bookmark URL" : "Coller comme URL du favori")}
                  >
                    <Copy className="h-4 w-4" />
                    {isEn ? "Copy code" : "Copier le code"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isEn
                    ? "Paste as bookmark URL (must start with javascript:, no %27 in the text)."
                    : "Colle comme URL du favori (doit commencer par javascript:, sans %27 dans le texte)."}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {isEn ? "2 — Detail sync (address, phone, items)" : "2 — Sync détails (adresse, téléphone, articles)"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {isEn
                    ? "Open one submission in Intimura, then click this bookmarklet."
                    : "Ouvre une soumission dans Intimura, puis clique ce bookmarklet."}
                </p>
                <div className="flex gap-2 items-start flex-wrap">
                  <a
                    ref={detailsDragRef}
                    href="#"
                    draggable
                    onClick={(e) => e.preventDefault()}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      copyBookmarklet(detailsBookmarkletJs, isEn ? "Details bookmarklet" : "Bookmarklet détails");
                    }}
                    className="inline-block px-6 py-3 rounded-lg bg-sky-600 text-white font-semibold shadow-lg hover:bg-sky-700 cursor-grab active:cursor-grabbing"
                    data-testid="bookmarklet-drag-details"
                  >
                    ⇩ {isEn ? "Sync details" : "Sync détails"}
                  </a>
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => copyBookmarklet(detailsBookmarkletJs, isEn ? "Details" : "Détails")}>
                    <Copy className="h-4 w-4" />
                    {isEn ? "Copy" : "Copier"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{isEn ? "How to use" : "Mode d'emploi"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ol className="list-decimal pl-5 space-y-2">
                  <li>
                    {isEn ? "Log in at " : "Connecte-toi sur "}
                    <a href="https://crm.intimura.com/app/quotes" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                      crm.intimura.com
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                  <li>
                    {isEn ? "Click " : "Clique "}
                    <Badge variant="secondary">{isEn ? "Sync list" : "Sync liste"}</Badge>
                    {isEn ? " on the quotes list." : " sur la liste des soumissions."}
                  </li>
                  <li>
                    {isEn ? "For empty submissions, open the quote and click " : "Pour les soumissions vides, ouvre la fiche et clique "}
                    <Badge variant="secondary">{isEn ? "Sync details" : "Sync détails"}</Badge>.
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