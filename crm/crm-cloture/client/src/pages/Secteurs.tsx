import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import type { Lead, Quote } from "@shared/schema";
import { PROVINCES } from "@shared/schema";

function normalizeForSearch(value: string) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function Secteurs() {
  const { language } = useLanguage();
  const isEn = language === "en";
  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const { data: quotes = [] } = useQuery<Quote[]>({ queryKey: ["/api/quotes"] });
  const activeLeads = leads.filter(l => l.status !== "test");

  const moneyFmt = new Intl.NumberFormat(isEn ? "en-CA" : "fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

  const byProvince = useMemo(() => {
    return PROVINCES.map(p => {
      const pLeads = activeLeads.filter(l => l.province === p);
      const pQuotes = quotes.filter(q => q.province === p);
      return {
        province: p,
        leads: pLeads.length,
        quotes: pQuotes.length,
        won: pQuotes.filter(q => q.salesStatus === "signee").length,
        value: pQuotes.reduce((s, q) => s + (q.estimatedPrice || 0), 0),
      };
    }).filter(x => x.leads > 0 || x.quotes > 0);
  }, [activeLeads, quotes]);

  const bySector = useMemo(() => {
    const map = new Map<string, { count: number; value: number; quotes: number; province: string }>();
    for (const l of activeLeads) {
      const key = l.sector || (isEn ? "Unclassified" : "Non classé");
      const cur = map.get(key) || { count: 0, value: 0, quotes: 0, province: l.province || "?" };
      cur.count += 1; cur.value += l.estimatedValue || 0;
      map.set(key, cur);
    }
    for (const q of quotes) {
      const key = q.sector || (isEn ? "Unclassified" : "Non classé");
      const cur = map.get(key) || { count: 0, value: 0, quotes: 0, province: q.province || "?" };
      cur.quotes += 1;
      map.set(key, cur);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].count + b[1].quotes - a[1].count - a[1].quotes);
  }, [activeLeads, quotes, isEn]);

  // Group by city
  const byCity = useMemo(() => {
    const map = new Map<string, { city: string; province: string; leads: number; value: number; quotes: number }>();
    for (const l of activeLeads) {
      const cityRaw = (l.city || "?").trim() || "?";
      const province = l.province || "?";
      const key = `${province}|${normalizeForSearch(cityRaw) || "?"}`;
      const cur = map.get(key) || { city: cityRaw, province, leads: 0, value: 0, quotes: 0 };
      if (cur.city === "?" && cityRaw !== "?") cur.city = cityRaw;
      cur.leads += 1; cur.value += l.estimatedValue || 0;
      map.set(key, cur);
    }
    for (const q of quotes) {
      const cityRaw = (q.city || "?").trim() || "?";
      const province = q.province || "?";
      const key = `${province}|${normalizeForSearch(cityRaw) || "?"}`;
      const cur = map.get(key) || { city: cityRaw, province, leads: 0, value: 0, quotes: 0 };
      if (cur.city === "?" && cityRaw !== "?") cur.city = cityRaw;
      cur.quotes += 1;
      map.set(key, cur);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].leads - a[1].leads);
  }, [activeLeads, quotes]);

  return (
    <>
      <PageHeader
        title={isEn ? "Sectors & planning" : "Secteurs & planification"}
        description={isEn ? "Geographic view to optimize daily installation grouping by province, city and neighborhood." : "Vue géographique pour optimiser le regroupement quotidien des installations par province, ville et quartier."}
      />
      <div className="p-6 lg:p-8 space-y-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" /> {isEn ? "By province" : "Par province"}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {byProvince.map(p => (
                <div key={p.province} className="rounded-md border border-card-border bg-card p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <Badge variant="outline" className="text-[11px] font-bold">{p.province}</Badge>
                    <span className="text-[10px] text-muted-foreground">{p.won} {isEn ? "signed" : "signées"}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{isEn ? "Leads" : "Leads"}</div>
                  <div className="text-xl font-bold tabular">{p.leads}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">{isEn ? "Quotes" : "Soumissions"}: <span className="font-semibold text-foreground">{p.quotes}</span></div>
                  <div className="text-[11px] text-muted-foreground">{isEn ? "Value" : "Valeur"}: <span className="font-semibold text-foreground tabular">{moneyFmt.format(p.value)}</span></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{isEn ? "Top cities" : "Top villes"}</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
                {byCity.map(([cityKey, info]) => (
                  <li key={cityKey}>
                    {info.city !== "?" ? (
                      <Link
                        href={`/soumissions?city=${encodeURIComponent(info.city)}&province=${encodeURIComponent(info.province)}`}
                        className="flex items-center justify-between gap-3 rounded-md border border-card-border bg-card p-2.5 hover-elevate"
                        data-testid={`link-city-${normalizeForSearch(info.city) || "unknown"}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-[13px] truncate">{info.city}</div>
                          <div className="text-[10px] text-muted-foreground"><Badge variant="outline" className="text-[10px] mr-1">{info.province}</Badge> {info.quotes} {isEn ? "quote(s)" : "soumission(s)"}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-[14px] tabular">{info.leads}</div>
                          <div className="text-[10px] text-muted-foreground tabular">{moneyFmt.format(info.value)}</div>
                        </div>
                      </Link>
                    ) : (
                      <div className="flex items-center justify-between gap-3 rounded-md border border-card-border bg-card p-2.5 hover-elevate">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-[13px] truncate">{info.city}</div>
                          <div className="text-[10px] text-muted-foreground"><Badge variant="outline" className="text-[10px] mr-1">{info.province}</Badge> {info.quotes} {isEn ? "quote(s)" : "soumission(s)"}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-[14px] tabular">{info.leads}</div>
                          <div className="text-[10px] text-muted-foreground tabular">{moneyFmt.format(info.value)}</div>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{isEn ? "Detailed sectors (province > city > neighborhood)" : "Secteurs détaillés (province › ville › quartier)"}</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
                {bySector.map(([sector, info]) => (
                  <li key={sector} className="flex items-center justify-between gap-3 rounded-md border border-card-border bg-card p-2.5 hover-elevate">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-[12px] truncate">{sector}</div>
                      <div className="text-[10px] text-muted-foreground">{info.count} lead(s) · {info.quotes} {isEn ? "quote(s)" : "soumission(s)"}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-[14px] tabular">{info.count + info.quotes}</div>
                      <div className="text-[10px] text-muted-foreground tabular">{moneyFmt.format(info.value)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
