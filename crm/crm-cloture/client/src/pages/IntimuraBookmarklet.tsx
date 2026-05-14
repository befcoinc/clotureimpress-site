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

  const { data: credsStatus } = useQuery<{ bookmarkletToken: string }>({
    queryKey: ["/api/intimura/credentials"],
    enabled: !!currentUser,
  });

  const apiBase = typeof window !== "undefined" ? window.location.origin : "";
  const token = credsStatus?.bookmarkletToken || "";
  const dragRef = useRef<HTMLAnchorElement | null>(null);
  // Bookmarklet strategy: scrape the visible quotes table on intimura.com,
  // then open a NEW TAB on the CRM origin with the payload via sessionStorage.
  // This avoids URL length limits, encoding issues, and Wouter query-param parsing bugs entirely.
  const bookmarkletJs = token
    ? `javascript:(function(){try{var t=document.querySelector('table');if(!t){alert('Aucun tableau trouve sur cette page. Va sur la liste des quotes Intimura.');return;}var heads=[].slice.call(t.querySelectorAll('thead th, thead td')).map(function(h){return (h.textContent||'').trim().toLowerCase();});var trs=t.querySelectorAll('tbody tr');var rows=[];trs.forEach(function(tr){var tds=tr.querySelectorAll('td');if(!tds.length)return;var o={};tds.forEach(function(td,j){var key=heads[j]||('col'+j);o[key]=(td.textContent||'').trim();});var link=tr.querySelector('a[href]');if(link){var href=link.getAttribute('href')||'';o._href=href;var m=href.match(/([0-9a-fA-F-]{8,})/);if(m){o._id=m[1];}else{var n=href.match(/(\\d{2,})/);if(n)o._id=n[1];}}rows.push(o);});if(!rows.length){alert('Le tableau est vide ou les lignes n ont pas pu etre lues.');return;}var payload=JSON.stringify(rows);if(payload.length>8000000){alert('Trop de donnees pour un seul transfert. Filtre la liste sur Intimura.');return;}var encoded=btoa(unescape(encodeURIComponent(payload)));var url='${apiBase}/#/intimura-receive?token=${token}&data='+encodeURIComponent(encoded);console.log('[bookmarklet] Opening URL with '+payload.length+' bytes of data');window.open(url,'_blank');}catch(e){alert('Erreur bookmarklet: '+(e&&e.message?e.message:e));}})();`
    : "";

  // Set href via DOM to avoid any React/HTML attribute escaping of special chars.
  useEffect(() => {
    if (dragRef.current && bookmarkletJs) {
      dragRef.current.setAttribute("href", bookmarkletJs);
    }
  }, [bookmarkletJs]);

  return (
    <>
      <PageHeader
        title={isEn ? "Intimura Bookmarklet Setup" : "Setup Bookmarklet Intimura"}
        description={
          isEn
            ? "One-click sync from the visible quotes table in your browser. Drag the bookmarklet below to your bookmarks bar."
            : "Synchronisation en 1 clic depuis le tableau visible dans ton navigateur. Glisse le bookmarklet ci-dessous dans ta barre de favoris."
        }
      />

      <div className="p-6 lg:p-8 space-y-6">
        {!token ? (
          <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/40">
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-900">
                    {isEn ? "Credentials loading..." : "Chargement des identifiants..."}
                  </p>
                  <p className="text-amber-800 text-xs mt-1">
                    {isEn
                      ? "Refresh the page if this takes more than a few seconds."
                      : "Recharge la page si ça prend plus de quelques secondes."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {isEn ? "Step 1: Drag to bookmarks bar" : "Étape 1 : Glisse dans ta barre de favoris"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {isEn
                    ? "Right-click (or drag) the green button below directly to your bookmarks bar. It reads the visible table first."
                    : "Clic droit (ou glisse) le bouton vert ci-dessous directement dans ta barre de favoris. Il lit d'abord le tableau visible."}
                </p>
                <div className="flex gap-2 items-start">
                  <a
                    ref={dragRef}
                    href="#"
                    draggable
                    onClick={(e) => e.preventDefault()}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      navigator.clipboard.writeText(bookmarkletJs);
                      toast({
                        title: isEn ? "Bookmarklet copied" : "Bookmarklet copié",
                        description: isEn
                          ? "Paste it in your bookmarks"
                          : "Colle-le dans tes signets",
                      });
                    }}
                    className="inline-block px-6 py-3 rounded-lg bg-emerald-600 text-white font-semibold shadow-lg hover:bg-emerald-700 cursor-grab active:cursor-grabbing"
                    data-testid="bookmarklet-drag"
                  >
                    ⇩ {isEn ? "Sync Cloture Impress" : "Sync Clôture Impress"}
                  </a>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>{isEn ? "→ Drag to bookmarks bar" : "→ Glisse dans favoris"}</p>
                    <p>{isEn ? "or right-click → Bookmark this link" : "ou clic droit → Marquer cette page"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {isEn ? "Step 2: Use it" : "Étape 2 : Utilise-le"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ol className="list-decimal pl-5 space-y-2">
                  <li>
                    {isEn ? "Go to " : "Va sur "}
                    <a
                      href="https://crm.intimura.com/app/quotes"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary underline"
                    >
                      crm.intimura.com
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    {isEn ? " and log in (enter the 6-digit code)." : " et connecte-toi (entre le code à 6 chiffres)."}
                  </li>
                  <li>
                    {isEn
                      ? "Click the "
                      : "Clique sur le "}
                    <Badge variant="secondary">
                      {isEn ? "Sync Cloture Impress" : "Sync Clôture Impress"}
                    </Badge>
                    {isEn ? " bookmark in your bar. It syncs the rows you can see." : " dans ta barre de favoris. Il synchronise les lignes visibles."}
                  </li>
                  <li>
                    {isEn
                      ? "An alert shows how many leads were imported. Done!"
                      : "Une alerte montre combien de leads ont été importés. C'est tout !"}
                  </li>
                </ol>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
              <CardTitle className="text-base">
                  {isEn ? "Can't drag? Copy the code instead:" : "Tu ne peux pas glisser ? Copie le code :"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(bookmarkletJs);
                    toast({ title: isEn ? "Copied" : "Copié !" });
                  }}
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  data-testid="button-copy-bookmarklet-code"
                >
                  <Copy className="h-4 w-4" /> {isEn ? "Copy code" : "Copier le code"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {isEn
                    ? "Right-click your bookmarks bar → Add page → Paste in the URL field."
                    : "Clic droit sur ta barre de favoris → Ajouter une page → Colle dans le champ URL."}
                </p>
                <details className="text-xs">
                  <summary className="cursor-pointer font-medium">
                    {isEn ? "Show code" : "Voir le code"}
                  </summary>
                  <pre className="mt-2 p-2 rounded bg-muted overflow-x-auto text-xs">
                    {bookmarkletJs.slice(0, 200)}...
                  </pre>
                </details>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
