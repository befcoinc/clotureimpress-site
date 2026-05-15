import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, DollarSign, Clock, AlertCircle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FenceTypeRate {
  fenceType: string;
  fenceTypeFull: string;
  total: number;
  signed: number;
  lost: number;
  rate: number;
}

interface SourceMetric {
  source: string;
  leadCount: number;
  signedCount: number;
  totalRevenue: number;
  conversionRate: number;
}

interface StageMetric {
  stage: string;
  avgDays: number;
  sampleSize: number;
}

interface AnalyticsData {
  closureByFenceType: FenceTypeRate[];
  acquisitionBySource: SourceMetric[];
  avgDurationByStage: StageMetric[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#14b8a6", "#f97316", "#a78bfa", "#38bdf8"];

const moneyFmt = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);

const sourceLabel: Record<string, string> = {
  email: "Courriel",
  web: "Web",
  téléphone: "Téléphone",
  référence: "Référence",
  inconnu: "Inconnu",
};

const rateColor = (rate: number) => {
  if (rate >= 60) return "text-green-600";
  if (rate >= 40) return "text-yellow-600";
  return "text-red-500";
};

const CustomTooltipFence = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d: FenceTypeRate = payload[0].payload;
  return (
    <div className="bg-white border rounded-lg shadow-lg p-3 text-sm space-y-1">
      <p className="font-semibold text-gray-800">{d.fenceTypeFull}</p>
      <p className="text-gray-500">{d.total} soumissions</p>
      <p className="text-green-600">{d.signed} signées</p>
      <p className="text-red-500">{d.lost} perdues</p>
      <p className={`font-bold ${rateColor(d.rate)}`}>Taux : {d.rate}%</p>
    </div>
  );
};

const CustomTooltipSource = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d: SourceMetric = payload[0].payload;
  return (
    <div className="bg-white border rounded-lg shadow-lg p-3 text-sm space-y-1">
      <p className="font-semibold text-gray-800">{sourceLabel[d.source] ?? d.source}</p>
      <p className="text-gray-500">{d.leadCount} leads</p>
      <p className="text-green-600">{d.signedCount} signés</p>
      <p className="text-indigo-600">{moneyFmt(d.totalRevenue)} revenus</p>
      <p className="font-bold">{d.conversionRate}% conversion</p>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export function Analytics() {
  const { data, isLoading, isError } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics"],
  });

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center text-muted-foreground">
        Chargement des analytiques…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-8 flex items-center gap-2 text-red-500">
        <AlertCircle className="w-5 h-5" />
        Impossible de charger les données analytiques.
      </div>
    );
  }

  const { closureByFenceType, acquisitionBySource, avgDurationByStage } = data;

  // KPI cards
  const topFence = closureByFenceType[0];
  const topSource = acquisitionBySource[0];
  const totalStageTime = avgDurationByStage.reduce((s, x) => s + x.avgDays, 0);

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytiques</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Performance commerciale et opérationnelle — Cloture Impress
        </p>
      </div>

      {/* ── KPI summary row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-indigo-50 p-2">
                <TrendingUp className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Meilleur taux de fermeture</p>
                {topFence ? (
                  <>
                    <p className="font-semibold text-gray-800 text-sm leading-tight mt-0.5">{topFence.fenceTypeFull}</p>
                    <p className={`text-2xl font-bold mt-1 ${rateColor(topFence.rate)}`}>{topFence.rate}%</p>
                  </>
                ) : <p className="text-sm text-muted-foreground">—</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-green-50 p-2">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Source la plus convertissante</p>
                {topSource ? (
                  <>
                    <p className="font-semibold text-gray-800 text-sm leading-tight mt-0.5">
                      {sourceLabel[topSource.source] ?? topSource.source}
                    </p>
                    <p className="text-2xl font-bold mt-1 text-green-600">{topSource.conversionRate}%</p>
                  </>
                ) : <p className="text-sm text-muted-foreground">—</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-amber-50 p-2">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Durée totale soumission → livraison</p>
                <p className="text-2xl font-bold mt-1 text-amber-600">
                  {totalStageTime > 0 ? `${totalStageTime} j` : "—"}
                </p>
                <p className="text-xs text-muted-foreground">moyenne cumulée</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Section 1 : Taux de fermeture par type de clôture ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="w-4 h-4 text-indigo-500" />
            Taux de fermeture par type de clôture
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            % de soumissions signées sur le total envoyé, par catégorie de produit
          </p>
        </CardHeader>
        <CardContent>
          {closureByFenceType.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Pas encore de données.</p>
          ) : (
            <div className="space-y-4">
              <ResponsiveContainer width="100%" height={Math.max(200, closureByFenceType.length * 42)}>
                <BarChart
                  layout="vertical"
                  data={closureByFenceType}
                  margin={{ top: 0, right: 48, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="fenceType" width={130} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltipFence />} />
                  <Bar dataKey="rate" radius={[0, 4, 4, 0]} label={{ position: "right", formatter: (v: number) => `${v}%`, fontSize: 11 }}>
                    {closureByFenceType.map((entry, index) => (
                      <Cell
                        key={entry.fenceType}
                        fill={entry.rate >= 60 ? "#22c55e" : entry.rate >= 40 ? "#f59e0b" : "#f87171"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div className="flex flex-wrap gap-2 pt-2 border-t text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-400 inline-block" /> ≥ 60%</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-400 inline-block" /> 40–59%</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-400 inline-block" /> &lt; 40%</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2">
                {closureByFenceType.map((row) => (
                  <div key={row.fenceType} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 text-sm">
                    <span className="text-gray-700 truncate max-w-[160px]" title={row.fenceTypeFull}>{row.fenceType}</span>
                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                      <span className="text-xs text-muted-foreground">{row.signed}/{row.total}</span>
                      <Badge variant="outline" className={`text-xs font-bold border-0 ${row.rate >= 60 ? "bg-green-100 text-green-700" : row.rate >= 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"}`}>
                        {row.rate}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Section 2 : Coût d'acquisition par source ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="w-4 h-4 text-green-500" />
            Performance par source de lead
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Taux de conversion et revenus générés selon l'origine du contact
          </p>
        </CardHeader>
        <CardContent>
          {acquisitionBySource.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Pas encore de données.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pie chart — conversion rate */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Répartition des leads</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={acquisitionBySource}
                      dataKey="leadCount"
                      nameKey="source"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, percent }) => `${sourceLabel[name] ?? name} ${Math.round(percent * 100)}%`}
                      labelLine={false}
                    >
                      {acquisitionBySource.map((entry, i) => (
                        <Cell key={entry.source} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number, name: string) => [`${v} leads`, sourceLabel[name] ?? name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Bar chart — conversion rate */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Taux de conversion par source</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={acquisitionBySource} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="source" tickFormatter={(v) => sourceLabel[v] ?? v} tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} domain={[0, 100]} />
                    <Tooltip content={<CustomTooltipSource />} />
                    <Bar dataKey="conversionRate" radius={[4, 4, 0, 0]} label={{ position: "top", formatter: (v: number) => `${v}%`, fontSize: 11 }}>
                      {acquisitionBySource.map((entry, i) => (
                        <Cell key={entry.source} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Table detail */}
              <div className="lg:col-span-2">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left pb-2 font-medium">Source</th>
                        <th className="text-right pb-2 font-medium">Leads</th>
                        <th className="text-right pb-2 font-medium">Signés</th>
                        <th className="text-right pb-2 font-medium">Conversion</th>
                        <th className="text-right pb-2 font-medium">Revenus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {acquisitionBySource.map((row, i) => (
                        <tr key={row.source} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-2">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                              {sourceLabel[row.source] ?? row.source}
                            </span>
                          </td>
                          <td className="text-right py-2 text-gray-600">{row.leadCount}</td>
                          <td className="text-right py-2 text-green-600">{row.signedCount}</td>
                          <td className="text-right py-2">
                            <Badge variant="outline" className="text-xs font-bold border-0 bg-indigo-50 text-indigo-700">
                              {row.conversionRate}%
                            </Badge>
                          </td>
                          <td className="text-right py-2 font-medium">{row.totalRevenue > 0 ? moneyFmt(row.totalRevenue) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Section 3 : Durée moyenne par étape ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="w-4 h-4 text-amber-500" />
            Durée moyenne par étape
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Combien de jours s'écoulent en moyenne entre chaque jalon clé
          </p>
        </CardHeader>
        <CardContent>
          {avgDurationByStage.every((s) => s.sampleSize === 0) ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Pas encore assez de dossiers complétés pour calculer les durées.
            </p>
          ) : (
            <div className="space-y-4">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={avgDurationByStage} margin={{ top: 16, right: 48, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="stage" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `${v}j`} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: number, _: string, props: any) => [
                      `${v} jours (n=${props.payload.sampleSize})`,
                      "Durée moyenne",
                    ]}
                  />
                  <Bar dataKey="avgDays" radius={[4, 4, 0, 0]} label={{ position: "top", formatter: (v: number) => `${v}j`, fontSize: 12 }}>
                    {avgDurationByStage.map((entry, i) => (
                      <Cell key={entry.stage} fill={i === 0 ? "#6366f1" : "#22c55e"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {avgDurationByStage.map((s, i) => (
                  <div key={s.stage} className="flex items-center justify-between px-4 py-3 rounded-lg bg-gray-50">
                    <div>
                      <p className="text-sm font-medium text-gray-700">{s.stage}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {s.sampleSize > 0 ? `${s.sampleSize} dossier${s.sampleSize > 1 ? "s" : ""} analysé${s.sampleSize > 1 ? "s" : ""}` : "Aucune donnée"}
                      </p>
                    </div>
                    <p className={`text-2xl font-bold ${i === 0 ? "text-indigo-600" : "text-green-600"}`}>
                      {s.sampleSize > 0 ? `${s.avgDays}j` : "—"}
                    </p>
                  </div>
                ))}
              </div>

              {avgDurationByStage.some((s) => s.avgDays > 30) && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700 mt-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p>
                    Une étape dépasse 30 jours en moyenne. Vérifiez les dossiers bloqués
                    dans le tableau des ventes.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
