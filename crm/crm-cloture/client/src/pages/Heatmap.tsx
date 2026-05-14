import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, ZoomControl, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CalendarDays, DollarSign, Flame, HardHat, MapPin, Route, Target, TrendingUp, Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/lib/language-context";
import { useRole } from "@/lib/role-context";
import type { Lead, Quote } from "@shared/schema";
import { PROVINCES, SALES_STATUSES, INSTALL_STATUSES } from "@shared/schema";

type MapQuote = Quote & {
  lat: number;
  lng: number;
  mapCity: string;
  stageLabel: string;
  stageTone: "lead" | "sent" | "follow" | "appointment" | "signed" | "install" | "problem";
};

type InstallerProfile = {
  userId: number;
  displayName: string;
  city: string;
  province: string;
  postalCode: string;
  radius: string;
  regions: string;
  latLng?: [number, number] | null;
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

// FSA (first 2 chars of postal code) to approximate coordinates
const FSA_COORDS: Record<string, [number, number]> = {
  // Quebec — Montreal area
  "H1": [45.57, -73.53], "H2": [45.54, -73.61], "H3": [45.50, -73.57],
  "H4": [45.47, -73.61], "H5": [45.46, -73.56], "H6": [45.44, -73.62],
  "H7": [45.60, -73.73], "H8": [45.50, -73.83], "H9": [45.44, -73.87],
  // Quebec — Quebec City / Levis
  "G1": [46.82, -71.21], "G2": [46.86, -71.35], "G3": [46.89, -71.15],
  "G4": [48.46, -71.07], "G5": [46.49, -72.49], "G6": [46.74, -71.27],
  "G7": [48.42, -71.07], "G8": [48.45, -68.53], "G9": [46.35, -72.55],
  // Quebec — Monteregie / Laurentides / Estrie / Outaouais
  "J0": [46.02, -73.44], "J1": [45.40, -71.89], "J2": [45.28, -72.70],
  "J3": [45.53, -73.50], "J4": [45.52, -73.29], "J5": [45.89, -73.25],
  "J6": [45.31, -73.26], "J7": [45.72, -74.00], "J8": [45.48, -75.72],
  "J9": [48.10, -77.80],
  // Ontario
  "K1": [45.42, -75.70], "K2": [45.32, -75.79], "K6": [44.43, -76.50],
  "K7": [44.23, -76.48], "L3": [43.87, -79.26], "L4": [43.86, -79.43],
  "M1": [43.76, -79.21], "M4": [43.67, -79.36], "M5": [43.65, -79.38],
  "N1": [43.55, -80.25], "N2": [43.45, -80.49], "N6": [42.98, -81.25],
  // Alberta
  "T1": [50.68, -113.81], "T2": [51.05, -114.07], "T3": [51.05, -114.15],
  "T5": [53.54, -113.49], "T6": [53.54, -113.54],
  // BC
  "V5": [49.28, -123.12], "V6": [49.24, -123.12], "V7": [49.30, -123.00],
};

function postalToCoords(pc: string, cityFallback?: string): [number, number] | null {
  if (!pc) return null;
  const clean = pc.replace(/\s/g, "").toUpperCase();
  if (clean.length >= 2) {
    const fsa2 = clean.slice(0, 2);
    if (FSA_COORDS[fsa2]) return FSA_COORDS[fsa2];
  }
  if (cityFallback) {
    const key = normalize(cityFallback);
    if (CITY_COORDS[key]) return CITY_COORDS[key];
  }
  return null;
}

function parseRadiusMeters(radiusStr: string): number {
  const match = (radiusStr || "").match(/(\d+)/);
  return match ? parseInt(match[1]) * 1000 : 0;
}

// ── Imperative Leaflet installer layer ───────────────────────────────────────
// Using the native Leaflet API directly avoids react-leaflet reconciler issues
// where Circle/CircleMarker added after initial render may not appear.
function InstallerLayerNative({ profiles, show, isEn }: {
  profiles: InstallerProfile[];
  show: boolean;
  isEn: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (!show) return;
    const layers: L.Layer[] = [];
    for (const p of profiles) {
      const coords: [number, number] | null = (() => {
        if (p.latLng) return p.latLng;
        const pc = (p.postalCode || "").replace(/\s/g, "").toUpperCase();
        if (pc.length >= 2) {
          const fsa = pc.slice(0, 2);
          const FSA: Record<string, [number, number]> = {
            "H1": [45.57, -73.53], "H2": [45.54, -73.61], "H3": [45.50, -73.57],
            "H4": [45.47, -73.61], "H7": [45.60, -73.73], "H8": [45.50, -73.83], "H9": [45.44, -73.87],
            "G1": [46.82, -71.21], "G2": [46.86, -71.35], "G3": [46.89, -71.15],
            "G5": [46.49, -72.49], "G6": [46.74, -71.27],
            "J0": [46.02, -73.44], "J1": [45.40, -71.89], "J2": [45.28, -72.70],
            "J3": [45.53, -73.50], "J4": [45.52, -73.29], "J5": [45.89, -73.25],
            "J6": [45.31, -73.26], "J7": [45.72, -74.00], "J8": [45.48, -75.72],
            "K1": [45.42, -75.70], "K2": [45.32, -75.79],
            "L3": [43.87, -79.26], "L4": [43.86, -79.43],
            "M5": [43.65, -79.38],
            "T2": [51.05, -114.07], "T5": [53.54, -113.49],
            "V6": [49.24, -123.12],
          };
          if (FSA[fsa]) return FSA[fsa];
        }
        // City fallback
        const CITIES: Record<string, [number, number]> = {
          montreal: [45.5019, -73.5674], laval: [45.6066, -73.7124],
          quebec: [46.8139, -71.208], "lac masson": [45.9833, -74.2167],
          "lac-masson": [45.9833, -74.2167], ottawa: [45.4215, -75.6972],
        };
        const city = (p.city || "").toLowerCase().trim();
        return CITIES[city] || null;
      })();
      if (!coords) continue;
      const radiusM = (() => {
        const m = (p.radius || "").match(/(\d+)/);
        return m ? parseInt(m[1]) * 1000 : 25_000;
      })();
      const popup = `<div style="min-width:180px">
        <a href="/utilisateurs?fiche=${p.userId}" style="font-size:14px;font-weight:bold;color:#7c3aed;text-decoration:none;cursor:pointer">${p.displayName}</a><br/>
        <span style="font-size:11px;color:#888">${isEn ? "Click name to see full profile & quotes" : "Cliquer le nom pour voir la fiche complète"}</span><br/>
        <span style="font-size:11px">${isEn ? "Postal:" : "Code postal :"} <b>${p.postalCode}</b></span><br/>
        <span style="font-size:11px">${isEn ? "Radius:" : "Rayon :"} <b>${p.radius || "25 km"}</b></span>
        ${p.regions ? `<br/><span style="font-size:11px">${p.regions}</span>` : ""}</div>`;
      const zone = L.circle(coords, {
        radius: radiusM,
        color: "#7c3aed",
        fillColor: "#7c3aed",
        fillOpacity: 0.12,
        weight: 3,
        dashArray: "8 5",
      }).bindPopup(popup).addTo(map);
      const pin = L.circleMarker(coords, {
        radius: 10,
        color: "#ffffff",
        fillColor: "#7c3aed",
        fillOpacity: 1,
        weight: 3,
      }).bindPopup(popup).addTo(map);
      layers.push(zone, pin);
    }
    return () => { layers.forEach(l => l.remove()); };
  }, [map, profiles, show, isEn]);
  return null;
}

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

// ── Address geocoding (Nominatim/OpenStreetMap, free) ────────────────────────
// Cached in localStorage so each address is geocoded only once across sessions.
const GEOCODE_CACHE_KEY = "ci_geocode_cache_v1";
function loadGeocodeCache(): Record<string, [number, number] | null> {
  try { return JSON.parse(localStorage.getItem(GEOCODE_CACHE_KEY) || "{}"); }
  catch { return {}; }
}
function saveGeocodeCache(cache: Record<string, [number, number] | null>) {
  try { localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache)); } catch {}
}
function buildAddressKey(q: { address?: string | null; city?: string | null; province?: string | null; postalCode?: string | null }) {
  if (!q.address || !q.city) return null;
  return [q.address, q.city, q.province || "QC", q.postalCode || "", "Canada"].filter(Boolean).join(", ");
}

function useGeocoding(addresses: string[]) {
  const [coords, setCoords] = useState<Record<string, [number, number] | null>>(() => loadGeocodeCache());
  const key = addresses.slice().sort().join("|");
  useEffect(() => {
    const todo = addresses.filter(a => a && !(a in coords));
    if (todo.length === 0) return;
    let cancelled = false;
    (async () => {
      const next = { ...coords };
      for (const addr of todo) {
        if (cancelled) return;
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ca&q=${encodeURIComponent(addr)}`;
          const r = await fetch(url, { headers: { "Accept-Language": "fr,en" } });
          if (r.ok) {
            const data = await r.json();
            next[addr] = (data && data[0]) ? [parseFloat(data[0].lat), parseFloat(data[0].lon)] : null;
          } else {
            next[addr] = null;
          }
        } catch {
          next[addr] = null;
        }
        // Nominatim usage policy: max 1 request per second.
        await new Promise(res => setTimeout(res, 1100));
        if (cancelled) return;
        setCoords({ ...next });
        saveGeocodeCache(next);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return coords;
}

// Haversine distance in km
function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;
  const lat1 = a[0] * Math.PI / 180;
  const lat2 = b[0] * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Nearest-neighbor TSP starting from index 0
function optimizeRoute<T extends { lat: number; lng: number }>(stops: T[]): T[] {
  if (stops.length <= 2) return stops;
  const remaining = stops.slice();
  const order: T[] = [remaining.shift()!];
  while (remaining.length > 0) {
    const last = order[order.length - 1];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm([last.lat, last.lng], [remaining[i].lat, remaining[i].lng]);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    order.push(remaining.splice(bestIdx, 1)[0]);
  }
  return order;
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

// Fly to postal code from ?installer= URL param
function FlyToInstaller() {
  const map = useMap();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const postal = params.get("installer");
    if (!postal) return;
    const coords = postalToCoords(postal);
    if (!coords) return;
    map.flyTo(coords, 12, { duration: 1.2 });
  }, [map]);
  return null;
}

export function Heatmap() {
  const { language } = useLanguage();
  const isEn = language === "en";
  const { role } = useRole();
  const isSalesRep = role === "sales_rep";
  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const { data: quotes = [] } = useQuery<Quote[]>({ queryKey: ["/api/quotes"] });
  const activeLeads = leads.filter(l => l.status !== "test");
  // Sales reps don't see installer coverage circles (other people's data).
  const installerProfilesQuery = useQuery<InstallerProfile[]>({ queryKey: ["/api/installer-profiles"], enabled: !isSalesRep });
  const installerProfiles = isSalesRep ? [] : (installerProfilesQuery.data ?? []);
  const [province, setProvince] = useState("all");
  const [metric, setMetric] = useState<"count" | "value">("count");
  const [stage, setStage] = useState("all");
  const [layers, setLayers] = useState<Set<string>>(new Set(["estimations", "ventes", "installers"]));
  const moneyFmt = new Intl.NumberFormat(isEn ? "en-CA" : "fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

  function toggleLayer(layer: string) {
    setLayers(prev => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }

  // Collect all addresses with street info for precise geocoding (Nominatim/OSM).
  const addressesToGeocode = useMemo(() => {
    const set = new Set<string>();
    for (const q of quotes) {
      const k = buildAddressKey(q);
      if (k) set.add(k);
    }
    for (const l of activeLeads) {
      const k = buildAddressKey(l);
      if (k) set.add(k);
    }
    return Array.from(set);
  }, [quotes, activeLeads]);
  const geocodeMap = useGeocoding(addressesToGeocode);
  const geocodedCount = Object.values(geocodeMap).filter(v => v != null).length;

  const mapQuotes = useMemo(() => {
    let fallbackIndex = 0;
    const leadAsQuotes: Quote[] = activeLeads.map((l) => ({
      id: -1000000 - l.id,
      intimuraId: `lead-${l.id}`,
      clientName: l.clientName,
      phone: l.phone || null,
      email: l.email || null,
      address: l.address || null,
      city: l.city || "Ville inconnue",
      province: l.province || "QC",
      postalCode: l.postalCode || null,
      sector: l.sector || null,
      fenceType: l.fenceType || null,
      estimatedPrice: (l.estimatedValue as number | null) ?? 0,
      estimatedLength: (l.estimatedLength as number | null) ?? null,
      salesStatus: "nouveau",
      installStatus: "a_planifier",
      assignedSalesId: l.assignedSalesId ?? null,
      assignedInstallerId: null,
      crewId: null,
      installDate: null,
      notes: null,
      photos: null,
      leadId: l.id,
      createdAt: l.createdAt,
    } as unknown as Quote));

    const combined: Quote[] = [
      ...quotes.filter(q => q.intimuraId),
      ...leadAsQuotes,
    ];

    return combined
      .map((q) => {
        const city = prettyCity(q.city);
        const key = normalize(city);
        const addrKey = buildAddressKey(q);
        const geo = addrKey ? geocodeMap[addrKey] : null;
        const fsa = postalToCoords(q.postalCode || "");
        let lat: number;
        let lng: number;
        if (geo) {
          // Precise geocoded address — no jitter.
          [lat, lng] = geo;
        } else if (fsa) {
          // Postal code FSA: tight jitter around the FSA centroid.
          const jitterSeed = Math.abs(q.id) % 9;
          lat = fsa[0] + ((jitterSeed % 3) - 1) * 0.006;
          lng = fsa[1] + (Math.floor(jitterSeed / 3) - 1) * 0.009;
        } else {
          const base = CITY_COORDS[key] || fallbackCoord(fallbackIndex++);
          const jitterSeed = Math.abs(q.id) % 9;
          lat = base[0] + ((jitterSeed % 3) - 1) * 0.018;
          lng = base[1] + (Math.floor(jitterSeed / 3) - 1) * 0.026;
        }
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
      .filter(q => stage === "all" || q.stageTone === stage || q.salesStatus === stage || q.installStatus === stage)
      .filter(q => {
        const isEstimation = ["lead", "sent", "follow", "appointment"].includes(q.stageTone);
        const isVente = ["signed", "install", "problem"].includes(q.stageTone);
        return (layers.has("estimations") && isEstimation) || (layers.has("ventes") && isVente);
      });
  }, [quotes, activeLeads, province, stage, layers, geocodeMap]);

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
      .map((h) => {
        // Optimize visit order with nearest-neighbor TSP using each quote's coords
        // (precise geocoded address when available, FSA otherwise, city last).
        const orderedQuotes = optimizeRoute(h.quotes);
        // Google Maps Directions URL supports up to ~10 stops total.
        const capped = orderedQuotes.slice(0, 10);
        const stops = capped
          .map(q => {
            const addrKey = buildAddressKey(q);
            const geo = addrKey ? geocodeMap[addrKey] : null;
            // If we have an exact address use it, otherwise fall back to lat,lng
            // so Google routes to the precise marker, not just the city center.
            if (q.address && q.city) {
              return [q.address, q.city, q.province, q.postalCode].filter(Boolean).join(", ");
            }
            if (geo) return `${geo[0]},${geo[1]}`;
            return `${q.lat.toFixed(5)},${q.lng.toFixed(5)}`;
          });
        const params = new URLSearchParams({ api: "1", travelmode: "driving" });
        if (stops.length > 0) {
          params.set("destination", stops[stops.length - 1]);
          if (stops.length > 1) params.set("waypoints", stops.slice(0, -1).join("|"));
        } else {
          params.set("destination", `${h.city}, ${h.province}`);
        }
        const mapsUrl = `https://www.google.com/maps/dir/?${params.toString()}`;
        // Total optimized driving distance (km, straight-line approximation).
        let totalKm = 0;
        for (let i = 1; i < orderedQuotes.length; i++) {
          totalKm += haversineKm(
            [orderedQuotes[i - 1].lat, orderedQuotes[i - 1].lng],
            [orderedQuotes[i].lat, orderedQuotes[i].lng],
          );
        }
        return {
          zone: `${h.province} · ${h.city}`,
          clients: h.count,
          value: h.value,
          installReady: h.installReady,
          sectors: [h.sector],
          mapsUrl,
          stopsCount: stops.length,
          totalKm: Math.round(totalKm),
          truncated: orderedQuotes.length > capped.length,
        };
      })
      .sort((a, b) => b.clients - a.clients || b.value - a.value)
      .slice(0, 8);
  }, [hotspots, geocodeMap]);

  return (
    <>
      <PageHeader
        title={isEn ? "Sector heatmap" : "Heatmap secteurs"}
        description={isEn ? "Interactive map with zoom, pan, and CRM stages for Intimura quotes." : "Carte interactive avec zoom, déplacement et étapes CRM des soumissions Intimura."}
        action={
          <div className="flex flex-col gap-2">
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
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground font-medium">{isEn ? "Layers:" : "Couches :"}</span>
              <Button
                size="sm"
                variant={layers.has("estimations") ? "default" : "outline"}
                className="h-7 gap-1.5 text-xs"
                onClick={() => toggleLayer("estimations")}
              >
                <TrendingUp className="h-3 w-3" />
                {isEn ? "Estimates" : "Estimations"}
              </Button>
              <Button
                size="sm"
                variant={layers.has("ventes") ? "default" : "outline"}
                className="h-7 gap-1.5 text-xs"
                style={layers.has("ventes") ? { backgroundColor: "#059669", borderColor: "#059669" } : {}}
                onClick={() => toggleLayer("ventes")}
              >
                <DollarSign className="h-3 w-3" />
                {isEn ? "Sales" : "Ventes"}
              </Button>
              <Button
                size="sm"
                variant={layers.has("installers") ? "default" : "outline"}
                className="h-7 gap-1.5 text-xs"
                style={layers.has("installers") ? { backgroundColor: "#7c3aed", borderColor: "#7c3aed" } : {}}
                onClick={() => toggleLayer("installers")}
              >
                <HardHat className="h-3 w-3" />
                {isEn ? "Installers" : "Installateurs"}
              </Button>
            </div>
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
              {layers.has("installers") && (
                <div className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground" data-testid="diag-installer-profiles">
                  <span className="font-semibold text-foreground">{isEn ? "Installer layer:" : "Couche installateurs :"}</span>{" "}
                  {installerProfilesQuery.isLoading
                    ? (isEn ? "loading…" : "chargement…")
                    : installerProfilesQuery.error
                      ? (isEn ? `error → ${(installerProfilesQuery.error as Error).message}` : `erreur → ${(installerProfilesQuery.error as Error).message}`)
                      : `${installerProfiles.length} ${isEn ? "profile(s) received" : "fiche(s) reçue(s)"}`}
                </div>
              )}
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
                  <InstallerLayerNative profiles={installerProfiles} show={layers.has("installers")} isEn={isEn} />
                  <FlyToInstaller />
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
                {layers.has("installers") && (
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-2.5 w-5 rounded-sm border-2 border-dashed border-[#7c3aed] opacity-70" />
                    {isEn ? "Installer territory" : "Territoire installateur"}
                  </span>
                )}
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
                    <a
                      key={day.zone}
                      href={day.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg border border-border bg-card p-3 hover:border-primary hover:bg-accent/40 transition-colors cursor-pointer"
                      data-testid={`route-day-${index}`}
                      title={isEn ? "Open route in Google Maps" : "Ouvrir l'itinéraire dans Google Maps"}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-[13px] flex items-center gap-1.5"><Route className="h-3.5 w-3.5 text-primary" /> {day.zone}</div>
                        <Badge variant={day.installReady ? "default" : "secondary"} className="text-[10px]">{day.installReady} {isEn ? "to schedule" : "à planifier"}</Badge>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{day.clients} {isEn ? "quote(s) in the same sector" : "soumission(s) dans le même secteur"} · {moneyFmt.format(day.value)}</div>
                      <div className="mt-1 text-[10px] text-primary/80">
                        {isEn ? `Optimized route in Google Maps · ${day.stopsCount} stop${day.stopsCount > 1 ? "s" : ""}` : `Itinéraire optimisé dans Google Maps · ${day.stopsCount} arrêt${day.stopsCount > 1 ? "s" : ""}`}
                        {day.totalKm > 0 ? ` · ~${day.totalKm} km` : ""}
                        {day.truncated ? (isEn ? " · capped at 10" : " · plafonné à 10") : ""}
                      </div>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" /> {isEn ? "Geocoding & routes" : "Géocodage & itinéraires"}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  {isEn
                    ? `Markers use the precise street address when available (geocoded via OpenStreetMap, cached locally — ${geocodedCount}/${addressesToGeocode.length} addresses resolved). Otherwise the postal code FSA is used, then the city center.`
                    : `Les marqueurs utilisent l'adresse exacte quand elle est disponible (géocodée via OpenStreetMap, en cache local — ${geocodedCount}/${addressesToGeocode.length} adresses résolues). Sinon, le code postal (FSA) est utilisé, puis le centre-ville.`}
                </p>
                <p>
                  {isEn
                    ? "Field-day routes are optimized with a nearest-neighbor algorithm before being sent to Google Maps (max 10 stops per route — Google's free URL limit)."
                    : "Les itinéraires des journées terrain sont optimisés par l'algorithme du plus proche voisin avant l'envoi à Google Maps (max 10 arrêts par itinéraire — limite des URL Google gratuites)."}
                </p>
                <p className="text-[11px] italic">
                  {isEn
                    ? "First load may take a few seconds while new addresses are geocoded (1 req/s, OpenStreetMap policy). Subsequent loads are instant thanks to the cache."
                    : "Le premier chargement peut prendre quelques secondes le temps de géocoder les nouvelles adresses (1 req/s, politique OpenStreetMap). Les chargements suivants sont instantanés grâce au cache."}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
