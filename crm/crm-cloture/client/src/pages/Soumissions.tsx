import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useRole } from "@/lib/role-context";
import { useLanguage } from "@/lib/language-context";
import { useToast } from "@/hooks/use-toast";
import type { Crew, Quote, User } from "@shared/schema";
import { FENCE_TYPES, INSTALL_STATUSES, PROVINCES, SALES_STATUSES } from "@shared/schema";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { getWinProbability, getProbabilityBadgeColor } from "@/lib/win-probability";

type QuoteDialogState = { mode: "create" | "edit"; quote?: Quote } | null;

function normalizeForSearch(value: string) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readHashParams() {
  const hash = window.location.hash || "#/soumissions";
  const queryPart = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  return new URLSearchParams(queryPart);
}

export function Soumissions() {
  const { currentUser, role, can } = useRole();
  const { language } = useLanguage();
  const isEn = language === "en";
  const { toast } = useToast();
  const { data: quotes = [] } = useQuery<Quote[]>({ queryKey: ["/api/quotes"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: crews = [] } = useQuery<Crew[]>({ queryKey: ["/api/crews"] });
  const [search, setSearch] = useState("");
  const [quoteDialog, setQuoteDialog] = useState<QuoteDialogState>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [provinceFilter, setProvinceFilter] = useState<string>("");

  const syncUrl = (nextStatus: string, nextCity: string, nextProvince: string) => {
    const params = new URLSearchParams();
    if (nextStatus && nextStatus !== "all") params.set("filter", nextStatus);
    if (nextCity) params.set("city", nextCity);
    if (nextProvince) params.set("province", nextProvince);
    const qs = params.toString();
    window.location.hash = qs ? `#/soumissions?${qs}` : "#/soumissions";
  };

  // Read filters from URL on mount
  useEffect(() => {
    const params = readHashParams();
    const f = params.get("filter");
    const city = params.get("city");
    const province = params.get("province");
    if (f) setStatusFilter(f);
    if (city) setCityFilter(city);
    if (province) setProvinceFilter(province);
  }, []);

  const isDirector = role === "admin" || role === "sales_director" || role === "install_director";
  const canManageQuotes = can("edit_sales") || isDirector;
  const canDeleteQuotes = isDirector;

  const visible = useMemo(() => {
    let list = quotes;
    if (role === "sales_rep") list = list.filter(q => q.assignedSalesId === currentUser?.id);
    if (role === "installer") list = list.filter(q => q.assignedInstallerId === currentUser?.id);
    if (cityFilter) {
      const cityNorm = normalizeForSearch(cityFilter);
      const provinceNorm = normalizeForSearch(provinceFilter);
      list = list.filter(q => {
        const qCityNorm = normalizeForSearch(q.city || "");
        const qProvinceNorm = normalizeForSearch(q.province || "");
        if (qCityNorm !== cityNorm) return false;
        if (!provinceNorm) return true;
        return qProvinceNorm === provinceNorm;
      });
    }
    if (statusFilter === "in-progress") {
      list = list.filter(q => !["signee", "perdue"].includes(q.salesStatus));
    } else if (statusFilter !== "all") {
      list = list.filter(q => q.salesStatus === statusFilter);
    }
    if (search) {
      const s = normalizeForSearch(search);
      list = list.filter(q =>
        normalizeForSearch(q.clientName).includes(s) ||
        normalizeForSearch(q.city || "").includes(s) ||
        normalizeForSearch((q as any).phone || "").includes(s)
      );
    }
    return list;
  }, [quotes, role, currentUser, search, statusFilter, cityFilter, provinceFilter]);

  const createQuote = useMutation({
    mutationFn: async (payload: any) => apiRequest("POST", "/api/quotes", {
      ...payload,
      _userId: currentUser?.id,
      _userName: currentUser?.name,
      _userRole: currentUser?.role,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setQuoteDialog(null);
      toast({ title: isEn ? "Quote created" : "Soumission créée" });
    },
  });

  const updateQuote = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => apiRequest("PATCH", `/api/quotes/${id}`, {
      ...payload,
      _userId: currentUser?.id,
      _userName: currentUser?.name,
      _userRole: currentUser?.role,
      _note: isEn ? "Quote manually edited" : "Soumission modifiée manuellement",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setQuoteDialog(null);
      toast({ title: isEn ? "Quote updated" : "Soumission modifiée" });
    },
  });

  const deleteQuote = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/quotes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: isEn ? "Quote deleted" : "Soumission supprimée" });
    },
  });

  const columns = Object.entries(SALES_STATUSES).filter(([k]) => k !== "perdue");
  const moneyFmt = new Intl.NumberFormat(isEn ? "en-CA" : "fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

  return (
    <>
      <PageHeader
        title={isEn ? "Quotes" : "Soumissions"}
        description={isEn ? "Full quote pipeline with manual create, update and delete." : "Pipeline complet de chaque soumission, avec création, modification et suppression manuelle."}
        action={canManageQuotes && (
          <Button size="sm" className="gap-1.5" onClick={() => setQuoteDialog({ mode: "create" })} data-testid="button-create-quote">
            <Plus className="h-4 w-4" /> {isEn ? "New quote" : "Nouvelle soumission"}
          </Button>
        )}
      />
      <div className="p-6 lg:p-8 space-y-4">
        <div className="flex items-center gap-2">
          <Input placeholder={isEn ? "Search client, phone or city..." : "Rechercher client, téléphone ou ville..."} className="max-w-sm" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-quotes" />
          {statusFilter !== "all" && (
            <Badge variant="secondary" className="gap-1.5 cursor-pointer" onClick={() => { setStatusFilter("all"); syncUrl("all", cityFilter, provinceFilter); }}>
              {statusFilter === "in-progress"
                ? (isEn ? "In progress" : "En cours")
                : (SALES_STATUSES as Record<string, string>)[statusFilter] || statusFilter}
              <span aria-hidden>×</span>
            </Badge>
          )}
          {cityFilter && (
            <Badge variant="secondary" className="gap-1.5 cursor-pointer" onClick={() => { setCityFilter(""); setProvinceFilter(""); syncUrl(statusFilter, "", ""); }}>
              {isEn ? "City" : "Ville"}: {cityFilter}{provinceFilter ? ` (${provinceFilter})` : ""}
              <span aria-hidden>×</span>
            </Badge>
          )}
          <div className="ml-auto text-xs text-muted-foreground">{visible.length} {isEn ? "quote(s)" : "soumission(s)"}</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {columns.map(([key, label]) => {
            const items = visible.filter(q => q.salesStatus === key);
            const value = items.reduce((s, q) => s + (q.estimatedPrice || 0), 0);
            return (
              <div key={key} className="rounded-lg border border-card-border bg-muted/30 p-2.5 min-h-[300px]">
                <div className="flex items-baseline justify-between mb-2 px-1">
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</div>
                  <div className="text-sm font-bold tabular">{items.length}</div>
                </div>
                <div className="text-[10px] text-muted-foreground tabular mb-2 px-1">{moneyFmt.format(value)}</div>
                <div className="space-y-2">
                  {items.map(q => {
                    const rep = users.find(u => u.id === q.assignedSalesId);
                    const probability = getWinProbability(q.salesStatus);
                    const probColor = getProbabilityBadgeColor(probability);
                    return (
                      <div key={q.id} className="rounded-md bg-card border border-card-border p-2.5 hover-elevate" data-testid={`quote-card-${q.id}`}>
                        <Link href={`/soumissions/${q.id}`}>
                          <div className="cursor-pointer">
                            <div className="font-semibold text-[12px] truncate">{q.clientName}</div>
                            <div className="text-[10px] text-muted-foreground truncate">{q.city}, {q.province}</div>
                            <div className="flex items-center justify-between mt-2 gap-1">
                              <Badge variant="outline" className="text-[9px] truncate max-w-[80px]">{q.fenceType}</Badge>
                              <Badge className={`text-[9px] font-semibold ${probColor}`}>{probability}%</Badge>
                              <span className="text-[11px] font-bold tabular">{q.estimatedPrice ? moneyFmt.format(q.estimatedPrice) : "—"}</span>
                            </div>
                            {rep && <div className="text-[10px] text-muted-foreground mt-1 truncate">👤 {rep.name}</div>}
                            <div className="mt-1.5"><StatusBadge status={q.installStatus} className="text-[9px]" /></div>
                          </div>
                        </Link>
                        {(canManageQuotes || canDeleteQuotes) && (
                          <div className="mt-2 flex gap-1.5 border-t border-border pt-2">
                            {canManageQuotes && (
                              <Button size="sm" variant="outline" className="h-7 flex-1 gap-1" onClick={() => setQuoteDialog({ mode: "edit", quote: q })} data-testid={`button-edit-quote-${q.id}`}>
                                <Pencil className="h-3.5 w-3.5" /> {isEn ? "Edit" : "Modifier"}
                              </Button>
                            )}
                            {canDeleteQuotes && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 flex-1 gap-1 text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (window.confirm(isEn ? `Delete quote for ${q.clientName}? This also deletes its activity.` : `Supprimer la soumission de ${q.clientName}? Cette action supprime aussi son activité.`)) deleteQuote.mutate(q.id);
                                }}
                                data-testid={`button-delete-quote-${q.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> {isEn ? "Delete" : "Supprimer"}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {items.length === 0 && <div className="text-[10px] text-muted-foreground text-center py-4">{isEn ? "Empty" : "Vide"}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={!!quoteDialog} onOpenChange={(open) => !open && setQuoteDialog(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{quoteDialog?.mode === "edit" ? (isEn ? "Edit quote" : "Modifier la soumission") : (isEn ? "Create quote" : "Créer une soumission")}</DialogTitle>
            <DialogDescription>{isEn ? "Manual quote for a client not yet synchronized from Intimura." : "Soumission manuelle pour un client qui n’est pas encore synchronisé depuis Intimura."}</DialogDescription>
          </DialogHeader>
          {quoteDialog && (
            <QuoteForm
              quote={quoteDialog.quote}
              users={users}
              crews={crews}
              currentUserId={currentUser?.id}
              role={role}
              isPending={createQuote.isPending || updateQuote.isPending}
              onCancel={() => setQuoteDialog(null)}
              onSubmit={(payload) => quoteDialog.mode === "edit" && quoteDialog.quote ? updateQuote.mutate({ id: quoteDialog.quote.id, payload }) : createQuote.mutate(payload)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function QuoteForm({ quote, users, crews, currentUserId, role, isPending, onCancel, onSubmit }: {
  quote?: Quote;
  users: User[];
  crews: Crew[];
  currentUserId?: number;
  role: string;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (payload: any) => void;
}) {
  const salesReps = users.filter(u => ["sales_rep", "sales_director", "admin"].includes(u.role));
  const installers = users.filter(u => u.role === "installer");
  const defaultSalesId = quote?.assignedSalesId || (role === "sales_rep" ? currentUserId : undefined);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const salesStatus = String(form.get("salesStatus") || "nouveau");
    const installStatus = String(form.get("installStatus") || "a_planifier");
    onSubmit({
      leadId: quote?.leadId || null,
      intimuraId: quote?.intimuraId || null,
      clientName: required(form.get("clientName"), "Client"),
      address: nullable(form.get("address")),
      city: nullable(form.get("city")),
      province: nullable(form.get("province")),
      sector: buildSector(form.get("province"), form.get("city"), form.get("neighborhood")),
      status: salesStatus === "signee" ? "signee" : salesStatus === "perdue" ? "perdue" : "envoyee",
      salesStatus,
      installStatus,
      assignedSalesId: numericOrNull(form.get("assignedSalesId")),
      assignedInstallerId: numericOrNull(form.get("assignedInstallerId")),
      assignedCrewId: numericOrNull(form.get("assignedCrewId")),
      fenceType: nullable(form.get("fenceType")),
      estimatedLength: numericOrNull(form.get("estimatedLength")),
      estimatedPrice: numericOrNull(form.get("estimatedPrice")),
      finalPrice: numericOrNull(form.get("finalPrice")),
      salesNotes: nullable(form.get("salesNotes")),
      installNotes: nullable(form.get("installNotes")),
      scheduledDate: nullable(form.get("scheduledDate")),
      scheduledTime: nullable(form.get("scheduledTime")),
      signedDate: nullable(form.get("signedDate")),
      installedDate: nullable(form.get("installedDate")),
      paidDate: nullable(form.get("paidDate")),
      timeline: quote?.timeline || JSON.stringify([{ step: "Lead reçu", date: new Date().toISOString(), note: "Soumission manuelle" }]),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Client"><Input name="clientName" required defaultValue={quote?.clientName || ""} data-testid="input-quote-client" /></Field>
        <Field label="Type de clôture">
          <Select name="fenceType" defaultValue={quote?.fenceType || "À confirmer"}>
            <SelectTrigger data-testid="select-quote-fence-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FENCE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Adresse"><Input name="address" defaultValue={quote?.address || ""} data-testid="input-quote-address" /></Field>
        <Field label="Ville"><Input name="city" defaultValue={quote?.city || ""} data-testid="input-quote-city" /></Field>
        <Field label="Province">
          <Select name="province" defaultValue={quote?.province || "QC"}>
            <SelectTrigger data-testid="select-quote-province"><SelectValue /></SelectTrigger>
            <SelectContent>{PROVINCES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Quartier / secteur"><Input name="neighborhood" defaultValue={sectorLastPart(quote?.sector)} data-testid="input-quote-neighborhood" /></Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Statut vente">
          <Select name="salesStatus" defaultValue={quote?.salesStatus || "nouveau"}>
            <SelectTrigger data-testid="select-quote-sales-status"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(SALES_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Statut installation">
          <Select name="installStatus" defaultValue={quote?.installStatus || "a_planifier"}>
            <SelectTrigger data-testid="select-quote-install-status"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(INSTALL_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Longueur estimée (pi)"><Input name="estimatedLength" type="number" step="0.01" defaultValue={quote?.estimatedLength ?? ""} data-testid="input-quote-length" /></Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Prix estimé"><Input name="estimatedPrice" type="number" step="0.01" defaultValue={quote?.estimatedPrice ?? ""} data-testid="input-quote-estimated-price" /></Field>
        <Field label="Prix final"><Input name="finalPrice" type="number" step="0.01" defaultValue={quote?.finalPrice ?? ""} data-testid="input-quote-final-price" /></Field>
        <Field label="Date signature"><Input name="signedDate" type="date" defaultValue={quote?.signedDate || ""} data-testid="input-quote-signed-date" /></Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Vendeur">
          <Select name="assignedSalesId" defaultValue={defaultSalesId ? String(defaultSalesId) : "none"}>
            <SelectTrigger data-testid="select-quote-sales-rep"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Non assigné</SelectItem>
              {salesReps.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name} ({u.region})</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Installateur">
          <Select name="assignedInstallerId" defaultValue={quote?.assignedInstallerId ? String(quote.assignedInstallerId) : "none"}>
            <SelectTrigger data-testid="select-quote-installer"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Non assigné</SelectItem>
              {installers.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name} ({u.region})</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Équipe">
          <Select name="assignedCrewId" defaultValue={quote?.assignedCrewId ? String(quote.assignedCrewId) : "none"}>
            <SelectTrigger data-testid="select-quote-crew"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Non assignée</SelectItem>
              {crews.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name} ({c.province})</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Date installation"><Input name="scheduledDate" type="date" defaultValue={quote?.scheduledDate || ""} data-testid="input-quote-scheduled-date" /></Field>
        <Field label="Heure installation"><Input name="scheduledTime" type="time" defaultValue={quote?.scheduledTime || ""} data-testid="input-quote-scheduled-time" /></Field>
        <Field label="Paiement final"><Input name="paidDate" type="date" defaultValue={quote?.paidDate || ""} data-testid="input-quote-paid-date" /></Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Notes vente"><Textarea name="salesNotes" rows={3} defaultValue={quote?.salesNotes || ""} data-testid="textarea-quote-sales-notes" /></Field>
        <Field label="Notes installation"><Textarea name="installNotes" rows={3} defaultValue={quote?.installNotes || ""} data-testid="textarea-quote-install-notes" /></Field>
      </div>

      <input type="hidden" name="installedDate" value={quote?.installedDate || ""} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Annuler</Button>
        <Button type="submit" disabled={isPending} data-testid="button-save-quote">Enregistrer</Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm">
      <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function nullable(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  return text || null;
}

function numericOrNull(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  if (!text || text === "none") return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function required(value: FormDataEntryValue | null, label: string) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} requis`);
  return text;
}

function buildSector(province: FormDataEntryValue | null, city: FormDataEntryValue | null, neighborhood: FormDataEntryValue | null) {
  return [nullable(province), nullable(city), nullable(neighborhood)].filter(Boolean).join(" › ") || null;
}

function sectorLastPart(sector?: string | null) {
  if (!sector) return "";
  const parts = sector.split("›").map(p => p.trim()).filter(Boolean);
  return parts.length > 2 ? parts[parts.length - 1] : "";
}
