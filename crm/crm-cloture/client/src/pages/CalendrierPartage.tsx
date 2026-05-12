import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Users, Wrench } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useRole } from "@/lib/role-context";
import { useLanguage } from "@/lib/language-context";
import { useToast } from "@/hooks/use-toast";
import type { Crew, Quote, User } from "@shared/schema";
import { PROVINCES } from "@shared/schema";

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function monthDays(monthAnchor: Date) {
  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function parseCities(cities?: string | null) {
  if (!cities) return [];
  try {
    return JSON.parse(cities) as string[];
  } catch {
    return [];
  }
}

function crewMatches(crew: Crew, quote?: Quote, provinceFilter = "all") {
  if (crew.status === "indisponible") return false;
  if (provinceFilter !== "all" && crew.province !== provinceFilter) return false;
  if (!quote) return true;
  if (crew.province && quote.province && crew.province !== quote.province) return false;
  const cities = parseCities(crew.cities).map(c => c.toLowerCase());
  return !quote.city || cities.length === 0 || cities.includes(quote.city.toLowerCase()) || crew.province === quote.province;
}

export function CalendrierPartage() {
  const { currentUser, can } = useRole();
  const { language } = useLanguage();
  const isEn = language === "en";
  const { toast } = useToast();
  const { data: quotes = [] } = useQuery<Quote[]>({ queryKey: ["/api/quotes"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: crews = [] } = useQuery<Crew[]>({ queryKey: ["/api/crews"] });
  const [month, setMonth] = useState(() => new Date());
  const [province, setProvince] = useState("all");
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const moneyFmt = new Intl.NumberFormat(isEn ? "en-CA" : "fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

  const installers = users.filter(u => u.role === "installer");
  const canEditCalendar = can("assign_installer") || can("edit_install");

  const updateSchedule = useMutation({
    mutationFn: async ({ id, scheduledDate, scheduledTime, installerId, crewId }: { id: number; scheduledDate: string; scheduledTime?: string | null; installerId?: number | null; crewId?: number | null }) =>
      apiRequest("PATCH", `/api/quotes/${id}`, {
        scheduledDate,
        scheduledTime: scheduledTime || null,
        assignedInstallerId: installerId || undefined,
        assignedCrewId: crewId === undefined ? undefined : crewId,
        installStatus: "planifiee",
        _userId: currentUser?.id,
        _userName: currentUser?.name,
        _userRole: currentUser?.role,
        _timelineStep: "Calendrier installation modifié",
        _note: `Installation planifiée/modifiée le ${scheduledDate}${scheduledTime ? ` à ${scheduledTime}` : ""}`,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({ title: isEn ? "Calendar updated" : "Calendrier mis à jour", description: isEn ? "Installation date is now visible to sales and installation teams." : "La date d’installation est visible aux ventes et installations." });
    },
  });

  const visibleQuotes = useMemo(() => {
    return quotes.filter(q => province === "all" || q.province === province);
  }, [quotes, province]);

  const scheduled = visibleQuotes.filter(q => q.scheduledDate);
  const selectedJobs = scheduled.filter(q => q.scheduledDate === selectedDate);
  const toReserve = visibleQuotes
    .filter(q => ["envoyee", "suivi", "rendez_vous", "signee"].includes(q.salesStatus))
    .filter(q => q.installStatus === "a_planifier" || !q.scheduledDate)
    .sort((a, b) => (b.estimatedPrice || 0) - (a.estimatedPrice || 0));

  const calendarDays = monthDays(month);
  const monthLabel = month.toLocaleDateString(isEn ? "en-CA" : "fr-CA", { month: "long", year: "numeric" });
  const activeCrews = crews.filter(c => crewMatches(c, undefined, province));
  const baseDailyCapacity = activeCrews.reduce((s, c) => s + (c.capacity || 1), 0);
  const selectedBooked = selectedJobs.length;
  const selectedAvailable = Math.max(0, baseDailyCapacity - selectedBooked);

  const capacityForQuote = (quote: Quote) => crews.filter(c => crewMatches(c, quote, province)).reduce((s, c) => s + (c.capacity || 1), 0);

  return (
    <>
      <PageHeader
        title={isEn ? "Shared sales & installation calendar" : "Calendrier partagé ventes & installation"}
        description={isEn ? "Shared view of installation dates, locations, installers and availability before promising a date to the client." : "Vue commune pour voir les dates d’installation, les lieux, les installateurs et les disponibilités avant de promettre une date au client."}
        action={
          <div className="flex items-center gap-2">
            <Select value={province} onValueChange={setProvince}>
              <SelectTrigger className="w-[140px]" data-testid="select-calendar-province"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Canada</SelectItem>
                {PROVINCES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="p-6 lg:p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label={isEn ? "Scheduled installations" : "Installations planifiées"} value={scheduled.length} icon={<CalendarDays className="h-4 w-4" />} />
          <KpiCard label={isEn ? "To book" : "À réserver"} value={toReserve.length} icon={<Clock className="h-4 w-4" />} accent="warning" />
          <KpiCard label={isEn ? "Capacity/day" : "Capacité/jour"} value={baseDailyCapacity} icon={<Users className="h-4 w-4" />} accent="info" />
          <KpiCard label={isEn ? "Selected availability" : "Disponible sélection"} value={selectedAvailable} icon={<Wrench className="h-4 w-4" />} accent={selectedAvailable > 0 ? "success" : "danger"} />
        </div>

        <div className="grid grid-cols-1 2xl:grid-cols-[1.25fr_0.75fr] gap-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" /> {monthLabel}</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" data-testid="button-prev-month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                  <Button variant="outline" size="sm" data-testid="button-this-month" onClick={() => setMonth(new Date())}>{isEn ? "Today" : "Aujourd’hui"}</Button>
                  <Button variant="outline" size="sm" data-testid="button-next-month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
                {(isEn ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]).map(day => (
                  <div key={day} className="bg-muted px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{day}</div>
                ))}
                {calendarDays.map(day => {
                  const key = dateKey(day);
                  const jobs = scheduled.filter(q => q.scheduledDate === key);
                  const booked = jobs.length;
                  const available = Math.max(0, baseDailyCapacity - booked);
                  const inMonth = day.getMonth() === month.getMonth();
                  const selected = key === selectedDate;
                  return (
                    <button
                      key={key}
                      data-testid={`calendar-day-${key}`}
                      onClick={() => setSelectedDate(key)}
                      className={`min-h-[128px] bg-card p-2 text-left transition-colors hover:bg-muted/60 ${!inMonth ? "opacity-45" : ""} ${selected ? "ring-2 ring-primary ring-inset" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[12px] font-semibold tabular">{day.getDate()}</span>
                        <Badge variant={available > 0 ? "outline" : "destructive"} className="text-[9px]">{available} {isEn ? "avail" : "dispo"}</Badge>
                      </div>
                      <div className="mt-2 space-y-1">
                        {jobs.slice(0, 3).map(q => (
                          <div key={q.id} className="rounded bg-primary/10 px-1.5 py-1 text-[10px] leading-tight">
                            <div className="truncate font-semibold">{q.scheduledTime ? `${q.scheduledTime} · ` : ""}{q.clientName}</div>
                            <div className="truncate text-muted-foreground">{q.city || q.province}</div>
                          </div>
                        ))}
                        {jobs.length > 3 && <div className="text-[10px] text-muted-foreground">+{jobs.length - 3} {isEn ? "more" : "autre(s)"}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{isEn ? "Details for" : "Détails du"} {new Date(`${selectedDate}T12:00:00`).toLocaleDateString(isEn ? "en-CA" : "fr-CA", { weekday: "long", day: "numeric", month: "long" })}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-md border border-border p-2"><div className="text-muted-foreground">{isEn ? "Capacity" : "Capacité"}</div><div className="text-lg font-bold">{baseDailyCapacity}</div></div>
                  <div className="rounded-md border border-border p-2"><div className="text-muted-foreground">{isEn ? "Booked" : "Réservé"}</div><div className="text-lg font-bold">{selectedBooked}</div></div>
                  <div className="rounded-md border border-border p-2"><div className="text-muted-foreground">{isEn ? "Available" : "Disponible"}</div><div className="text-lg font-bold">{selectedAvailable}</div></div>
                </div>
                {selectedJobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{isEn ? "No installation scheduled for this day." : "Aucune installation planifiée pour cette journée."}</p>
                ) : (
                  <div className="space-y-2">
                    {selectedJobs.map(q => {
                      const installer = users.find(u => u.id === q.assignedInstallerId);
                      const crew = crews.find(c => c.id === q.assignedCrewId);
                      return (
                        <div key={q.id} className="rounded-lg border border-border p-3">
                          <div className="flex items-start justify-between gap-2">
                            <Link href={`/soumissions/${q.id}`}><span className="cursor-pointer text-sm font-semibold hover:underline">{q.clientName}</span></Link>
                            <StatusBadge status={q.installStatus} />
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground"><MapPin className="mr-1 inline h-3 w-3" />{q.city}, {q.province} · {q.sector}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{isEn ? "Time" : "Heure"} : <span className="font-medium text-foreground">{q.scheduledTime || (isEn ? "To confirm" : "À confirmer")}</span></div>
                          <div className="mt-1 text-xs text-muted-foreground">{isEn ? "Crew" : "Équipe"} : <span className="font-medium text-foreground">{crew?.name || installer?.name || (isEn ? "Unassigned" : "Non assignée")}</span></div>
                          {canEditCalendar && (
                            <div className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_1fr_1.4fr] gap-2">
                              <Input
                                type="date"
                                defaultValue={q.scheduledDate || selectedDate}
                                data-testid={`input-edit-install-date-${q.id}`}
                                onChange={(e) => {
                                  if (e.target.value) updateSchedule.mutate({ id: q.id, scheduledDate: e.target.value, scheduledTime: q.scheduledTime || undefined, installerId: q.assignedInstallerId || undefined, crewId: q.assignedCrewId || undefined });
                                }}
                              />
                              <Input
                                type="time"
                                defaultValue={q.scheduledTime || ""}
                                data-testid={`input-edit-install-time-${q.id}`}
                                onChange={(e) => updateSchedule.mutate({ id: q.id, scheduledDate: q.scheduledDate || selectedDate, scheduledTime: e.target.value || undefined, installerId: q.assignedInstallerId || undefined, crewId: q.assignedCrewId || undefined })}
                              />
                              <Select
                                value={q.assignedCrewId ? String(q.assignedCrewId) : "none"}
                                onValueChange={(v) => updateSchedule.mutate({ id: q.id, scheduledDate: q.scheduledDate || selectedDate, scheduledTime: q.scheduledTime || undefined, installerId: q.assignedInstallerId || undefined, crewId: v === "none" ? null : Number(v) })}
                              >
                                <SelectTrigger data-testid={`select-edit-install-crew-${q.id}`}><SelectValue placeholder={isEn ? "Crew" : "Équipe"} /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">{isEn ? "Crew to confirm" : "Équipe à confirmer"}</SelectItem>
                                  {crews.filter(c => crewMatches(c, q, province)).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name} ({c.province})</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">{isEn ? "Available crews" : "Équipes disponibles"}</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {activeCrews.map(c => (
                    <div key={c.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{c.name}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{c.province} · {parseCities(c.cities).join(", ")}</div>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{c.capacity}/{isEn ? "day" : "jour"}</Badge>
                    </div>
                  ))}
                  {activeCrews.length === 0 && <p className="text-sm text-muted-foreground">{isEn ? "No crew available for this filter." : "Aucune équipe disponible pour ce filtre."}</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{isEn ? "Quotes to schedule in calendar" : "Soumissions à réserver dans le calendrier"}</CardTitle></CardHeader>
          <CardContent>
            {toReserve.length === 0 ? (
              <p className="text-sm text-muted-foreground">{isEn ? "No quote ready to schedule." : "Aucune soumission prête à réserver."}</p>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {toReserve.map(q => {
                  const matchingCapacity = capacityForQuote(q);
                  return (
                    <div key={q.id} className="rounded-lg border border-border p-3" data-testid={`calendar-quote-${q.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link href={`/soumissions/${q.id}`}><span className="cursor-pointer text-sm font-semibold hover:underline">{q.clientName}</span></Link>
                          <div className="mt-1 text-xs text-muted-foreground"><MapPin className="mr-1 inline h-3 w-3" />{q.city}, {q.province} · {q.sector}</div>
                        </div>
                        <StatusBadge status={q.salesStatus} />
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                        <div><span className="text-muted-foreground">{isEn ? "Value" : "Valeur"}</span><div className="font-bold">{moneyFmt.format(q.estimatedPrice || 0)}</div></div>
                        <div><span className="text-muted-foreground">{isEn ? "Area capacity" : "Capacité zone"}</span><div className="font-bold">{matchingCapacity}/{isEn ? "day" : "jour"}</div></div>
                        <div><span className="text-muted-foreground">{isEn ? "Installation" : "Installation"}</span><div className="font-bold"><StatusBadge status={q.installStatus} /></div></div>
                      </div>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_0.8fr_1.2fr_auto] gap-2">
                        <Input
                          type="date"
                          defaultValue={q.scheduledDate || selectedDate}
                          data-testid={`input-install-date-${q.id}`}
                          disabled={!canEditCalendar}
                          onChange={(e) => {
                            if (e.target.value) updateSchedule.mutate({ id: q.id, scheduledDate: e.target.value, scheduledTime: q.scheduledTime || undefined, installerId: q.assignedInstallerId || undefined, crewId: q.assignedCrewId || undefined });
                          }}
                        />
                        <Input
                          type="time"
                          defaultValue={q.scheduledTime || ""}
                          data-testid={`input-install-time-${q.id}`}
                          disabled={!canEditCalendar}
                          onChange={(e) => updateSchedule.mutate({ id: q.id, scheduledDate: q.scheduledDate || selectedDate, scheduledTime: e.target.value || undefined, installerId: q.assignedInstallerId || undefined, crewId: q.assignedCrewId || undefined })}
                        />
                        <Select
                          disabled={!canEditCalendar}
                          value={q.assignedCrewId ? String(q.assignedCrewId) : "none"}
                          onValueChange={(v) => updateSchedule.mutate({ id: q.id, scheduledDate: q.scheduledDate || selectedDate, scheduledTime: q.scheduledTime || undefined, installerId: q.assignedInstallerId || undefined, crewId: v === "none" ? null : Number(v) })}
                        >
                          <SelectTrigger data-testid={`select-calendar-crew-${q.id}`}><SelectValue placeholder={isEn ? "Crew" : "Équipe"} /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{isEn ? "Crew to confirm" : "Équipe à confirmer"}</SelectItem>
                            {crews.filter(c => crewMatches(c, q, province)).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name} ({c.province})</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button
                          disabled={!canEditCalendar || updateSchedule.isPending}
                          data-testid={`button-calendar-schedule-${q.id}`}
                          onClick={() => updateSchedule.mutate({ id: q.id, scheduledDate: q.scheduledDate || selectedDate, scheduledTime: q.scheduledTime || undefined, installerId: q.assignedInstallerId || undefined, crewId: q.assignedCrewId || undefined })}
                        >
                          {isEn ? "Schedule" : "Réserver"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
