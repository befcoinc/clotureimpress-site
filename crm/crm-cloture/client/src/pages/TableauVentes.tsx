import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/lib/language-context";
import type { Quote, User, Lead } from "@shared/schema";
import { SALES_STATUSES } from "@shared/schema";
import { FileText, CheckCircle2, TrendingUp, Users } from "lucide-react";

export function TableauVentes() {
  const { language } = useLanguage();
  const isEn = language === "en";
  const { data: quotes = [] } = useQuery<Quote[]>({ queryKey: ["/api/quotes"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const reps = users.filter(u => u.role === "sales_rep");
  const moneyFmt = new Intl.NumberFormat(isEn ? "en-CA" : "fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

  const totalPipeline = quotes.filter(q => !["perdue", "signee"].includes(q.salesStatus)).reduce((s, q) => s + (q.estimatedPrice || 0), 0);
  const signedValue = quotes.filter(q => q.salesStatus === "signee").reduce((s, q) => s + (q.finalPrice || q.estimatedPrice || 0), 0);
  const conversion = quotes.length > 0 ? Math.round((quotes.filter(q => q.salesStatus === "signee").length / quotes.length) * 100) : 0;

  const repPerf = reps.map(rep => {
    const repQuotes = quotes.filter(q => q.assignedSalesId === rep.id);
    const won = repQuotes.filter(q => q.salesStatus === "signee");
    const lost = repQuotes.filter(q => q.salesStatus === "perdue");
    const active = repQuotes.filter(q => !["perdue", "signee"].includes(q.salesStatus));
    return {
      rep,
      quotes: repQuotes.length,
      active: active.length,
      won: won.length,
      lost: lost.length,
      revenue: won.reduce((s, q) => s + (q.finalPrice || q.estimatedPrice || 0), 0),
      pipeline: active.reduce((s, q) => s + (q.estimatedPrice || 0), 0),
    };
  }).sort((a, b) => b.revenue - a.revenue);

  return (
    <>
      <PageHeader
        title={isEn ? "Sales dashboard" : "Tableau de bord Ventes"}
        description={isEn ? "Sales rep performance, pipeline, conversion and sales activity." : "Performance des vendeurs, pipeline, conversion et activité commerciale."}
      />
      <div className="p-6 lg:p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label={isEn ? "Active pipeline" : "Pipeline actif"} value={moneyFmt.format(totalPipeline)} icon={<TrendingUp className="h-4 w-4" />} accent="info" />
          <KpiCard label={isEn ? "Signed sales" : "Ventes signées"} value={moneyFmt.format(signedValue)} icon={<CheckCircle2 className="h-4 w-4" />} accent="success" />
          <KpiCard label={isEn ? "Conversion rate" : "Taux de conversion"} value={`${conversion}%`} icon={<FileText className="h-4 w-4" />} />
          <KpiCard label={isEn ? "Active reps" : "Vendeurs actifs"} value={reps.filter(r => r.active).length} icon={<Users className="h-4 w-4" />} />
        </div>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{isEn ? "Performance by sales rep" : "Performance par vendeur"}</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 font-semibold">{isEn ? "Sales rep" : "Vendeur"}</th>
                    <th className="py-2 pr-3 font-semibold">{isEn ? "Region" : "Région"}</th>
                    <th className="py-2 pr-3 font-semibold text-right">{isEn ? "Quotes" : "Soumissions"}</th>
                    <th className="py-2 pr-3 font-semibold text-right">Actives</th>
                    <th className="py-2 pr-3 font-semibold text-right">{isEn ? "Signed" : "Signées"}</th>
                    <th className="py-2 pr-3 font-semibold text-right">{isEn ? "Lost" : "Perdues"}</th>
                    <th className="py-2 pr-3 font-semibold text-right">Pipeline</th>
                    <th className="py-2 pr-3 font-semibold text-right">{isEn ? "Revenue" : "Revenu"}</th>
                  </tr>
                </thead>
                <tbody>
                  {repPerf.map(p => (
                    <tr key={p.rep.id} className="border-b border-border/50 hover-elevate" data-testid={`row-rep-${p.rep.id}`}>
                      <td className="py-2.5 pr-3 font-medium">{p.rep.name}</td>
                      <td className="py-2.5 pr-3 text-[12px] text-muted-foreground"><Badge variant="outline" className="text-[10px]">{p.rep.region}</Badge></td>
                      <td className="py-2.5 pr-3 text-right tabular">{p.quotes}</td>
                      <td className="py-2.5 pr-3 text-right tabular">{p.active}</td>
                      <td className="py-2.5 pr-3 text-right tabular text-emerald-600 font-semibold">{p.won}</td>
                      <td className="py-2.5 pr-3 text-right tabular text-rose-600">{p.lost}</td>
                      <td className="py-2.5 pr-3 text-right tabular">{moneyFmt.format(p.pipeline)}</td>
                      <td className="py-2.5 pr-3 text-right tabular font-bold">{moneyFmt.format(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{isEn ? "Conversion funnel" : "Funnel de conversion"}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(SALES_STATUSES).map(([k, v]) => {
                const count = quotes.filter(q => q.salesStatus === k).length;
                const pct = quotes.length > 0 ? (count / quotes.length) * 100 : 0;
                return (
                  <div key={k} className="flex items-center gap-3">
                    <div className="w-40 text-[12px]"><StatusBadge status={k} /></div>
                    <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                      <div className="h-full bg-primary/80 rounded-l" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-16 text-right text-[13px] tabular font-semibold">{count}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
