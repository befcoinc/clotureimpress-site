import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleMarker, MapContainer, Popup, TileLayer, ZoomControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { CalendarDays, DollarSign, Flame, MapPin, Route, Target, Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/lib/language-context";
import type { Lead, Quote } from "@shared/schema";
import { PROVINCES, SALES_STATUSES, INSTALL_STATUSES } from "@shared/schema";

type MapQuote = Quote & {
  lat: number;
  lng: number;
  mapCity: string;
  stageLabel: string;
  stageTone: "lead" | "sent" | "follow" | "appointment" | "signed" | "install" | "problem";
};

type Hotspot = {
  city: string;
  province: string;
  sector: string;
  count: number;
  value: number;
  active: number;
  signed: number;
  installReady: number;
  lat: number;
  lng: number;
  quotes: MapQuote[];
};

const CITY_COORDS: Record<string, [number, number]> = {
  "vancouver": [49.2827, -123.1207],
  "calgary": [51.0447, -114.0719],
  "edmonton": [53.5461, -113.4938],
  "winnipeg": [49.8951, -97.1384],
  "toronto": [43.6532, -79.3832],
  "mississauga": [43.589, -79.6441],
  "ottawa": [45.4215, -75.6972],
  "gatineau": [45.4765, -75.7013],
  "cantley": [45.5668, -75.7829],
  "montréal": [45.5019, -73.5674],
  "montreal": [45.5019, -73.5674],
  "laval": [45.6066, -73.7124],
  "longueuil": [45.5312, -73.5181],
  "québec": [46.8139, -71.208],
  "quebec": [46.8139, -71.208],
  "lévis": [46.7382, -71.2465],
  "levis": [46.7382, -71.2465],
  "sherbrooke": [45.4042, -71.8929],
  "rimouski": [48.4489, -68.523],
  "gaspé": [48.8306, -64.4819],
  "gaspe": [48.8306, -64.4819],
  "alma": [48.5501, -71.65],
  "val-d'or": [48.0974, -77.7974],
  "entrelacs": [46.113, -74.003],
  "carleton-sur-mer": [48.1042, -66.125],
  "saint-honoré": [48.533, -71.083],
  "saint-honore": [48.533, -71.083],
  "moncton": [46.0878, -64.7782],
};

function normalize(value?: string | null) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function prettyCity(value?: string | null) {
  if (!value) return "Ville inconnue";
  return value.replace(/quÉbec/gi, "Québec").trim();
}

function fallbackCoord(index: number): [number, number] {
  return [46.7 + (index % 7) * 0.45, -73.9 + Math.floor(index / 7) * 1.15];
}

function getStage(quote: Quote): MapQuote["stageTone"] {
  if (quote.installStatus === "probleme") return "problem";
  if (["planifiee", "materiel", "en_route", "en_cours", "inspection", "terminee"].includes(quote.installStatus)) return "install";
  if (quote.salesStatus === "signee") return "signed";
  if (quote.salesStatus === "rendez_vous") return "appointment";
  if (quote.salesStatus === "suivi") return "follow";
  if (["envoyee", "rdv_mesure"].includes(quote.salesStatus)) return "sent";
  return "lead";
}

function getStageLabel(quote: Quote) {
  const sales = SALES_STATUSES[quote.salesStatus as keyof typeof SALES_STATUSES] || quote.salesStatus;
  const install = INSTALL_STATUSES[quote.installStatus as keyof typeof INSTALL_STATUSES] || quote.installStatus;
  if (quote.salesStatus === "signee") return `Vente signée · ${install}`;
  if (quote.installStatus !== "a_planifier") return `${sales} · ${install}`;
  return sales;
}

const STAGE_COLORS: Record<MapQuote["stageTone"], string> = {
  lead: "#2563eb",
  sent: "#0891b2",
  follow: "#d97706",
  appointment: "#f97316",
  signed: "#059669",
  install: "#7c3aed",
  problem: "#dc2626",
};

export function Heatmap() {
  const { language } = useLanguage();
  const isEn = language === "en";
  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const { data: quotes = [] } = useQuery<Quote[]>({ queryKey: ["/api/quotes"] });
  const [province, setProvince] = useState("all");
  const [metric, setMetric] = useState<"count" | "value">("count");
  const [stage, setStage] = useState("all");
  const moneyFmt = new Intl.NumberFormat(isEn ? "en-CA" : "fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

  const mapQuotes = useMemo(() => {
    let fallbackIndex = 0;
    return quotes
      .filter(q => q.intimuraId)
      .map((q) => {
        const city = prettyCity(q.city);
        const key = normalize(city);
        const base = CITY_COORDS[key] || fallbackCoord(fallbackIndex++);
        const jitterSeed = q.id % 9;
        const lat = base[0] + ((jitterSeed % 3) - 1) * 0.018;
        const lng = base[1] + (Math.floor(jitterSeed / 3) - 1) * 0.026;
        return {
          ...q,
          lat,
          lng,
          mapCity: city,
          stageTone: getStage(q),
          stageLabel: getStageLabel(q),
        } satisfies MapQuote;
      })
      .filter(q => province === "all" || q.province === province)
      .filter(q => stage === "all" || q.stageTone === stage || q.salesStatus === stage || q.installStatus === stage);
  }, [quotes, province, stage]);

  const hotspots = useMemo(() => {
    const map = new Map<string, Hotspot>();
    for (const q of mapQuotes) {
      const key = `${q.province}-${normalize(q.mapCity)}`;
      const cur = map.get(key) || {
        city: q.mapCity,
        province: q.province || "QC",
        sector: q.sector || `${q.province || "QC"} › ${q.mapCity}`,
        count: 0,
        value: 0,
        active: 0,
        signed: 0,
        installReady: 0,
        lat: q.lat,
        lng: q.lng,
        quotes: [],
      };
      cur.count += 1;
      cur.value += q.estimatedPrice || 0;
      if (!["perdue", "signee"].includes(q.salesStatus)) cur.active += 1;
      if (q.salesStatus === "signee") cur.signed += 1;
      if (q.installStatus === "a_planifier" || q.installStatus === "planifiee") cur.installReady += 1;
      cur.quotes.push(q);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => (metric === "count" ? b.count - a.count : b.value - a.value));
  }, [mapQuotes, metric]);

  const maxIntensity = Math.max(1, ...hotspots.map(h => metric === "count" ? h.count : h.value));
  const totalValue = hotspots.reduce((s, h) => s + h.value, 0);
  const totalClients = hotspots.reduce((s, h) => s + h.count, 0);
  const topHotspot = hotspots[0];
  const center: [number, number] = province === "all" ? [48.3, -73.8] : (hotspots[0] ? [hotspots[0].lat, hotspots[0].lng] : [46.8, -71.2]);

  const routeDays = useMemo(() => {
    return hotspots
      .map((h) => ({
        zone: `${h.province} · ${h.city}`,
        clients: h.count,
        value: h.value,
        installReady: h.installReady,
        sectors: [h.sector],
      }))
      .sort((a, b) => b.clients - a.clients || b.value - a.value)
      .slice(0, 8);
  }, [hotspots]);

  return (
    <>
      <PageHeader
        title={isEn ? "Sector heatmap" : "Heatmap secteurs"}
        description={isEn ? "Interactive map with zoom, pan, and CRM stages for Intimura quotes." : "Carte interactive avec zoom, déplacement et étapes CRM des soumissions Intimura."}
        action={
          <div className="flex flex-wrap gap-2">
            <Select value={province} onValueChange={setProvince}>
              <SelectTrigger className="w-[135px]" data-testid="select-heatmap-province"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Canada</SelectItem>
                {PROVINCES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={metric} onValueChange={(v) => setMetric(v as "count" | "value")}>
              <SelectTrigger className="w-[160px]" data-testid="select-heatmap-metric"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="count">{isEn ? "Volume intensity" : "Intensité volume"}</SelectItem>
                <SelectItem value="value">{isEn ? "Value intensity" : "Intensité valeur"}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="w-[180px]" data-testid="select-heatmap-stage"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEn ? "All stages" : "Toutes les étapes"}</SelectItem>
                <SelectItem value="lead">{isEn ? "Lead / new" : "Lead / nouveau"}</SelectItem>
                <SelectItem value="sent">{isEn ? "Quote sent" : "Soumission envoyée"}</SelectItem>
                <SelectItem value="follow">{isEn ? "Follow-up" : "Suivi"}</SelectItem>
                <SelectItem value="appointment">{isEn ? "Appointment" : "Rendez-vous"}</SelectItem>
                <SelectItem value="signed">{isEn ? "Sale signed" : "Vente signée"}</SelectItem>
                <SelectItem value="install">Installation</SelectItem>
                <SelectItem value="problem">{isEn ? "Problem" : "Problème"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="p-6 lg:p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label={isEn ? "Hot zones" : "Zones chaudes"} value={hotspots.length} icon={<Flame className="h-4 w-4" />} accent="warning" />
          <KpiCard label={isEn ? "Quotes on map" : "Soumissions sur carte"} value={totalClients} icon={<Users className="h-4 w-4" />} />
          <KpiCard label={isEn ? "Detected value" : "Valeur détectée"} value={moneyFmt.format(totalValue)} icon={<DollarSign className="h-4 w-4" />} accent="success" />
          <KpiCard label={isEn ? "Top sector" : "Top secteur"} value={topHotspot ? topHotspot.city : (isEn ? "None" : "Aucun")} icon={<Target className="h-4 w-4" />} accent="info" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_0.85fr] gap-6">
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" /> {isEn ? "Interactive map with zoom" : "Carte réelle avec zoom"}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[650px] overflow-hidden rounded-xl border border-border">
                <MapContainer
                  center={center}
                  zoom={province === "all" ? 5 : 8}
                  minZoom={3}
                  maxZoom={18}
                  zoomControl={false}
                  scrollWheelZoom
                  className="h-full w-full"
                >
                  <ZoomControl position="topright" />
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {hotspots.map((h) => {
                    const intensity = Math.max(0.2, (metric === "count" ? h.count : h.value) / maxIntensity);
                    const radius = 15 + intensity * 34;
                    const dominant = h.quotes.find(q => q.stageTone === "problem") || h.quotes.find(q => q.stageTone === "install") || h.quotes.find(q => q.stageTone === "signed") || h.quotes.find(q => q.stageTone === "appointment") || h.quotes[0];
                    const color = STAGE_COLORS[dominant?.stageTone || "sent"];
                    return (
                      <CircleMarker
                        key={`${h.province}-${h.city}`}
                        center={[h.lat, h.lng]}
                        radius={radius}
                        pathOptions={{ color, fillColor: color, fillOpacity: 0.33, weight: 2 }}
                        eventHandlers={{}}
                      >
                        <Popup>
                          <div className="min-w-[260px] space-y-2">
                            <div>
                              <div className="font-bold text-sm">{h.city}, {h.province}</div>
                              <div className="text-xs text-slate-500">{h.count} {isEn ? "quote(s)" : "soumission(s)"} · {moneyFmt.format(h.value)}</div>
                            </div>
                            <div className="space-y-2 max-h-[250px] overflow-y-auto">
                              {h.quotes.map(q => (
                                <div key={q.id} className="rounded border border-slate-200 p-2">
                                  <div className="font-semibold text-xs">{q.clientName}</div>
                                  <div className="text-[11px] text-slate-600">{q.stageLabel}</div>
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">{SALES_STATUSES[q.salesStatus as keyof typeof SALES_STATUSES] || q.salesStatus}</span>
                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">{INSTALL_STATUSES[q.installStatus as keyof typeof INSTALL_STATUSES] || q.installStatus}</span>
                                  </div>
                                  <div className="mt-1 text-[11px] font-semibold">{moneyFmt.format(q.estimatedPrice || 0)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </Popup>
                      </CircleMarker>
                    );
                  })}
                </MapContainer>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{isEn ? "CRM stage legend:" : "Légende étapes CRM :"}</span>
                <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-[#0891b2]" />{isEn ? "Quote sent" : "Soumission envoyée"}</span>
                <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-[#d97706]" />{isEn ? "Follow-up" : "Suivi"}</span>
                <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-[#f97316]" />{isEn ? "Appointment" : "Rendez-vous"}</span>
                <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-[#059669]" />{isEn ? "Signed" : "Signée"}</span>
                <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-[#7c3aed]" />Installation</span>
                <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-[#dc2626]" />{isEn ? "Problem" : "Problème"}</span>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Flame className="h-4 w-4" /> {isEn ? "Quotes by sector" : "Soumissions par secteur"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {hotspots.slice(0, 12).map((h, index) => (
                    <div key={`${h.province}-${h.city}-rank`} className="rounded-lg border border-border p-3 hover-elevate" data-testid={`row-hotspot-${index}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-[13px] truncate">{index + 1}. {h.city}</div>
                          <div className="text-[11px] text-muted-foreground truncate">{h.sector}</div>
                        </div>
                        <Badge variant="outline" className="text-[10px]">{h.province}</Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                        <div><span className="text-muted-foreground">{isEn ? "Quotes" : "Soumissions"}</span><div className="font-bold tabular">{h.count}</div></div>
                        <div><span className="text-muted-foreground">{isEn ? "To install" : "À installer"}</span><div className="font-bold tabular">{h.installReady}</div></div>
                        <div><span className="text-muted-foreground">{isEn ? "Value" : "Valeur"}</span><div className="font-bold tabular">{moneyFmt.format(h.value)}</div></div>
                      </div>
                      <div className="mt-2 space-y-1">
                        {h.quotes.slice(0, 4).map(q => (
                          <div key={q.id} className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="truncate">{q.clientName}</span>
                            <StatusBadge status={q.salesStatus} className="shrink-0" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Route className="h-4 w-4" /> {isEn ? "Suggested field days" : "Journées terrain suggérées"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {routeDays.map((day, index) => (
                    <div key={day.zone} className="rounded-lg border border-border bg-card p-3" data-testid={`route-day-${index}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-[13px]">{day.zone}</div>
                        <Badge variant={day.installReady ? "default" : "secondary"} className="text-[10px]">{day.installReady} {isEn ? "to schedule" : "à planifier"}</Badge>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{day.clients} {isEn ? "quote(s) in the same sector" : "soumission(s) dans le même secteur"} · {moneyFmt.format(day.value)}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" /> {isEn ? "Precision note" : "Note de précision"}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>{isEn ? "The map is now interactive with zoom and pan. Markers are positioned by city because Intimura does not yet provide full addresses in synchronized data." : "La carte est maintenant interactive avec zoom et déplacement. Les marqueurs sont positionnés par ville, car Intimura ne fournit pas encore les adresses complètes dans la donnée synchronisée."}</p>
                <p>{isEn ? "Next step: if we receive full addresses for each Intimura quote, I can add precise geocoding and installer-optimized routes." : "Prochaine étape : si on récupère l’adresse complète de chaque soumission Intimura, j’ajoute le géocodage exact et les routes optimisées par installateur."}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
