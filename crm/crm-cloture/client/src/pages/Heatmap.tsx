import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, ZoomControl, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CalendarDays, DollarSign, Filter, Flame, HardHat, Layers, MapPin, Route, Target, TrendingUp, Users } from "lucide-react";
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
  "baie-d'urfe": [45.4118, -73.9019], "baie d'urfe": [45.4118, -73.9019],
  "sainte-anne-de-bellevue": [45.4013, -73.9526], "senneville": [45.4179, -73.9683],
  "roxboro": [45.4925, -73.8290], "hampstead": [45.4800, -73.6490],
  "montreal-ouest": [45.4536, -73.6457], "montreal ouest": [45.4536, -73.6457],
  "cote-des-neiges": [45.4994, -73.6234], "rosemont": [45.5437, -73.5851],
  "plateau-mont-royal": [45.5217, -73.5778], "villeray": [45.5467, -73.6252],
  "ahuntsic": [45.5713, -73.6534], "bordeaux": [45.5980, -73.6670],
  "cartierville": [45.5330, -73.7480], "saint-michel": [45.5747, -73.6095],
  "mercier-hochelaga": [45.5530, -73.5380], "pointe-saint-charles": [45.4753, -73.5609],

  // Laval
  "laval": [45.6066, -73.7124], "chomedey": [45.5617, -73.7557],
  "vimont": [45.6390, -73.6825], "auteuil": [45.6319, -73.6958],
  "sainte-rose": [45.6411, -73.7375], "fabreville": [45.5814, -73.7811],
  "pont-viau": [45.5572, -73.7181], "laval-des-rapides": [45.5498, -73.7072],
  "laval-sur-le-lac": [45.5222, -73.8003], "sainte-dorothee": [45.5319, -73.7730],
  "saint-francois": [45.6675, -73.6358], "saint-vincent-de-paul": [45.6270, -73.6725],

  // Couronne nord (Laurentides / Lanaudière suburb)
  "boisbriand": [45.6241, -73.8319], "blainville": [45.6696, -73.8827],
  "sainte-therese": [45.6397, -73.8361], "sainte-thérèse": [45.6397, -73.8361],
  "rosemere": [45.6389, -73.7958], "rosemère": [45.6389, -73.7958],
  "lorraine": [45.6895, -73.7927], "bois-des-filion": [45.6693, -73.7551],
  "deux-montagnes": [45.5322, -73.8927], "saint-eustache": [45.5622, -73.9073],
  "saint-joseph-du-lac": [45.5399, -74.0048], "oka": [45.4657, -74.0934],
  "mirabel": [45.6502, -74.0879], "lachute": [45.6525, -74.3366],
  "sainte-marthe-sur-le-lac": [45.5319, -73.9284], "saint-placide": [45.5259, -74.1978],
  "vaudreuil-dorion": [45.4019, -74.0326], "vaudreuil": [45.4019, -74.0326],
  "pincourt": [45.3870, -73.9818], "terrasse-vaudreuil": [45.4109, -73.9882],
  "l'ile-perrot": [45.3830, -73.9360], "ile-perrot": [45.3830, -73.9360],
  "notre-dame-de-l'ile-perrot": [45.3830, -73.9360],
  "pointe-des-cascades": [45.3729, -74.0050], "les-coteaux": [45.2785, -74.2216],
  "coteau-du-lac": [45.3017, -74.1750], "saint-zotique": [45.2531, -74.2421],
  "rigaud": [45.4778, -74.3025], "hudson": [45.4455, -74.1476],
  "saint-lazare": [45.3984, -74.1349],

  // Lanaudière
  "repentigny": [45.7424, -73.4651], "l'assomption": [45.8278, -73.4271],
  "l assomption": [45.8278, -73.4271], "lassomption": [45.8278, -73.4271],
  "terrebonne": [45.7001, -73.6435], "mascouche": [45.7540, -73.6034],
  "joliette": [46.0165, -73.4404], "berthierville": [46.0817, -73.1847],
  "rawdon": [46.0461, -73.7173], "saint-amable": [45.6518, -73.3023],
  "saint-lin-laurentides": [45.8529, -73.7672],
  "charlemagne": [45.7236, -73.4838], "le-gardeur": [45.6973, -73.4764],
  "lavaltrie": [45.9042, -73.2800], "saint-charles-borromee": [46.0424, -73.4564],
  "notre-dame-des-prairies": [46.0432, -73.4331], "crabtree": [46.0196, -73.4937],
  "lanoraie": [45.9681, -73.2182], "mandeville": [46.3569, -73.3482],
  "saint-donat": [46.3233, -74.2136], "saint-gabriel-de-brandon": [46.2892, -73.3792],

  // Laurentides
  "saint-jerome": [45.7817, -74.0002], "saint-jérôme": [45.7817, -74.0002],
  "prevost": [45.8672, -74.0772], "prévost": [45.8672, -74.0772],
  "mont-tremblant": [46.1171, -74.5961], "mont tremblant": [46.1171, -74.5961],
  "sainte-agathe-des-monts": [46.0539, -74.2833],
  "sainte-adele": [45.9501, -74.1315], "sainte-adèle": [45.9501, -74.1315],
  "saint-sauveur": [45.8951, -74.1743], "morin-heights": [45.9022, -74.2477],
  "val-morin": [46.0089, -74.1869], "val-david": [46.0341, -74.2158],
  "mont-laurier": [46.5536, -75.4967], "riviere-rouge": [46.4244, -74.8694],
  "labelle": [46.2867, -74.7252], "piedmont": [45.9024, -74.1286],
  "sainte-anne-des-lacs": [45.8904, -74.1421], "brébeuf": [46.2136, -74.6389],
  "entrelacs": [46.113, -74.003], "estérel": [46.0367, -74.1823],
  "estérel": [46.0367, -74.1823],

  // Montérégie (couronne sud)
  "longueuil": [45.5312, -73.5181], "brossard": [45.4589, -73.4595],
  "saint-lambert": [45.5023, -73.5016], "boucherville": [45.5956, -73.4345],
  "varennes": [45.6918, -73.4328], "sainte-julie": [45.5918, -73.3276],
  "beloeil": [45.5658, -73.2041], "mcmasterville": [45.5497, -73.2222],
  "mont-saint-hilaire": [45.5600, -73.1957], "chambly": [45.4514, -73.2876],
  "carignan": [45.4401, -73.3049],
  "saint-jean-sur-richelieu": [45.3093, -73.2638], "saint-jean": [45.3093, -73.2638],
  "iberville": [45.3275, -73.2508], "sainte-catherine": [45.4071, -73.5807],
  "saint-constant": [45.3672, -73.5690], "la-prairie": [45.4235, -73.4950],
  "la prairie": [45.4235, -73.4950], "candiac": [45.3809, -73.5198],
  "delson": [45.3717, -73.5466], "chateauguay": [45.3820, -73.7454],
  "châteauguay": [45.3820, -73.7454], "beauharnois": [45.3192, -73.8718],
  "salaberry-de-valleyfield": [45.2574, -74.1316], "valleyfield": [45.2574, -74.1316],
  "saint-hyacinthe": [45.6208, -72.9564], "sorel-tracy": [46.0349, -73.1122],
  "sorel": [46.0349, -73.1122], "tracy": [46.0349, -73.1122],
  "granby": [45.4004, -72.7282], "cowansville": [45.1994, -72.7452],
  "bromont": [45.3123, -72.6539], "farnham": [45.2917, -72.9919],
  "acton-vale": [45.6511, -72.5681], "acton vale": [45.6511, -72.5681],
  "waterloo": [45.3509, -72.5261], "huntingdon": [45.0886, -74.1674],
  "mercier": [45.3514, -73.7494], "napierville": [45.1946, -73.4093],
  "richelieu": [45.4281, -73.2388], "marieville": [45.4342, -73.1720],
  "rougemont": [45.4342, -73.0549], "saint-pie": [45.5072, -72.9090],
  "saint-damase": [45.5370, -73.0217], "contrecoeur": [45.8541, -73.2379],
  "vercheres": [45.7884, -73.3531], "verchères": [45.7884, -73.3531],
  "sainte-madeleine": [45.6037, -73.0982], "saint-ours": [45.8756, -73.1489],
  "saint-roch-de-richelieu": [45.9021, -73.1413],
  "saint-marc-sur-richelieu": [45.7147, -73.1967],
  "greenfield-park": [45.4895, -73.4722], "greenfield park": [45.4895, -73.4722],
  "saint-hubert": [45.5117, -73.4234],

  // Estrie
  "sherbrooke": [45.4042, -71.8929], "magog": [45.2769, -72.1491],
  "coaticook": [45.1334, -71.8002], "lac-megantic": [45.5778, -70.8826],
  "lac-mégantic": [45.5778, -70.8826], "cookshire-eaton": [45.4128, -71.6336],
  "east-angus": [45.4897, -71.6636], "asbestos": [45.7703, -71.9455],
  "richmond": [45.6603, -72.1428], "orford": [45.3176, -72.2265],
  "north-hatley": [45.1780, -71.9676], "stanstead": [45.0073, -72.0945],
  "compton": [45.2233, -71.8178], "lennoxville": [45.3681, -71.8455],
  "windsor": [45.5662, -72.0044], "bromptonville": [45.4800, -71.9517],
  "danville": [45.7817, -72.0108],

  // Québec (région)
  "quebec": [46.8139, -71.208], "québec": [46.8139, -71.208],
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
  "baie-saint-paul": [47.4438, -70.4986], "baie saint-paul": [47.4438, -70.4986],
  "clermont": [47.6874, -70.2286], "la-malbaie": [47.6487, -70.1557],
  "la malbaie": [47.6487, -70.1557], "tadoussac": [48.1433, -69.7167],

  // Chaudière-Appalaches
  "saint-georges": [46.1180, -70.6712], "thetford-mines": [46.0980, -71.2999],
  "thetford mines": [46.0980, -71.2999], "beauceville": [46.2131, -70.7769],
  "sainte-marie": [46.4478, -71.0201], "la-guadeloupe": [45.9479, -70.9320],
  "lac-etchemin": [46.4020, -70.5047], "saint-joseph-de-beauce": [46.3107, -70.8772],
  "scott": [46.4943, -71.0676], "vallee-jonction": [46.3752, -70.9185],
  "montmagny": [46.9805, -70.5538], "la-pocatiere": [47.3648, -70.0362],
  "la pocatière": [47.3648, -70.0362], "saint-pascal": [47.5372, -69.8042],
  "sainte-claire": [46.5897, -70.8699], "armagh": [46.7257, -70.6455],

  // Mauricie / Centre-du-Québec
  "trois-rivieres": [46.3432, -72.5432], "trois-rivières": [46.3432, -72.5432],
  "shawinigan": [46.4867, -72.7399], "la-tuque": [47.4332, -72.7846],
  "la tuque": [47.4332, -72.7846], "louiseville": [46.2518, -72.9464],
  "yamachiche": [46.2683, -72.8278], "maskinonge": [46.2269, -73.0040],
  "cap-de-la-madeleine": [46.3711, -72.5243],
  "becancour": [46.3338, -72.4382], "bécancour": [46.3338, -72.4382],
  "nicolet": [46.2242, -72.6050], "drummondville": [45.8842, -72.4858],
  "victoriaville": [46.0575, -71.9680], "warwick": [45.9481, -71.9756],
  "plessisville": [46.2181, -71.7814], "kingsey-falls": [45.8617, -72.0728],
  "saint-tite": [46.7358, -72.5661], "saint-boniface": [46.5147, -72.7183],
  "herouxville": [46.7081, -72.6200],

  // Outaouais
  "gatineau": [45.4765, -75.7013], "cantley": [45.5668, -75.7829],
  "chelsea": [45.5160, -75.7898], "aylmer": [45.3880, -75.8447],
  "hull": [45.4282, -75.7160], "buckingham": [45.5879, -75.4169],
  "thurso": [45.5983, -75.2394], "papineauville": [45.6225, -75.0197],
  "masson-angers": [45.5333, -75.3833], "val-des-monts": [45.6614, -75.6167],
  "maniwaki": [46.3839, -75.9672], "pontiac": [45.5726, -76.1470],
  "plantagenet": [45.5333, -74.9833], "grenville": [45.6386, -74.6047],

  // Abitibi-Témiscamingue
  "rouyn-noranda": [48.2385, -79.0152], "val-d'or": [48.0974, -77.7974],
  "val-dor": [48.0974, -77.7974], "amos": [48.5664, -78.1171],
  "ville-marie": [47.3355, -79.4346], "la-sarre": [48.8006, -79.2869],
  "la sarre": [48.8006, -79.2869], "malartic": [48.1336, -78.1303],
  "senneterre": [48.3939, -77.2342], "macamic": [48.7581, -79.0006],

  // Saguenay–Lac-Saint-Jean
  "saguenay": [48.4285, -71.0657], "chicoutimi": [48.4285, -71.0657],
  "jonquiere": [48.4190, -71.2474], "jonquière": [48.4190, -71.2474],
  "alma": [48.5501, -71.65], "dolbeau-mistassini": [48.8754, -72.2304],
  "roberval": [48.5210, -72.2183], "saint-felicien": [48.6496, -72.4531],
  "saint-félicien": [48.6496, -72.4531], "la-baie": [48.3330, -70.8763],
  "la baie": [48.3330, -70.8763], "normandin": [48.8400, -72.5300],
  "saint-prime": [48.5833, -72.3667], "desbiens": [48.4167, -71.9333],
  "metabetchouan": [48.4247, -71.8700], "saint-gedeon": [48.4833, -71.7500],
  "hébertville": [48.4091, -71.6819], "hebertville": [48.4091, -71.6819],

  // Bas-Saint-Laurent
  "rimouski": [48.4489, -68.523], "riviere-du-loup": [47.8272, -69.5365],
  "rivière-du-loup": [47.8272, -69.5365], "amqui": [48.4608, -67.4372],
  "matane": [48.8475, -67.5324], "mont-joli": [48.5867, -68.1714],
  "trois-pistoles": [48.1289, -69.1772], "pohenegamook": [47.4710, -69.2180],
  "cacouna": [47.9203, -69.5056], "le-bic": [48.3808, -68.6931],
  "sayabec": [48.5783, -67.7267], "causapscal": [48.3558, -67.2286],

  // Gaspésie
  "gaspe": [48.8306, -64.4819], "gaspé": [48.8306, -64.4819],
  "carleton-sur-mer": [48.1042, -66.125],
  "sainte-anne-des-monts": [49.1269, -66.4913],
  "perce": [48.5200, -64.2144], "percé": [48.5200, -64.2144],
  "new-richmond": [48.1681, -65.8694], "new richmond": [48.1681, -65.8694],
  "chandler": [48.3600, -64.6844], "bonaventure": [48.0528, -65.4847],
  "grande-riviere": [48.3928, -64.4889], "maria": [48.1803, -65.9936],

  // Côte-Nord
  "baie-comeau": [49.2168, -68.1515], "sept-iles": [50.2237, -66.3722],
  "sept-îles": [50.2237, -66.3722], "havre-saint-pierre": [50.2390, -63.5981],
  "port-cartier": [50.0281, -66.8703], "forestville": [48.7406, -69.0853],

  // Ontario
  "toronto": [43.6532, -79.3832], "ottawa": [45.4215, -75.6972],
  "mississauga": [43.589, -79.6441], "brampton": [43.6856, -79.7591],
  "hamilton": [43.2557, -79.8711], "london": [42.9849, -81.2453],
  "markham": [43.8561, -79.3370], "vaughan": [43.8397, -79.4984],
  "kitchener": [43.4516, -80.4925], "richmond-hill": [43.8828, -79.4403],
  "richmond hill": [43.8828, -79.4403], "oakville": [43.4675, -79.6877],
  "burlington": [43.3255, -79.7990], "barrie": [44.3894, -79.6903],
  "sudbury": [46.4917, -80.9930], "kingston": [44.2312, -76.4860],
  "guelph": [43.5448, -80.2482], "thunder-bay": [48.3809, -89.2477],
  "thunder bay": [48.3809, -89.2477], "windsor": [42.3149, -83.0364],

  // Alberta
  "calgary": [51.0447, -114.0719], "edmonton": [53.5461, -113.4938],
  "red-deer": [52.2681, -113.8112], "red deer": [52.2681, -113.8112],
  "lethbridge": [49.6956, -112.8451], "airdrie": [51.2920, -114.0147],
  "st-albert": [53.6296, -113.6277], "st albert": [53.6296, -113.6277],

  // Colombie-Britannique
  "vancouver": [49.2827, -123.1207], "surrey": [49.1913, -122.8490],
  "burnaby": [49.2488, -122.9805], "richmond": [49.1666, -123.1336],
  "kelowna": [49.8880, -119.4960], "abbotsford": [49.0516, -122.3509],
  "coquitlam": [49.2838, -122.7932],

  // Autres provinces
  "winnipeg": [49.8951, -97.1384], "moncton": [46.0878, -64.7782],
  "halifax": [44.6488, -63.5752], "fredericton": [45.9636, -66.6431],
  "saint-john": [45.2733, -66.0633], "charlottetown": [46.2382, -63.1311],
};

// FSA (2 premiers caractères du code postal) → coordonnées approx.
const FSA_COORDS: Record<string, [number, number]> = {
  // Montréal (H)
  "H1": [45.57, -73.53], "H2": [45.54, -73.61], "H3": [45.50, -73.57],
  "H4": [45.47, -73.61], "H5": [45.46, -73.56], "H6": [45.44, -73.62],
  "H7": [45.60, -73.73], "H8": [45.50, -73.83], "H9": [45.44, -73.87],
  // Québec/Saguenay/Côte-Nord (G)
  "G0": [47.50, -70.50], "G1": [46.82, -71.21], "G2": [46.86, -71.35],
  "G3": [46.89, -71.15], "G4": [48.46, -71.07], "G5": [46.49, -72.49],
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

function normalize(value?: string | null) {
  return (value || "").toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ").trim();
}
function prettyCity(v?: string | null) {
  return (v || "Ville inconnue").replace(/quÉbec/gi, "Québec").trim();
}
// Extrait les meilleures coordonnées disponibles depuis les colonnes + intimuraData JSON
function extractBestLocation(q: any): { address: string | null; city: string | null; province: string | null; postalCode: string | null } {
  let address = q.address || null;
  let city = q.city || null;
  let province = q.province || null;
  let postalCode = q.postalCode || null;
  // Lire le blob intimuraData pour récupérer postal/adresse si manquants dans les colonnes principales
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
      // Parfois directement dans d.quote
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
  // Adresse complète (meilleure précision)
  if (q.address?.trim()) {
    return [q.address, city, q.province || "QC", q.postalCode || "", "Canada"].filter(Boolean).join(", ");
  }
  // Code postal + ville (assez précis pour Nominatim)
  if (q.postalCode?.trim()) {
    return [city, q.province || "QC", q.postalCode, "Canada"].join(", ");
  }
  return null; // Ville seulement → CITY_COORDS direct, pas besoin de géocodage
}
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
function fallbackCoord(index: number): [number, number] {
  return [46.7 + (index % 7) * 0.45, -73.9 + Math.floor(index / 7) * 1.15];
}
function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;
  const lat1 = a[0] * Math.PI / 180; const lat2 = b[0] * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function optimizeRoute<T extends { lat: number; lng: number }>(stops: T[]): T[] {
  if (stops.length <= 2) return stops;
  const remaining = stops.slice();
  const order: T[] = [remaining.shift()!];
  while (remaining.length > 0) {
    const last = order[order.length - 1];
    let bestIdx = 0; let bestDist = Infinity;
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
const STAGE_COLORS: Record<StageTone, string> = {
  lead: "#2563eb", sent: "#0891b2", follow: "#d97706",
  appointment: "#f97316", signed: "#059669", install: "#7c3aed", problem: "#dc2626",
};

// ── Chargement des plugins Leaflet (CDN) ──────────────────────────────────────
function useLeafletPlugins() {
  const [ready, setReady] = useState(() =>
    typeof window !== "undefined" && !!(window as any).L?.heatLayer && !!(window as any).L?.markerClusterGroup
  );
  useEffect(() => {
    if (ready) return;
    (window as any).L = L; // expose pour les plugins CDN
    let heat = false; let cluster = false;
    const check = () => { if (heat && cluster) setReady(true); };
    // MarkerCluster CSS
    for (const href of [
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.min.css",
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.min.css",
    ]) {
      if (!document.querySelector(`link[href="${href}"]`)) {
        const l = document.createElement("link");
        l.rel = "stylesheet"; l.href = href; document.head.appendChild(l);
      }
    }
    const s1 = document.createElement("script");
    s1.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.min.js";
    s1.onload = () => { cluster = true; check(); };
    s1.onerror = () => { cluster = true; check(); };
    document.head.appendChild(s1);
    const s2 = document.createElement("script");
    s2.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet.heat/0.2.0/leaflet-heat.js";
    s2.onload = () => { heat = true; check(); };
    s2.onerror = () => { heat = true; check(); };
    document.head.appendChild(s2);
  }, [ready]);
  return ready;
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
      if (pendingRef.current.length) fetch_(pendingRef.current);
      else clearInterval(t);
    }, 30_000);
    return () => clearInterval(t);
  }, [key, fetch_]);

  return coords;
}

// ── Couche thermique (leaflet.heat) ───────────────────────────────────────────
function HeatLayerNative({ points, show, ready }: {
  points: [number, number, number][]; show: boolean; ready: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (!show || !ready || !points.length) return;
    const LL = (window as any).L;
    if (!LL?.heatLayer) return;
    const layer = LL.heatLayer(points, {
      radius: 38, blur: 28, maxZoom: 13,
      gradient: { 0.15: "#3b82f6", 0.45: "#f59e0b", 0.75: "#ef4444", 1.0: "#7f1d1d" },
    }).addTo(map);
    return () => { layer.remove(); };
  }, [map, points, show, ready]);
  return null;
}

// ── Couche clusters de marqueurs ──────────────────────────────────────────────
function MarkerClusterLayerNative({ quotes, show, ready, isEn, moneyFmt }: {
  quotes: MapQuote[]; show: boolean; ready: boolean; isEn: boolean;
  moneyFmt: Intl.NumberFormat;
}) {
  const map = useMap();
  useEffect(() => {
    if (!show || !ready || !quotes.length) return;
    const LL = (window as any).L;
    if (!LL?.markerClusterGroup) return;
    const cluster = LL.markerClusterGroup({
      showCoverageOnHover: false, maxClusterRadius: 55,
      iconCreateFunction: (c: any) => {
        const n = c.getChildCount();
        const sz = n < 10 ? 32 : n < 50 ? 40 : 48;
        return LL.divIcon({
          html: `<div style="background:#2563eb;color:#fff;border-radius:50%;width:${sz}px;height:${sz}px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${sz > 38 ? 13 : 12}px;border:2.5px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.28)">${n}</div>`,
          className: "", iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2],
        });
      },
    });
    for (const q of quotes) {
      const color = STAGE_COLORS[q.stageTone];
      const sales = SALES_STATUSES[q.salesStatus as keyof typeof SALES_STATUSES] || q.salesStatus;
      const install = INSTALL_STATUSES[q.installStatus as keyof typeof INSTALL_STATUSES] || q.installStatus;
      const popup = `<div style="min-width:220px;font-family:system-ui,sans-serif;font-size:13px">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px">
          <span style="width:11px;height:11px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block"></span>
          <strong>${q.clientName}</strong>
        </div>
        <div style="color:#666;font-size:11px;margin-bottom:4px">${q.mapCity}${q.province ? `, ${q.province}` : ""}</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px">
          <span style="background:#f1f5f9;padding:2px 7px;border-radius:4px;font-size:10px">${sales}</span>
          <span style="background:#f1f5f9;padding:2px 7px;border-radius:4px;font-size:10px">${install}</span>
        </div>
        <div style="font-weight:700;color:#059669">${moneyFmt.format(q.estimatedPrice || 0)}</div>
        ${q.fenceType && q.fenceType !== "À confirmer" ? `<div style="color:#888;font-size:10px;margin-top:2px">${q.fenceType}</div>` : ""}
      </div>`;
      const m = LL.circleMarker([q.lat, q.lng], {
        radius: 8, color: "#fff", fillColor: color, fillOpacity: 0.92, weight: 2,
      }).bindPopup(popup);
      cluster.addLayer(m);
    }
    map.addLayer(cluster);
    return () => { map.removeLayer(cluster); };
  }, [map, quotes, show, ready, isEn]);
  return null;
}

// ── Zones installateurs (Leaflet impératif) ───────────────────────────────────
function InstallerLayerNative({ profiles, show, isEn }: {
  profiles: InstallerProfile[]; show: boolean; isEn: boolean;
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
          const f = FSA_COORDS[pc.slice(0, 2)]; if (f) return f;
        }
        const city = normalize(p.city);
        return CITY_COORDS[city] || null;
      })();
      if (!coords) continue;
      const radiusM = (() => { const m = (p.radius || "").match(/(\d+)/); return m ? parseInt(m[1]) * 1000 : 25_000; })();
      const popup = `<div style="min-width:180px">
        <a href="/utilisateurs?fiche=${p.userId}" style="font-size:14px;font-weight:bold;color:#7c3aed;text-decoration:none">${p.displayName}</a><br/>
        <span style="font-size:11px;color:#888">${isEn ? "Code postal:" : "Code postal :"} <b>${p.postalCode}</b></span><br/>
        <span style="font-size:11px">${isEn ? "Radius:" : "Rayon :"} <b>${p.radius || "25 km"}</b></span>
        ${p.regions ? `<br/><span style="font-size:11px">${p.regions}</span>` : ""}
      </div>`;
      const zone = L.circle(coords, { radius: radiusM, color: "#7c3aed", fillColor: "#7c3aed", fillOpacity: 0.1, weight: 2.5, dashArray: "8 5" }).bindPopup(popup).addTo(map);
      const pin = L.circleMarker(coords, { radius: 10, color: "#fff", fillColor: "#7c3aed", fillOpacity: 1, weight: 3 }).bindPopup(popup).addTo(map);
      layers.push(zone, pin);
    }
    return () => { layers.forEach(l => l.remove()); };
  }, [map, profiles, show, isEn]);
  return null;
}

function FlyToInstaller() {
  const map = useMap();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const postal = params.get("installer");
    if (!postal) return;
    const coords = postalToCoords(postal);
    if (coords) map.flyTo(coords, 12, { duration: 1.2 });
  }, [map]);
  return null;
}

// ── Composant principal ───────────────────────────────────────────────────────
export function Heatmap() {
  const { language } = useLanguage();
  const isEn = language === "en";
  const { role } = useRole();
  const isDirector = ["admin", "sales_director", "install_director"].includes(role ?? "");
  const isSalesRep = role === "sales_rep";

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

  const pluginsReady = useLeafletPlugins();
  const moneyFmt = new Intl.NumberFormat(isEn ? "en-CA" : "fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

  function toggleLayer(l: string) {
    setLayers(prev => { const n = new Set(prev); n.has(l) ? n.delete(l) : n.add(l); return n; });
  }

  // Collect all addresses for server geocoding
  const addressesToGeocode = useMemo(() => {
    const set = new Set<string>();
    for (const q of quotes) {
      const loc = extractBestLocation(q);
      const k = buildAddressKey(loc);
      if (k) set.add(k);
    }
    for (const l of activeLeads) {
      const loc = extractBestLocation(l);
      const k = buildAddressKey(loc);
      if (k) set.add(k);
    }
    return Array.from(set);
  }, [quotes, activeLeads]);

  const geocodeMap = useServerGeocoding(addressesToGeocode);
  const geocodedCount = Object.values(geocodeMap).filter(v => v != null).length;

  const mapQuotes = useMemo<MapQuote[]>(() => {
    let fi = 0;
    const leadAsQuotes: Quote[] = activeLeads.map(l => ({
      id: -1_000_000 - l.id, intimuraId: `lead-${l.id}`,
      clientName: l.clientName, phone: l.phone || null, email: l.email || null,
      address: l.address || null, city: l.city || "Ville inconnue",
      province: l.province || "QC", postalCode: l.postalCode || null,
      sector: l.sector || null, fenceType: l.fenceType || null,
      estimatedPrice: (l.estimatedValue as number | null) ?? 0,
      estimatedLength: (l.estimatedLength as number | null) ?? null,
      salesStatus: "nouveau", installStatus: "a_planifier",
      assignedSalesId: l.assignedSalesId ?? null, assignedInstallerId: null,
      crewId: null, installDate: null, notes: null, photos: null,
      leadId: l.id, createdAt: l.createdAt,
    } as unknown as Quote));

    // Toutes les soumissions (Intimura ET manuelles)
    // Les leads sans soumission sont ajoutés comme soumission synthétique
    const leadsWithQuote = new Set(quotes.filter(q => q.leadId).map(q => q.leadId));
    const combined: Quote[] = [
      ...quotes,
      ...leadAsQuotes.filter(lq => !leadsWithQuote.has(lq.leadId)),
    ];

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

  const hotspots = useMemo<Hotspot[]>(() => {
    const map = new Map<string, Hotspot>();
    for (const q of mapQuotes) {
      const key = `${q.province}-${normalize(q.mapCity)}`;
      const cur = map.get(key) || {
        city: q.mapCity, province: q.province || "QC",
        sector: q.sector || `${q.province || "QC"} › ${q.mapCity}`,
        count: 0, value: 0, signedRevenue: 0, closureRate: 0,
        active: 0, signed: 0, installReady: 0,
        lat: q.lat, lng: q.lng, quotes: [],
      };
      cur.count += 1;
      cur.value += q.estimatedPrice || 0;
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

  const maxIntensity = Math.max(1, ...hotspots.map(h =>
    metric === "count" ? h.count : metric === "revenue" ? h.signedRevenue : h.value
  ));

  const heatPoints = useMemo<[number, number, number][]>(() =>
    mapQuotes.map(q => {
      const rawVal = metric === "count" ? 1 :
        metric === "revenue" ? (q.salesStatus === "signee" ? ((q as any).finalPrice || q.estimatedPrice || 0) : 0) :
        q.estimatedPrice || 0;
      return [q.lat, q.lng, Math.min(1, rawVal / (maxIntensity || 1))];
    }), [mapQuotes, metric, maxIntensity]);

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
      } else {
        params.set("destination", `${h.city}, ${h.province}`);
      }
      let totalKm = 0;
      for (let i = 1; i < ordered.length; i++) {
        totalKm += haversineKm([ordered[i - 1].lat, ordered[i - 1].lng], [ordered[i].lat, ordered[i].lng]);
      }
      return {
        zone: `${h.province} · ${h.city}`, clients: h.count, value: h.value,
        installReady: h.installReady, mapsUrl: `https://www.google.com/maps/dir/?${params}`,
        stopsCount: stops.length, totalKm: Math.round(totalKm),
        truncated: h.quotes.length > 10,
      };
    })
    .sort((a, b) => b.clients - a.clients || b.value - a.value)
    .slice(0, 8),
  [hotspots, geocodeMap]);

  const totalClients = hotspots.reduce((s, h) => s + h.count, 0);
  const totalValue = hotspots.reduce((s, h) => s + h.value, 0);
  const topHotspot = hotspots[0];
  const center: [number, number] = hotspots[0] ? [hotspots[0].lat, hotspots[0].lng] : [46.5, -73.0];

  return (
    <>
      <PageHeader
        title={isEn ? "Sector Heatmap" : "Heatmap secteurs"}
        description={isEn
          ? `${totalClients} quotes mapped across ${hotspots.length} zones — geocoded ${geocodedCount}/${addressesToGeocode.length} addresses`
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
                <Filter className="h-3.5 w-3.5" />
                {isEn ? "Filters" : "Filtres"}
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
                  style={layers.has("ventes") ? { backgroundColor: "#059669", borderColor: "#059669" } : {}}
                  onClick={() => toggleLayer("ventes")}>
                  <DollarSign className="h-3 w-3" />{isEn ? "Sales" : "Ventes"}
                </Button>
                <Button size="sm" variant={layers.has("installers") ? "default" : "outline"} className="h-7 gap-1 text-xs px-2"
                  style={layers.has("installers") ? { backgroundColor: "#7c3aed", borderColor: "#7c3aed" } : {}}
                  onClick={() => toggleLayer("installers")}>
                  <HardHat className="h-3 w-3" />{isEn ? "Installers" : "Installateurs"}
                </Button>
                <div className="h-7 flex rounded-md border overflow-hidden">
                  <Button size="sm" variant={viewMode === "cluster" ? "default" : "ghost"} className="h-7 gap-1 text-xs px-2 rounded-none border-0"
                    onClick={() => setViewMode("cluster")}>
                    <MapPin className="h-3 w-3" />Clusters
                  </Button>
                  <Button size="sm" variant={viewMode === "heat" ? "default" : "ghost"} className="h-7 gap-1 text-xs px-2 rounded-none border-0"
                    onClick={() => setViewMode("heat")}>
                    <Layers className="h-3 w-3" />Heatmap
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_0.85fr] gap-6">
          {/* Carte */}
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="h-[680px]">
                <MapContainer center={center} zoom={province === "all" ? 5 : 8} minZoom={3} maxZoom={18}
                  zoomControl={false} scrollWheelZoom className="h-full w-full">
                  <ZoomControl position="topright" />
                  <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <HeatLayerNative points={heatPoints} show={viewMode === "heat"} ready={pluginsReady} />
                  <MarkerClusterLayerNative quotes={mapQuotes} show={viewMode === "cluster"} ready={pluginsReady} isEn={isEn} moneyFmt={moneyFmt} />
                  <InstallerLayerNative profiles={installerProfiles} show={layers.has("installers")} isEn={isEn} />
                  <FlyToInstaller />
                </MapContainer>
              </div>
            </CardContent>
            {/* Légende */}
            <div className="px-4 py-2.5 border-t flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              {(Object.entries(STAGE_COLORS) as [StageTone, string][]).map(([tone, color]) => (
                <span key={tone} className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  {{ lead: isEn ? "Lead" : "Lead", sent: isEn ? "Sent" : "Envoyée", follow: isEn ? "Follow-up" : "Suivi",
                     appointment: isEn ? "Appt." : "Rendez-vous", signed: isEn ? "Signed" : "Signée",
                     install: "Installation", problem: isEn ? "Problem" : "Problème" }[tone]}
                </span>
              ))}
              {!pluginsReady && <span className="text-amber-500">{isEn ? "Loading plugins…" : "Chargement plugins…"}</span>}
            </div>
          </Card>

          {/* Panneaux latéraux */}
          <div className="space-y-5">
            {/* Classement secteurs */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Flame className="h-4 w-4" />{isEn ? "Zones ranking" : "Classement zones"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {hotspots.slice(0, 12).map((h, i) => (
                    <div key={`${h.province}-${h.city}`} className="rounded-lg border p-2.5 hover:bg-muted/40 transition-colors">
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
                      {h.quotes.slice(0, 3).map(q => (
                        <div key={q.id} className="flex items-center justify-between gap-2 text-[10px] mt-1 border-t pt-1">
                          <span className="truncate text-muted-foreground">{q.clientName}</span>
                          <StatusBadge status={q.salesStatus} className="shrink-0" />
                        </div>
                      ))}
                    </div>
                  ))}
                  {hotspots.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">{isEn ? "No data for selected filters." : "Aucune donnée pour ces filtres."}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Journées terrain */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Route className="h-4 w-4" />{isEn ? "Field day routes" : "Journées terrain"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {routeDays.map((day, i) => (
                    <a key={day.zone} href={day.mapsUrl} target="_blank" rel="noopener noreferrer"
                      className="block rounded-lg border p-2.5 hover:border-primary hover:bg-accent/40 transition-colors"
                      title={isEn ? "Open in Google Maps" : "Ouvrir dans Google Maps"}>
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
                      <td colSpan={3} className="pt-2 text-muted-foreground">{isEn ? "Total" : "Total"}</td>
                      <td className="text-right pt-2 text-emerald-600">{hotspots.reduce((s, h) => s + h.signed, 0)}</td>
                      <td className="text-right pt-2 text-xs">
                        {hotspots.reduce((s, h) => s + h.count, 0) > 0
                          ? `${Math.round(hotspots.reduce((s, h) => s + h.signed, 0) / hotspots.reduce((s, h) => s + h.count, 0) * 100)}%` : "—"}
                      </td>
                      <td className="text-right pt-2">{moneyFmt.format(hotspots.reduce((s, h) => s + h.signedRevenue, 0))}</td>
                      <td />
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
