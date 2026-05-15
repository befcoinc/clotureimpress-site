import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, Clock, FileText, Phone, Mail, MapPin, User as UserIcon, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/lib/language-context";

interface DormantLead {
  id: number;
  clientName: string;
  city: string | null;
  province: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  assignedSalesId: number | null;
  assignedSalesName: string | null;
  lastActivityAt: string | null;
  createdAt: string | null;
  hoursSince: number;
}

interface DormantQuote {
  id: number;
  leadId: number | null;
  clientName: string;
  city: string | null;
  province: string | null;
  salesStatus: string;
  assignedSalesId: number | null;
  assignedSalesName: string | null;
  sentAt: string;
  daysSince: number;
  estimatedPrice: number | null;
}

interface DormantPayload {
  thresholds: { leadHours: number; quoteDays: number };
  leads: DormantLead[];
  quotes: DormantQuote[];
  totals: { leads: number; quotes: number; total: number };
  generatedAt: string;
}

export function AlertesDormantes() {
  const { language } = useLanguage();
  const isEn = language === "en";
  const { data, isLoading, refetch, isFetching } = useQuery<DormantPayload>({
    queryKey: ["/api/alerts/dormant"],
    refetchInterval: 60_000,
  });

  const moneyFmt = new Intl.NumberFormat(isEn ? "en-CA" : "fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  });
  const dateFmt = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString(isEn ? "en-CA" : "fr-CA", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  };

  const total = data?.totals?.total ?? 0;
  const leadHours = data?.thresholds?.leadHours ?? 48;
  const quoteDays = data?.thresholds?.quoteDays ?? 5;

  return (
    <>
      <PageHeader
        title={isEn ? "Dormant alerts" : "Alertes dossiers dormants"}
        description={
          isEn
            ? `Leads not contacted in ${leadHours}h or quotes sent without reply for ${quoteDays}+ days.`
            : `Leads sans contact depuis ${leadHours}h ou soumissions envoyées sans réponse depuis ${quoteDays} jours et plus.`
        }
      />
      <div className="p-6 lg:p-8 space-y-6">
        {/* Summary banner */}
        <Card
          className={
            total > 0
              ? "border-destructive/60 bg-destructive/5"
              : "border-emerald-500/40 bg-emerald-500/5"
          }
          data-testid="dormant-summary"
        >
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-3">
              <AlertTriangle
                className={total > 0 ? "h-5 w-5 text-destructive" : "h-5 w-5 text-emerald-600"}
              />
              <div>
                <div className="text-sm font-semibold">
                  {total > 0
                    ? isEn
                      ? `${total} alert${total > 1 ? "s" : ""} requiring attention`
                      : `${total} alerte${total > 1 ? "s" : ""} à traiter`
                    : isEn
                    ? "Nothing falls through the cracks"
                    : "Rien ne tombe entre les craques"}
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {data?.generatedAt
                    ? (isEn ? "Updated " : "Mis à jour ") + dateFmt(data.generatedAt)
                    : ""}
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetch();
                queryClient.invalidateQueries({ queryKey: ["/api/alerts/dormant"] });
              }}
              disabled={isFetching}
              data-testid="button-refresh-dormant"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              {isEn ? "Refresh" : "Rafraîchir"}
            </Button>
          </CardContent>
        </Card>

        {/* Dormant leads */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {isEn
                ? `Leads with no contact for ${leadHours}h+`
                : `Leads sans contact depuis ${leadHours}h ou plus`}
              <Badge
                variant="outline"
                className={
                  (data?.totals?.leads ?? 0) > 0
                    ? "ml-2 border-destructive/60 text-destructive"
                    : "ml-2"
                }
              >
                {data?.totals?.leads ?? 0}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading && (
              <div className="text-sm text-muted-foreground">
                {isEn ? "Loading..." : "Chargement..."}
              </div>
            )}
            {!isLoading && (data?.leads?.length ?? 0) === 0 && (
              <div className="text-sm text-muted-foreground">
                {isEn ? "All assigned leads were contacted recently." : "Tous les leads assignés ont été contactés récemment."}
              </div>
            )}
            {data?.leads?.map((l) => (
              <div
                key={l.id}
                className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between"
                data-testid={`dormant-lead-${l.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[13px] truncate">{l.clientName}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {l.status}
                    </Badge>
                    <Badge className="text-[10px] bg-destructive text-destructive-foreground">
                      {isEn ? `${l.hoursSince}h silence` : `${l.hoursSince}h sans contact`}
                    </Badge>
                  </div>
                  <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
                    {l.city && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {l.city}
                        {l.province ? `, ${l.province}` : ""}
                      </div>
                    )}
                    {l.assignedSalesName && (
                      <div className="flex items-center gap-1">
                        <UserIcon className="h-3 w-3" />
                        {l.assignedSalesName}
                      </div>
                    )}
                    {l.phone && (
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {l.phone}
                      </div>
                    )}
                    {l.email && (
                      <div className="flex items-center gap-1 truncate">
                        <Mail className="h-3 w-3" />
                        <span className="truncate">{l.email}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {isEn ? "Last activity: " : "Dernière activité : "}
                    {dateFmt(l.lastActivityAt) || dateFmt(l.createdAt)}
                  </div>
                </div>
                <div className="flex gap-2 sm:flex-col">
                  <Link href={`/leads`}>
                    <Button size="sm" variant="outline" data-testid={`button-open-lead-${l.id}`}>
                      {isEn ? "Open lead" : "Ouvrir le lead"}
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Dormant quotes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {isEn
                ? `Quotes sent with no reply for ${quoteDays}+ days`
                : `Soumissions envoyées sans réponse depuis ${quoteDays} jours ou plus`}
              <Badge
                variant="outline"
                className={
                  (data?.totals?.quotes ?? 0) > 0
                    ? "ml-2 border-destructive/60 text-destructive"
                    : "ml-2"
                }
              >
                {data?.totals?.quotes ?? 0}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading && (
              <div className="text-sm text-muted-foreground">
                {isEn ? "Loading..." : "Chargement..."}
              </div>
            )}
            {!isLoading && (data?.quotes?.length ?? 0) === 0 && (
              <div className="text-sm text-muted-foreground">
                {isEn ? "No sent quote left without follow-up." : "Aucune soumission envoyée sans suivi."}
              </div>
            )}
            {data?.quotes?.map((q) => (
              <div
                key={q.id}
                className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between"
                data-testid={`dormant-quote-${q.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[13px] truncate">{q.clientName}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {q.salesStatus}
                    </Badge>
                    <Badge className="text-[10px] bg-destructive text-destructive-foreground">
                      {isEn ? `${q.daysSince}d silence` : `${q.daysSince}j sans réponse`}
                    </Badge>
                    {q.estimatedPrice ? (
                      <Badge variant="outline" className="text-[10px]">
                        {moneyFmt.format(q.estimatedPrice)}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
                    {q.city && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {q.city}
                        {q.province ? `, ${q.province}` : ""}
                      </div>
                    )}
                    {q.assignedSalesName && (
                      <div className="flex items-center gap-1">
                        <UserIcon className="h-3 w-3" />
                        {q.assignedSalesName}
                      </div>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {isEn ? "Sent: " : "Envoyée le : "}
                    {dateFmt(q.sentAt)}
                  </div>
                </div>
                <div className="flex gap-2 sm:flex-col">
                  <Link href={`/soumissions/${q.id}`}>
                    <Button size="sm" variant="outline" data-testid={`button-open-quote-${q.id}`}>
                      {isEn ? "Open quote" : "Ouvrir la soumission"}
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
