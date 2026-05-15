/**
 * Heatmap — Mapbox GL JS (react-map-gl v7)
 * Géocodage via Mapbox Geocoding API (remplace Nominatim)
 * Heatmap natif GPU + clustering intégré
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Map, { Source, Layer, Popup, NavigationControl, type MapRef, type LayerProps } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  CalendarDays, DollarSign, Filter, Flame, HardHat,
  Layers, MapPin, Route, Target, TrendingUp, Users,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/lib/language-context";
import { useRole } from "@/lib/role-context";
import type { Lead, Quote } from "@shared/schema";
import { PROVINCES, SALES_STATUSES, INSTALL_STATUSES } from "@shared/schema";

const MAPBOX_TOKEN = (import.meta as any).env?.VITE_MAPBOX_TOKEN ?? "";

type StageTone = "lead" | "sent" | "follow" | "appointment" | "signed" | "install" | "problem";
type ViewMode = "heat" | "cluster";

type MapQuote = Quote & {
  lat: number; lng: number;
  mapCity: string; stageLabel: string; stageTone: StageTone;
};

type InstallerProfile = {
  userId: number; displayName: string;
  city: string; province: string; postalCode: string;
  radius: string; regions: string; latLng?: [number, number] | null;
};

type Hotspot = {
  city: string; province: string; sector: string;
  count: number; value: number; signedRevenue: number; closureRate: number;
  active: number; signed: number; installReady: number;
  lat: number; lng: number; quotes: MapQuote[];
};

type PopupInfo = {
  lng: number; lat: number;
  title: string; subtitle: string;
  tag1: string; tag2: string;
  price: number; extra?: string;
};

// ── 300+ villes canadiennes ───────────────────────────────────────────────────
const CITY_COORDS: Record<string, [number, number]> = {
  // Île de Montréal
  "montreal": [45.5019, -73.5674], "montréal": [45.5019, -73.5674],
  "lachine": [45.4387, -73.6870], "lasalle": [45.4287, -73.6324],
  "verdun": [45.4589, -73.5679], "cote-saint-luc": [45.4800, -73.6670],
  "cote saint-luc": [45.4800, -73.6670], "saint-laurent": [45.5085, -73.7144],
  "mont-royal": [45.5119, -73.6417], "outremont": [45.5218, -73.6054],
  "westmount": [45.4848, -73.5979], "anjou": [45.5935, -73.5494],
  "montreal-nord": [45.6139, -73.6259], "montreal nord": [45.6139, -73.6259],
  "saint-leonard": [45.5734, -73.6072], "riviere-des-prairies": [45.6348, -73.5272],
  "pointe-aux-trembles": [45.6593, -73.5004], "pierrefonds": [45.4925, -73.8560],
  "dollard-des-ormeaux": [45.4883, -73.8219], "kirkland": [45.4450, -73.8616],
  "pointe-claire": [45.4547, -73.8213], "beaconsfield": [45.4314, -73.8636],
  "roxboro": [45.4925, -73.8290], "hampstead": [45.4800, -73.6490],
  "montreal-ouest": [45.4536, -73.6457], "cote-des-neiges": [45.4994, -73.6234],
  "rosemont": [45.5437, -73.5851], "plateau-mont-royal": [45.5217, -73.5778],
  "villeray": [45.5467, -73.6252], "ahuntsic": [45.5713, -73.6534],
  "bordeaux": [45.5980, -73.6670], "saint-michel": [45.5705, -73.6083],
  "mercier": [45.5416, -73.5323], "hochelaga": [45.5354, -73.5408],
  "maisonneuve": [45.5471, -73.5381], "pointe-saint-charles": [45.4756, -73.5623],

  // Rive-Nord (Montréal)
  "laval": [45.5693, -73.7062],
  "saint-eustache": [45.5650, -73.9055], "deux-montagnes": [45.5333, -73.8800],
  "saint-jerome": [45.7817, -74.0002], "saint-jérôme": [45.7817, -74.0002],
  "blainville": [45.6721, -73.8847], "boisbriand": [45.6178, -73.8388],
  "rosemere": [45.6362, -73.8014], "rosemère": [45.6362, -73.8014],
  "sainte-therese": [45.6423, -73.8588], "sainte-thérèse": [45.6423, -73.8588],
  "mirabel": [45.6867, -74.0875], "oka": [45.4728, -74.0840],
  "repentigny": [45.7432, -73.4604], "mascouche": [45.7479, -73.6014],
  "terrebonne": [45.7040, -73.6449], "lachenaie": [45.7154, -73.6003],
  "charlemagne": [45.7196, -73.4837], "l'assomption": [45.8226, -73.4267],
  "joliette": [46.0202, -73.4522], "rawdon": [46.0544, -73.7194],
  "lanoraie": [45.9681, -73.2182], "mandeville": [46.3569, -73.3482],
  "saint-donat": [46.3233, -74.2136], "saint-gabriel-de-brandon": [46.2892, -73.3792],

  // Laurentides
  "prevost": [45.8672, -74.0772], "prévost": [45.8672, -74.0772],
  "mont-tremblant": [46.1171, -74.5961], "mont tremblant": [46.1171, -74.5961],
  "sainte-agathe-des-monts": [46.0539, -74.2833],
  "sainte-adele": [45.9501, -74.1315], "sainte-adèle": [45.9501, -74.1315],
  "saint-sauveur": [45.8951, -74.1743], "morin-heights": [45.9022, -74.2477],
  "val-morin": [46.0089, -74.1869], "val-david": [46.0341, -74.2158],
  "mont-laurier": [46.5536, -75.4967], "riviere-rouge": [46.4244, -74.8694],
  "labelle": [46.2867, -74.7252], "piedmont": [45.9024, -74.1286],
  "entrelacs": [46.113, -74.003],

  // Montérégie (couronne sud)
  "longueuil": [45.5312, -73.5181], "brossard": [45.4589, -73.4595],
  "saint-lambert": [45.5023, -73.5016], "boucherville": [45.5956, -73.4345],
  "varennes": [45.6918, -73.4328], "sainte-julie": [45.5918, -73.3276],
  "beloeil": [45.5658, -73.2041], "mont-saint-hilaire": [45.5600, -73.1957],
  "chambly": [45.4514, -73.2876], "carignan": [45.4401, -73.3049],
  "saint-jean-sur-richelieu": [45.3093, -73.2638], "saint-jean": [45.3093, -73.2638],
  "sainte-catherine": [45.4071, -73.5807], "saint-constant": [45.3672, -73.5690],
  "la-prairie": [45.4235, -73.4950], "la prairie": [45.4235, -73.4950],
  "candiac": [45.3809, -73.5198], "delson": [45.3717, -73.5466],
  "chateauguay": [45.3820, -73.7454], "châteauguay": [45.3820, -73.7454],
  "beauharnois": [45.3192, -73.8718], "salaberry-de-valleyfield": [45.2574, -74.1316],
  "saint-hyacinthe": [45.6208, -72.9564], "sorel-tracy": [46.0349, -73.1122],
  "granby": [45.4004, -72.7282], "cowansville": [45.1994, -72.7452],
  "bromont": [45.3123, -72.6539], "farnham": [45.2917, -72.9919],
  "richelieu": [45.4281, -73.2388], "marieville": [45.4342, -73.1720],
  "greenfield-park": [45.4895, -73.4722], "saint-hubert": [45.5117, -73.4234],

  // Estrie
  "sherbrooke": [45.4042, -71.8929], "magog": [45.2769, -72.1491],
  "coaticook": [45.1334, -71.8002], "lac-megantic": [45.5778, -70.8826],
  "lac-mégantic": [45.5778, -70.8826], "lennoxville": [45.3681, -71.8455],
  "windsor": [45.5662, -72.0044], "danville": [45.7817, -72.0108],

  // Québec (région) — coordonnées validées sur terre (jamais dans le fleuve)
  "quebec": [46.8466, -71.2155], "québec": [46.8466, -71.2155],
  "ville de quebec": [46.8466, -71.2155], "ville de québec": [46.8466, -71.2155],
  "vieux-quebec": [46.8123, -71.2042], "vieux-québec": [46.8123, -71.2042],
  "haute-ville": [46.8123, -71.2042], "basse-ville": [46.8178, -71.2236],
  "saint-roch": [46.8178, -71.2236], "saint roch": [46.8178, -71.2236],
  "limoilou": [46.8400, -71.2100], "vieux-limoilou": [46.8400, -71.2100],
  "maizerets": [46.8470, -71.1830], "lairet": [46.8500, -71.2300],
  "montcalm": [46.8020, -71.2350],
  "levis": [46.7382, -71.2465], "lévis": [46.7382, -71.2465],
  "sainte-foy": [46.7752, -71.2827], "charlesbourg": [46.8689, -71.2614],
  "beauport": [46.8662, -71.1876], "ancienne-lorette": [46.7890, -71.3560],
  "l'ancienne-lorette": [46.7890, -71.3560],
  "saint-augustin-de-desmaures": [46.7390, -71.4673],
  "cap-rouge": [46.7602, -71.4149], "shannon": [46.9073, -71.5081],
  "loretteville": [46.8394, -71.3552], "lac-beauport": [47.0094, -71.2754],
  "stoneham": [47.1706, -71.3768], "stoneham-et-tewkesbury": [47.1706, -71.3768],
  "saint-gabriel-de-valcartier": [46.9401, -71.5059],
  "sainte-brigitte-de-laval": [47.0014, -71.1614],
  "saint-raymond": [46.8882, -71.8389], "portneuf": [46.6882, -71.8836],
  "donnacona": [46.6730, -71.7242], "neuville": [46.6980, -71.5826],
  "baie-saint-paul": [47.4438, -70.4986], "clermont": [47.6874, -70.2286],
  "la-malbaie": [47.6487, -70.1557], "tadoussac": [48.1433, -69.7167],

  // Chaudière-Appalaches
  "saint-georges": [46.1180, -70.6712], "thetford-mines": [46.0980, -71.2999],
  "beauceville": [46.2131, -70.7769], "sainte-marie": [46.4478, -71.0201],
  "montmagny": [46.9805, -70.5538], "la-pocatiere": [47.3648, -70.0362],

  // Mauricie / Centre-du-Québec
  "trois-rivieres": [46.3432, -72.5432], "trois-rivières": [46.3432, -72.5432],
  "shawinigan": [46.4867, -72.7399], "la-tuque": [47.4332, -72.7846],
  "drummondville": [45.8842, -72.4858], "victoriaville": [46.0575, -71.9680],
  "nicolet": [46.2242, -72.6050], "becancour": [46.3338, -72.4382],

  // Outaouais
  "gatineau": [45.4765, -75.7013], "hull": [45.4282, -75.7160],
  "aylmer": [45.3880, -75.8447], "buckingham": [45.5879, -75.4169],

  // Saguenay / Lac-Saint-Jean
  "saguenay": [48.4279, -71.0666], "chicoutimi": [48.4279, -71.0666],
  "jonquiere": [48.4190, -71.2362], "jonquière": [48.4190, -71.2362],
  "alma": [48.5499, -71.6516], "roberval": [48.5224, -72.2258],
  "saint-felicien": [48.6487, -72.4615], "dolbeau-mistassini": [48.8771, -72.2344],

  // Bas-Saint-Laurent
  "rimouski": [48.4499, -68.5298], "riviere-du-loup": [47.8279, -69.5358],
  "rivière-du-loup": [47.8279, -69.5358], "matane": [48.8477, -67.5348],
  "amqui": [48.4651, -67.4346], "mont-joli": [48.5841, -68.1947],

  // Gaspésie
  "gaspe": [48.8370, -64.4864], "gaspé": [48.8370, -64.4864],
  "new-richmond": [48.1687, -65.8700], "carleton-sur-mer": [48.1027, -66.1316],
  "chandler": [48.3580, -64.6898], "perce": [48.5236, -64.2152],

  // Abitibi-Témiscamingue
  "rouyn-noranda": [48.2395, -79.0195], "val-d-or": [48.1085, -77.7888],
  "val-d'or": [48.1085, -77.7888], "amos": [48.5660, -78.1076],
  "malartic": [48.1375, -78.1316], "senneterre": [48.3938, -77.2360],

  // Côte-Nord
  "baie-comeau": [49.2167, -68.1506], "sept-iles": [50.2229, -66.3797],
  "sept-îles": [50.2229, -66.3797],

  // Ontario
  "ottawa": [45.4215, -75.6972], "toronto": [43.6532, -79.3832],
  "mississauga": [43.5890, -79.6441], "brampton": [43.7315, -79.7624],
  "hamilton": [43.2557, -79.8711], "london": [42.9849, -81.2453],
  "kingston": [44.2312, -76.4860], "barrie": [44.3894, -79.6903],
};

// ── FSA → coordonnées (point centraux sur terre) ──────────────────────────────
const FSA_COORDS: Record<string, [number, number]> = {
  // Montréal (H)
  "H1": [45.57, -73.53], "H2": [45.54, -73.61], "H3": [45.50, -73.57],
  "H4": [45.47, -73.61], "H5": [45.46, -73.56], "H6": [45.44, -73.62],
  "H7": [45.60, -73.73], "H8": [45.50, -73.83], "H9": [45.44, -73.87],
  // Québec (G) — G1 sur plateau, jamais dans le fleuve
  "G0": [47.50, -70.50],
  "G1": [46.855, -71.235], // plateau Québec (Parlement + Charlesbourg)
  "G2": [46.795, -71.305], // Sainte-Foy / Sillery
  "G3": [46.890, -71.195], // Charlesbourg / Beauport nord
  "G4": [48.46, -71.07], "G5": [46.49, -72.49],
  "G6": [46.74, -71.27], "G7": [48.42, -71.07], "G8": [48.45, -68.53],
  "G9": [46.35, -72.55],
  // Montérégie / Laurentides / Lanaudière / Outaouais / Abitibi (J)
  "J0": [46.02, -73.44], "J1": [45.40, -71.89], "J2": [45.50, -72.70],
  "J3": [45.53, -73.45], "J4": [45.52, -73.48], "J5": [45.74, -73.46],
  "J6": [45.45, -73.75], "J7": [45.72, -74.00], "J8": [45.48, -75.72],
  "J9": [48.10, -77.80],
  // Ontario
  "K1": [45.42, -75.70], "K2": [45.32, -75.79], "K6": [44.43, -76.50],
  "K7": [44.23, -76.48], "L3": [43.87, -79.26], "L4": [43.86, -79.43],
  "M1": [43.76, -79.21], "M4": [43.67, -79.36], "M5": [43.65, -79.38],
  "N1": [43.55, -80.25], "N2": [43.45, -80.49], "N6": [42.98, -81.25],
  // Alberta
  "T1": [50.68, -113.81], "T2": [51.05, -114.07], "T3": [51.05, -114.15],
  "T5": [53.54, -113.49], "T6": [53.54, -113.54],
  // Colombie-Britannique
  "V5": [49.28, -123.12], "V6": [49.24, -123.12], "V7": [49.30, -123.00],
};

const STAGE_COLORS: Record<StageTone, string> = {
  lead: "#2563eb", sent: "#0891b2", follow: "#d97706",
  appointment: "#f97316", signed: "#059669", install: "#7c3aed", problem: "#dc2626",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalize(v?: string | null) {
  return (v || "").toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ").trim();
}
function prettyCity(v?: string | null) {
  return (v || "Ville inconnue").replace(/quÉbec/gi, "Québec").trim();
}
function extractBestLocation(q: any) {
  let address = q.address || null;
  let city = q.city || null;
  let province = q.province || null;
  let postalCode = q.postalCode || null;
  if (q.intimuraData && (!address || !postalCode)) {
    try {
      const d = typeof q.intimuraData === "string" ? JSON.parse(q.intimuraData) : q.intimuraData;
      const c = d?.customer;
      if (c) {
        address = address || c.service_address_resolved || c.address || c.billing_address_resolved || null;
        postalCode = postalCode || c.postal_code || c.postal || c.zip || c.postcode || null;
        city = city || c.city || c.service_city || null;
        province = province || c.state || c.province || null;
      }
      const qObj = d?.quote;
      if (qObj) {
        postalCode = postalCode || qObj.postal_code || qObj.customer_postal_code || null;
        city = city || qObj.city || null;
      }
    } catch {}
  }
  return { address, city, province, postalCode };
}
function buildAddressKey(q: { address?: string | null; city?: string | null; province?: string | null; postalCode?: string | null }) {
  const city = (q.city || "").trim();
  if (!city || city === "Ville inconnue") return null;
  if (q.address?.trim()) return [q.address, city, q.province || "QC", q.postalCode || "", "Canada"].filter(Boolean).join(", ");
  if (q.postalCode?.trim()) return [city, q.province || "QC", q.postalCode, "Canada"].join(", ");
  return null;
}
function postalToCoords(pc: string, cityFallback?: string): [number, number] | null {
  if (!pc) return null;
  const clean = pc.replace(/\s/g, "").toUpperCase();
  if (clean.length >= 2) { const f = FSA_COORDS[clean.slice(0, 2)]; if (f) return f; }
  if (cityFallback) { const k = normalize(cityFallback); if (CITY_COORDS[k]) return CITY_COORDS[k]; }
  return null;
}
function fallbackCoord(index: number): [number, number] {
  return [46.7 + (index % 7) * 0.45, -73.9 + Math.floor(index / 7) * 1.15];
}
function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371; const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;
  const lat1 = a[0] * Math.PI / 180; const lat2 = b[0] * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function optimizeRoute<T extends { lat: number; lng: number }>(stops: T[]): T[] {
  if (stops.length <= 2) return stops;
  const remaining = stops.slice(); const order: T[] = [remaining.shift()!];
  while (remaining.length > 0) {
    const last = order[order.length - 1]; let bestIdx = 0; let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm([last.lat, last.lng], [remaining[i].lat, remaining[i].lng]);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    order.push(remaining.splice(bestIdx, 1)[0]);
  }
  return order;
}
function getStage(q: Quote): StageTone {
  if (q.installStatus === "probleme") return "problem";
  if (["planifiee", "materiel", "en_route", "en_cours", "inspection", "terminee"].includes(q.installStatus)) return "install";
  if (q.salesStatus === "signee") return "signed";
  if (q.salesStatus === "rendez_vous") return "appointment";
  if (q.salesStatus === "suivi") return "follow";
  if (["envoyee", "rdv_mesure"].includes(q.salesStatus)) return "sent";
  return "lead";
}
function getStageLabel(q: Quote) {
  const sales = SALES_STATUSES[q.salesStatus as keyof typeof SALES_STATUSES] || q.salesStatus;
  const install = INSTALL_STATUSES[q.installStatus as keyof typeof INSTALL_STATUSES] || q.installStatus;
  if (q.salesStatus === "signee") return `Vente signée · ${install}`;
  if (q.installStatus !== "a_planifier") return `${sales} · ${install}`;
  return sales;
}

// Génère un polygone GeoJSON approximant un cercle (pour zones installateurs)
function makeCirclePolygon(lngCenter: number, latCenter: number, radiusKm: number, steps = 64): number[][] {
  const coords: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dLat = (radiusKm / 111.32) * Math.cos(angle);
    const dLng = (radiusKm / (111.32 * Math.cos(latCenter * Math.PI / 180))) * Math.sin(angle);
    coords.push([lngCenter + dLng, latCenter + dLat]);
  }
  return coords;
}

// ── Géocodage serveur ─────────────────────────────────────────────────────────
function useServerGeocoding(addresses: string[]) {
  const [coords, setCoords] = useState<Record<string, [number, number] | null>>({});
  const pendingRef = useRef<string[]>([]);
  const key = useMemo(() => addresses.slice().sort().join("|"), [addresses]);

  const fetch_ = useCallback(async (addrs: string[]) => {
    if (!addrs.length) return;
    try {
      const r = await fetch("/api/geocode", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses: addrs }),
      });
      if (!r.ok) return;
      const data: { results: Record<string, [number, number] | null | "pending">; pending: number } = await r.json();
      const resolved: Record<string, [number, number] | null> = {};
      const still: string[] = [];
      for (const [addr, val] of Object.entries(data.results)) {
        if (val === "pending") still.push(addr); else resolved[addr] = val as [number, number] | null;
      }
      if (Object.keys(resolved).length) setCoords(prev => ({ ...prev, ...resolved }));
      pendingRef.current = still;
    } catch {}
  }, []);

  useEffect(() => { fetch_(addresses); }, [key, fetch_]);

  useEffect(() => {
    if (!pendingRef.current.length) return;
    const t = setInterval(() => {
      if (pendingRef.current.length) fetch_(pendingRef.current); else clearInterval(t);
    }, 15_000); // 15s au lieu de 30s grâce au rate limit Mapbox
    return () => clearInterval(t);
  }, [key, fetch_]);

  return coords;
}

// ── Composant principal ───────────────────────────────────────────────────────
export function Heatmap() {
  const { language } = useLanguage();
  const isEn = language === "en";
  const { role } = useRole();
  const isDirector = ["admin", "sales_director", "install_director"].includes(role ?? "");
  const isSalesRep = role === "sales_rep";
  const mapRef = useRef<MapRef>(null);

  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const { data: quotes = [] } = useQuery<Quote[]>({ queryKey: ["/api/quotes"] });
  const activeLeads = leads.filter(l => l.status !== "test");
  const installerQuery = useQuery<InstallerProfile[]>({ queryKey: ["/api/installer-profiles"], enabled: !isSalesRep });
  const installerProfiles = isSalesRep ? [] : (installerQuery.data ?? []);

  const [province, setProvince] = useState("all");
  const [stage, setStage] = useState("all");
  const [metric, setMetric] = useState<"count" | "value" | "revenue">("count");
  const [viewMode, setViewMode] = useState<ViewMode>("cluster");
  const [layers, setLayers] = useState(new Set(["estimations", "ventes", "installers"]));
  const [popup, setPopup] = useState<PopupInfo | null>(null);

  const moneyFmt = new Intl.NumberFormat(isEn ? "en-CA" : "fr-CA", {
    style: "currency", currency: "CAD", maximumFractionDigits: 0,
  });

  function toggleLayer(l: string) {
    setLayers(prev => { const n = new Set(prev); n.has(l) ? n.delete(l) : n.add(l); return n; });
  }

  // Géocodage serveur
  const addressesToGeocode = useMemo(() => {
    const set = new Set<string>();
    for (const q of quotes) { const loc = extractBestLocation(q); const k = buildAddressKey(loc); if (k) set.add(k); }
    for (const l of activeLeads) { const loc = extractBestLocation(l); const k = buildAddressKey(loc); if (k) set.add(k); }
    return Array.from(set);
  }, [quotes, activeLeads]);

  const geocodeMap = useServerGeocoding(addressesToGeocode);
  const geocodedCount = Object.values(geocodeMap).filter(v => v != null).length;

  // Construction des MapQuotes
  const mapQuotes = useMemo<MapQuote[]>(() => {
    let fi = 0;
    const leadAsQuotes: Quote[] = activeLeads.map(l => ({
      id: -1_000_000 - l.id, intimuraId: `lead-${l.id}`,
      clientName: l.clientName, phone: l.phone || null, email: l.email || null,
      address: l.address || null, city: l.city || "Ville inconnue",
      province: l.province || "QC", postalCode: l.postalCode || null,
      sector: l.sector || null, fenceType: l.fenceType || null,
      estimatedPrice: (l.estimatedValue as number | null) ?? 0, estimatedLength: null,
      salesStatus: "nouveau", installStatus: "a_planifier",
      assignedSalesId: l.assignedSalesId ?? null, assignedInstallerId: null,
      crewId: null, installDate: null, notes: null, photos: null,
      leadId: l.id, createdAt: l.createdAt,
    } as unknown as Quote));

    const leadsWithQuote = new Set(quotes.filter(q => q.leadId).map(q => q.leadId));
    const combined: Quote[] = [...quotes, ...leadAsQuotes.filter(lq => !leadsWithQuote.has(lq.leadId))];

    return combined.map(q => {
      const loc = extractBestLocation(q);
      const city = prettyCity(loc.city || q.city);
      const normKey = normalize(city);
      const addrKey = buildAddressKey(loc);
      const geo = addrKey ? geocodeMap[addrKey] : null;
      const fsa = postalToCoords(loc.postalCode || q.postalCode || "", city);
      let lat: number, lng: number;
      if (geo) {
        [lat, lng] = geo;
      } else if (fsa) {
        const j = Math.abs(q.id) % 9;
        lat = fsa[0] + ((j % 3) - 1) * 0.004;
        lng = fsa[1] + (Math.floor(j / 3) - 1) * 0.006;
      } else {
        const base = CITY_COORDS[normKey] || fallbackCoord(fi++);
        const j = Math.abs(q.id) % 9;
        lat = base[0] + ((j % 3) - 1) * 0.010;
        lng = base[1] + (Math.floor(j / 3) - 1) * 0.015;
      }
      return { ...q, lat, lng, mapCity: city, stageTone: getStage(q), stageLabel: getStageLabel(q) } satisfies MapQuote;
    })
    .filter(q => province === "all" || q.province === province)
    .filter(q => stage === "all" || q.stageTone === stage)
    .filter(q => {
      const isEst = ["lead", "sent", "follow", "appointment"].includes(q.stageTone);
      const isVte = ["signed", "install", "problem"].includes(q.stageTone);
      return (layers.has("estimations") && isEst) || (layers.has("ventes") && isVte);
    });
  }, [quotes, activeLeads, province, stage, layers, geocodeMap]);

  // Hotspots pour le classement latéral
  const hotspots = useMemo<Hotspot[]>(() => {
    const map = new Map<string, Hotspot>();
    for (const q of mapQuotes) {
      const key = `${q.province}-${normalize(q.mapCity)}`;
      const cur = map.get(key) || {
        city: q.mapCity, province: q.province || "QC",
        sector: q.sector || `${q.province || "QC"} › ${q.mapCity}`,
        count: 0, value: 0, signedRevenue: 0, closureRate: 0,
        active: 0, signed: 0, installReady: 0, lat: q.lat, lng: q.lng, quotes: [],
      };
      cur.count += 1; cur.value += q.estimatedPrice || 0;
      if (q.salesStatus === "signee") cur.signedRevenue += (q as any).finalPrice || q.estimatedPrice || 0;
      if (!["perdue", "signee"].includes(q.salesStatus)) cur.active += 1;
      if (q.salesStatus === "signee") cur.signed += 1;
      if (["a_planifier", "planifiee"].includes(q.installStatus)) cur.installReady += 1;
      cur.quotes.push(q);
      map.set(key, cur);
    }
    const result = Array.from(map.values());
    result.forEach(h => { h.closureRate = h.count > 0 ? Math.round((h.signed / h.count) * 100) : 0; });
    return result.sort((a, b) =>
      metric === "count" ? b.count - a.count : metric === "revenue" ? b.signedRevenue - a.signedRevenue : b.value - a.value
    );
  }, [mapQuotes, metric]);

  const maxIntensity = Math.max(1, ...mapQuotes.map(q =>
    metric === "count" ? 1 : metric === "revenue" ? (q.salesStatus === "signee" ? ((q as any).finalPrice || q.estimatedPrice || 0) : 0) : q.estimatedPrice || 0
  ));

  // GeoJSON pour la source "brute" (heatmap + points individuels)
  const quotesGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: mapQuotes.map(q => {
      const rawVal = metric === "count" ? 1
        : metric === "revenue" ? (q.salesStatus === "signee" ? ((q as any).finalPrice || q.estimatedPrice || 0) : 0)
        : q.estimatedPrice || 0;
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [q.lng, q.lat] },
        properties: {
          id: q.id, intensity: Math.min(1, rawVal / (maxIntensity || 1)),
          color: STAGE_COLORS[q.stageTone], stageTone: q.stageTone,
          clientName: q.clientName, city: q.mapCity, province: q.province,
          price: q.estimatedPrice, salesStatus: q.salesStatus,
          installStatus: q.installStatus, stageLabel: q.stageLabel,
          fenceType: q.fenceType || "",
        },
      };
    }),
  }), [mapQuotes, metric, maxIntensity]);

  // GeoJSON zones installateurs
  const installersGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = [];
    for (const p of installerProfiles) {
      const coords: [number, number] | null = (() => {
        if (p.latLng) return p.latLng;
        const pc = (p.postalCode || "").replace(/\s/g, "").toUpperCase();
        if (pc.length >= 2) { const f = FSA_COORDS[pc.slice(0, 2)]; if (f) return f; }
        return CITY_COORDS[normalize(p.city)] || null;
      })();
      if (!coords) continue;
      const [lat, lng] = coords;
      const m = (p.radius || "").match(/(\d+)/);
      const radiusKm = m ? parseInt(m[1]) : 25;
      // Zone (polygone)
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [makeCirclePolygon(lng, lat, radiusKm)] },
        properties: { name: p.displayName, postalCode: p.postalCode, radius: p.radius || "25 km", regions: p.regions },
      });
      // Marqueur central
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        properties: { name: p.displayName, postalCode: p.postalCode, radius: p.radius || "25 km", regions: p.regions, isPin: true },
      });
    }
    return { type: "FeatureCollection", features };
  }, [installerProfiles]);

  // Routes journées terrain
  const routeDays = useMemo(() =>
    hotspots.map(h => {
      const ordered = optimizeRoute(h.quotes).slice(0, 10);
      const stops = ordered.map(q => {
        const qloc = extractBestLocation(q);
        const addrKey = buildAddressKey(qloc);
        const geo = addrKey ? geocodeMap[addrKey] : null;
        if (qloc.address && qloc.city) return [qloc.address, qloc.city, qloc.province, qloc.postalCode].filter(Boolean).join(", ");
        if (geo) return `${geo[0]},${geo[1]}`;
        return `${q.lat.toFixed(5)},${q.lng.toFixed(5)}`;
      });
      const params = new URLSearchParams({ api: "1", travelmode: "driving" });
      if (stops.length > 0) {
        params.set("destination", stops[stops.length - 1]);
        if (stops.length > 1) params.set("waypoints", stops.slice(0, -1).join("|"));
      } else { params.set("destination", `${h.city}, ${h.province}`); }
      let totalKm = 0;
      for (let i = 1; i < ordered.length; i++)
        totalKm += haversineKm([ordered[i - 1].lat, ordered[i - 1].lng], [ordered[i].lat, ordered[i].lng]);
      return {
        zone: `${h.province} · ${h.city}`, clients: h.count, value: h.value,
        installReady: h.installReady, mapsUrl: `https://www.google.com/maps/dir/?${params}`,
        stopsCount: stops.length, totalKm: Math.round(totalKm), truncated: h.quotes.length > 10,
      };
    }).sort((a, b) => b.clients - a.clients || b.value - a.value).slice(0, 8),
  [hotspots, geocodeMap]);

  const totalClients = hotspots.reduce((s, h) => s + h.count, 0);
  const totalValue = hotspots.reduce((s, h) => s + h.value, 0);
  const topHotspot = hotspots[0];
  const centerLng = hotspots[0]?.lng ?? -73.0;
  const centerLat = hotspots[0]?.lat ?? 46.5;

  // Gestion des clics sur la carte
  function handleMapClick(e: any) {
    const features = e.features as any[];
    if (!features?.length) { setPopup(null); return; }
    const f = features[0];
    // Clic sur cluster → zoom in
    if (f.properties?.cluster) {
      const map = mapRef.current?.getMap();
      if (!map) return;
      const src = map.getSource("quotes-clustered") as any;
      src?.getClusterExpansionZoom?.(f.properties.cluster_id, (err: any, zoom: number) => {
        if (err) return;
        map.easeTo({ center: f.geometry.coordinates, zoom: Math.min(zoom + 1, 16), duration: 500 });
      });
      return;
    }
    // Clic sur point individuel → popup
    const p = f.properties || {};
    setPopup({
      lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
      title: p.clientName || "Client",
      subtitle: [p.city, p.province].filter(Boolean).join(", "),
      tag1: SALES_STATUSES[p.salesStatus as keyof typeof SALES_STATUSES] || p.salesStatus || "",
      tag2: INSTALL_STATUSES[p.installStatus as keyof typeof INSTALL_STATUSES] || p.installStatus || "",
      price: p.price || 0, extra: p.fenceType || undefined,
    });
  }

  // Définitions des layers Mapbox GL
  const heatmapLayerSpec: LayerProps = {
    id: "heatmap-layer", type: "heatmap", source: "quotes-raw",
    layout: { visibility: viewMode === "heat" ? "visible" : "none" },
    paint: {
      "heatmap-weight": ["interpolate", ["linear"], ["get", "intensity"], 0, 0, 1, 1],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 5, 1, 15, 3],
      "heatmap-color": [
        "interpolate", ["linear"], ["heatmap-density"],
        0, "rgba(33,102,172,0)", 0.15, "#3b82f6", 0.35, "#06b6d4",
        0.55, "#10b981", 0.75, "#f59e0b", 1, "#ef4444",
      ],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 5, 20, 14, 40],
      "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.85, 15, 0],
    },
  } as any;

  const heatPointsLayerSpec: LayerProps = {
    id: "heat-points", type: "circle", source: "quotes-raw",
    minzoom: 14,
    layout: { visibility: viewMode === "heat" ? "visible" : "none" },
    paint: {
      "circle-radius": 6, "circle-color": ["get", "color"],
      "circle-stroke-color": "#fff", "circle-stroke-width": 1.5, "circle-opacity": 0.9,
    },
  } as any;

  const clusterCircleLayerSpec: LayerProps = {
    id: "clusters-circle", type: "circle", source: "quotes-clustered",
    filter: ["has", "point_count"],
    layout: { visibility: viewMode === "cluster" ? "visible" : "none" },
    paint: {
      "circle-color": ["step", ["get", "point_count"], "#2563eb", 10, "#0891b2", 50, "#7c3aed"],
      "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 50, 30],
      "circle-stroke-color": "#fff", "circle-stroke-width": 2.5,
    },
  } as any;

  const clusterCountLayerSpec: LayerProps = {
    id: "clusters-count", type: "symbol", source: "quotes-clustered",
    filter: ["has", "point_count"],
    layout: {
      visibility: viewMode === "cluster" ? "visible" : "none",
      "text-field": "{point_count_abbreviated}", "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
      "text-size": 13,
    },
    paint: { "text-color": "#fff" },
  } as any;

  const unclusteredLayerSpec: LayerProps = {
    id: "unclustered-point", type: "circle", source: "quotes-clustered",
    filter: ["!", ["has", "point_count"]],
    layout: { visibility: viewMode === "cluster" ? "visible" : "none" },
    paint: {
      "circle-radius": 8, "circle-color": ["get", "color"],
      "circle-stroke-color": "#fff", "circle-stroke-width": 2, "circle-opacity": 0.92,
    },
  } as any;

  const installerFillLayerSpec: LayerProps = {
    id: "installer-fill", type: "fill",
    filter: ["==", "$type", "Polygon"],
    layout: { visibility: layers.has("installers") ? "visible" : "none" },
    paint: { "fill-color": "#7c3aed", "fill-opacity": 0.10 },
  } as any;

  const installerLineLayerSpec: LayerProps = {
    id: "installer-line", type: "line",
    filter: ["==", "$type", "Polygon"],
    layout: { visibility: layers.has("installers") ? "visible" : "none" },
    paint: { "line-color": "#7c3aed", "line-width": 2, "line-dasharray": [3, 2] },
  } as any;

  const installerPinLayerSpec: LayerProps = {
    id: "installer-pin", type: "circle",
    filter: ["==", ["get", "isPin"], true],
    layout: { visibility: layers.has("installers") ? "visible" : "none" },
    paint: {
      "circle-radius": 9, "circle-color": "#7c3aed",
      "circle-stroke-color": "#fff", "circle-stroke-width": 2.5,
    },
  } as any;

  const interactiveIds = ["clusters-circle", "unclustered-point", "heat-points"];

  if (!MAPBOX_TOKEN) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-xl font-semibold">Token Mapbox manquant</p>
        <p className="text-muted-foreground text-sm">
          Crée un compte gratuit sur <a href="https://mapbox.com" target="_blank" className="underline text-primary">mapbox.com</a>,
          copie ton token public (pk.eyJ1…) et ajoute-le dans le fichier <code>.env</code> de ton projet :
        </p>
        <pre className="bg-muted rounded p-3 text-xs text-left inline-block">
          VITE_MAPBOX_TOKEN=pk.eyJ1...{"\n"}MAPBOX_TOKEN=pk.eyJ1...
        </pre>
        <p className="text-xs text-muted-foreground">Redémarre ensuite le serveur de développement.</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={isEn ? "Sector Heatmap" : "Heatmap secteurs"}
        description={isEn
          ? `${totalClients} quotes across ${hotspots.length} zones — ${geocodedCount}/${addressesToGeocode.length} addresses geocoded`
          : `${totalClients} soumissions sur ${hotspots.length} zones — ${geocodedCount}/${addressesToGeocode.length} adresses géocodées`}
      />

      <div className="p-6 lg:p-8 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label={isEn ? "Hot zones" : "Zones chaudes"} value={hotspots.length} icon={<Flame className="h-4 w-4" />} accent="warning" />
          <KpiCard label={isEn ? "On map" : "Sur carte"} value={totalClients} icon={<Users className="h-4 w-4" />} />
          <KpiCard label={isEn ? "Estimated value" : "Valeur estimée"} value={moneyFmt.format(totalValue)} icon={<DollarSign className="h-4 w-4" />} accent="success" />
          <KpiCard label={isEn ? "Top zone" : "Top zone"} value={topHotspot?.city || "—"} icon={<Target className="h-4 w-4" />} accent="info" />
        </div>

        {/* Filtres */}
        <Card className="border-dashed">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />{isEn ? "Filters" : "Filtres"}
              </div>
              <Select value={province} onValueChange={setProvince}>
                <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Canada</SelectItem>
                  {PROVINCES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isEn ? "All stages" : "Toutes les étapes"}</SelectItem>
                  <SelectItem value="lead">{isEn ? "Lead / new" : "Lead / nouveau"}</SelectItem>
                  <SelectItem value="sent">{isEn ? "Quote sent" : "Soumission envoyée"}</SelectItem>
                  <SelectItem value="follow">{isEn ? "Follow-up" : "Suivi"}</SelectItem>
                  <SelectItem value="appointment">{isEn ? "Appointment" : "Rendez-vous"}</SelectItem>
                  <SelectItem value="signed">{isEn ? "Signed" : "Signée"}</SelectItem>
                  <SelectItem value="install">Installation</SelectItem>
                  <SelectItem value="problem">{isEn ? "Problem" : "Problème"}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={metric} onValueChange={v => setMetric(v as any)}>
                <SelectTrigger className="w-[155px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="count">{isEn ? "Volume" : "Volume"}</SelectItem>
                  <SelectItem value="value">{isEn ? "Est. value" : "Valeur estimée"}</SelectItem>
                  {isDirector && <SelectItem value="revenue">{isEn ? "Signed revenue" : "Revenus signés"}</SelectItem>}
                </SelectContent>
              </Select>
              <div className="flex gap-1.5 ml-auto flex-wrap">
                <Button size="sm" variant={layers.has("estimations") ? "default" : "outline"} className="h-7 gap-1 text-xs px-2" onClick={() => toggleLayer("estimations")}>
                  <TrendingUp className="h-3 w-3" />{isEn ? "Estimates" : "Estimations"}
                </Button>
                <Button size="sm" variant={layers.has("ventes") ? "default" : "outline"} className="h-7 gap-1 text-xs px-2"
                  style={layers.has("ventes") ? { backgroundColor: "#059669", borderColor: "#059669" } : {}} onClick={() => toggleLayer("ventes")}>
                  <DollarSign className="h-3 w-3" />{isEn ? "Sales" : "Ventes"}
                </Button>
                <Button size="sm" variant={layers.has("installers") ? "default" : "outline"} className="h-7 gap-1 text-xs px-2"
                  style={layers.has("installers") ? { backgroundColor: "#7c3aed", borderColor: "#7c3aed" } : {}} onClick={() => toggleLayer("installers")}>
                  <HardHat className="h-3 w-3" />{isEn ? "Installers" : "Installateurs"}
                </Button>
                <div className="h-7 flex rounded-md border overflow-hidden">
                  <Button size="sm" variant={viewMode === "cluster" ? "default" : "ghost"} className="h-7 gap-1 text-xs px-2 rounded-none border-0" onClick={() => setViewMode("cluster")}>
                    <MapPin className="h-3 w-3" />Clusters
                  </Button>
                  <Button size="sm" variant={viewMode === "heat" ? "default" : "ghost"} className="h-7 gap-1 text-xs px-2 rounded-none border-0" onClick={() => setViewMode("heat")}>
                    <Layers className="h-3 w-3" />Heatmap
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_0.85fr] gap-6">
          {/* Carte Mapbox */}
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="h-[680px]">
                <Map
                  ref={mapRef}
                  mapboxAccessToken={MAPBOX_TOKEN}
                  initialViewState={{ longitude: centerLng, latitude: centerLat, zoom: province === "all" ? 6 : 9 }}
                  style={{ width: "100%", height: "100%" }}
                  mapStyle="mapbox://styles/mapbox/dark-v11"
                  interactiveLayerIds={interactiveIds}
                  onClick={handleMapClick}
                  onMouseEnter={(e: any) => { if (e.features?.length) (e.target as any).getCanvas().style.cursor = "pointer"; }}
                  onMouseLeave={(e: any) => { (e.target as any).getCanvas().style.cursor = ""; }}
                >
                  <NavigationControl position="top-right" />

                  {/* Source brute (heatmap + points HD au zoom max) */}
                  <Source id="quotes-raw" type="geojson" data={quotesGeoJSON}>
                    <Layer {...heatmapLayerSpec} />
                    <Layer {...heatPointsLayerSpec} />
                  </Source>

                  {/* Source clusterisée */}
                  <Source id="quotes-clustered" type="geojson" data={quotesGeoJSON} cluster={true} clusterMaxZoom={14} clusterRadius={50}>
                    <Layer {...clusterCircleLayerSpec} />
                    <Layer {...clusterCountLayerSpec} />
                    <Layer {...unclusteredLayerSpec} />
                  </Source>

                  {/* Zones installateurs */}
                  <Source id="installers-zones" type="geojson" data={installersGeoJSON}>
                    <Layer {...installerFillLayerSpec} source="installers-zones" />
                    <Layer {...installerLineLayerSpec} source="installers-zones" />
                    <Layer {...installerPinLayerSpec} source="installers-zones" />
                  </Source>

                  {/* Popup */}
                  {popup && (
                    <Popup longitude={popup.lng} latitude={popup.lat} onClose={() => setPopup(null)}
                      closeButton={true} closeOnClick={false} anchor="bottom" offset={12}>
                      <div className="min-w-[200px] font-sans text-[13px] text-gray-900 p-1">
                        <div className="font-bold text-[14px] mb-1">{popup.title}</div>
                        <div className="text-gray-500 text-[11px] mb-2">{popup.subtitle}</div>
                        <div className="flex gap-1.5 flex-wrap mb-2">
                          <span className="bg-gray-100 text-gray-700 text-[10px] px-2 py-0.5 rounded">{popup.tag1}</span>
                          <span className="bg-gray-100 text-gray-700 text-[10px] px-2 py-0.5 rounded">{popup.tag2}</span>
                        </div>
                        <div className="font-bold text-green-600">{moneyFmt.format(popup.price)}</div>
                        {popup.extra && <div className="text-[10px] text-gray-400 mt-0.5">{popup.extra}</div>}
                      </div>
                    </Popup>
                  )}
                </Map>
              </div>
            </CardContent>
            {/* Légende */}
            <div className="px-4 py-2.5 border-t flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              {(Object.entries(STAGE_COLORS) as [StageTone, string][]).map(([tone, color]) => (
                <span key={tone} className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  {{ lead: "Lead", sent: "Envoyée", follow: "Suivi", appointment: "Rendez-vous", signed: "Signée", install: "Installation", problem: "Problème" }[tone]}
                </span>
              ))}
            </div>
          </Card>

          {/* Panneaux latéraux */}
          <div className="space-y-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Flame className="h-4 w-4" />{isEn ? "Zones ranking" : "Classement zones"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {hotspots.slice(0, 12).map((h, i) => (
                    <div key={`${h.province}-${h.city}`}
                      className="rounded-lg border p-2.5 hover:bg-muted/40 transition-colors cursor-pointer"
                      onClick={() => mapRef.current?.getMap()?.flyTo({ center: [h.lng, h.lat], zoom: 12, duration: 800 })}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-[13px] truncate">{i + 1}. {h.city}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{h.sector}</div>
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">{h.province}</Badge>
                      </div>
                      <div className="mt-1.5 grid grid-cols-3 gap-1 text-[11px]">
                        <div><span className="text-muted-foreground">{isEn ? "Quotes" : "Soum."}</span><div className="font-bold">{h.count}</div></div>
                        <div><span className="text-muted-foreground">{isEn ? "Signed" : "Signées"}</span><div className="font-bold text-emerald-600">{h.signed}</div></div>
                        <div><span className="text-muted-foreground">{isEn ? "Value" : "Valeur"}</span><div className="font-bold">{moneyFmt.format(h.value)}</div></div>
                      </div>
                      {h.quotes.slice(0, 2).map(q => (
                        <div key={q.id} className="flex items-center justify-between gap-2 text-[10px] mt-1 border-t pt-1">
                          <span className="truncate text-muted-foreground">{q.clientName}</span>
                          <StatusBadge status={q.salesStatus} className="shrink-0" />
                        </div>
                      ))}
                    </div>
                  ))}
                  {hotspots.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      {isEn ? "No data for selected filters." : "Aucune donnée pour ces filtres."}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Route className="h-4 w-4" />{isEn ? "Field day routes" : "Journées terrain"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {routeDays.map(day => (
                    <a key={day.zone} href={day.mapsUrl} target="_blank" rel="noopener noreferrer"
                      className="block rounded-lg border p-2.5 hover:border-primary hover:bg-accent/40 transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-[12px] flex items-center gap-1.5">
                          <Route className="h-3 w-3 text-primary" />{day.zone}
                        </div>
                        <Badge variant={day.installReady ? "default" : "secondary"} className="text-[10px]">
                          {day.installReady} {isEn ? "to plan" : "à planifier"}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {day.clients} {isEn ? "quote(s)" : "soumission(s)"} · {moneyFmt.format(day.value)}
                        {day.totalKm > 0 ? ` · ~${day.totalKm} km` : ""}
                        {day.truncated ? (isEn ? " · capped 10" : " · plafonné 10") : ""}
                      </div>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Table rentabilité (directeurs) */}
        {isDirector && hotspots.some(h => h.signed > 0) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-600" />
                {isEn ? "Profitability by sector" : "Rentabilité par secteur"}
                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 ml-1">
                  {isEn ? "Directors only" : "Directeurs seulement"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left pb-2 font-medium">#</th>
                      <th className="text-left pb-2 font-medium">{isEn ? "Sector" : "Secteur"}</th>
                      <th className="text-right pb-2 font-medium">{isEn ? "Quotes" : "Soum."}</th>
                      <th className="text-right pb-2 font-medium">{isEn ? "Signed" : "Signées"}</th>
                      <th className="text-right pb-2 font-medium">{isEn ? "Rate" : "Taux"}</th>
                      <th className="text-right pb-2 font-medium">{isEn ? "Revenue" : "Revenus"}</th>
                      <th className="text-right pb-2 font-medium">{isEn ? "Avg" : "Moy."}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...hotspots].filter(h => h.signed > 0).sort((a, b) => b.signedRevenue - a.signedRevenue).slice(0, 12).map((h, i) => {
                      const avg = h.signed > 0 ? h.signedRevenue / h.signed : 0;
                      const rateColor = h.closureRate >= 60 ? "text-green-600 bg-green-50" : h.closureRate >= 40 ? "text-amber-600 bg-amber-50" : "text-red-500 bg-red-50";
                      return (
                        <tr key={`${h.province}-${h.city}`} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 pr-2 text-muted-foreground text-xs">{i + 1}</td>
                          <td className="py-2"><div className="font-medium">{h.city}</div><div className="text-xs text-muted-foreground">{h.province}</div></td>
                          <td className="text-right py-2 text-muted-foreground">{h.count}</td>
                          <td className="text-right py-2 text-emerald-600 font-medium">{h.signed}</td>
                          <td className="text-right py-2">
                            <span className={`inline-block text-xs font-bold px-1.5 py-0.5 rounded ${rateColor}`}>{h.closureRate}%</span>
                          </td>
                          <td className="text-right py-2 font-semibold">{moneyFmt.format(h.signedRevenue)}</td>
                          <td className="text-right py-2 text-muted-foreground">{moneyFmt.format(avg)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-semibold text-sm">
                      <td colSpan={2} className="pt-2">{isEn ? "Total" : "Total"}</td>
                      <td className="text-right pt-2 text-muted-foreground">{hotspots.reduce((s, h) => s + h.count, 0)}</td>
                      <td className="text-right pt-2 text-emerald-600">{hotspots.reduce((s, h) => s + h.signed, 0)}</td>
                      <td></td>
                      <td className="text-right pt-2">{moneyFmt.format(hotspots.reduce((s, h) => s + h.signedRevenue, 0))}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
