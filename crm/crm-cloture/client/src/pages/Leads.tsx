import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Mail, Phone, MapPin, Filter, Globe, Database, Clock, Trash2, FlaskConical, RefreshCw, KeyRound, ExternalLink, Pencil } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useRole } from "@/lib/role-context";
import { useLanguage } from "@/lib/language-context";
import { useToast } from "@/hooks/use-toast";
import type { Lead, User } from "@shared/schema";
import { LEAD_STATUSES, FENCE_TYPES, PROVINCES, insertLeadSchema } from "@shared/schema";

const formSchema = insertLeadSchema.extend({
  clientName: z.string().min(2, "Nom requis"),
  province: z.string().min(2, "Province requise"),
});

function normalizeForSearch(value: string) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function Leads() {
  const { currentUser, can } = useRole();
  const { language } = useLanguage();
  const isEn = language === "en";
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>(() => {
    if (typeof window === "undefined") return "all";
    return new URLSearchParams(window.location.search).get("status") || "all";
  });
  const [filterProvince, setFilterProvince] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: quotes = [] } = useQuery<any[]>({ queryKey: ["/api/quotes"] });
  const canSyncIntimuraRole =
    currentUser?.role === "admin" || currentUser?.role === "sales_director";
  const { data: intimuraCreds } = useQuery<{
    hasServerCredentials?: boolean;
    hasCookie?: boolean;
    hasCfServiceToken?: boolean;
  }>({
    queryKey: ["/api/intimura/credentials"],
    enabled: canSyncIntimuraRole,
  });
  const quoteByLeadId = useMemo(() => {
    const m = new Map<number, any>();
    for (const q of quotes) if (q?.leadId) m.set(q.leadId, q);
    return m;
  }, [quotes]);
  const salesReps = users.filter(u => u.role === "sales_rep");

  const filtered = useMemo(() => {
    return leads.filter(l => {
      if (filterStatus !== "all" && l.status !== filterStatus) return false;
      if (filterProvince !== "all" && l.province !== filterProvince) return false;
      if (search) {
        const s = normalizeForSearch(search);
        const searchable = [l.clientName, l.city || "", l.email || ""].map(normalizeForSearch).join(" ");
        return searchable.includes(s);
      }
      return true;
    });
  }, [leads, filterStatus, filterProvince, search]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      clientName: "", phone: "", email: "", address: "", city: "", province: "QC",
      postalCode: "", neighborhood: "", fenceType: "Bois traité", message: "",
      source: "intimura", status: "nouveau",
    },
  });

  const createMut = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", "/api/leads", { ...data, _userId: currentUser?.id, _userName: currentUser?.name, _userRole: currentUser?.role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({ title: isEn ? "Lead created" : "Lead créé", description: isEn ? "Sector was detected automatically." : "Le secteur a été détecté automatiquement." });
      form.reset();
      setOpen(false);
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/leads/${id}`, { status, _userId: currentUser?.id, _userName: currentUser?.name, _userRole: currentUser?.role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
    },
  });

  const assignSalesMut = useMutation({
    mutationFn: async ({ id, salesId }: { id: number; salesId: number }) =>
      apiRequest("PATCH", `/api/leads/${id}`, {
        assignedSalesId: salesId,
        status: "assigne",
        _userId: currentUser?.id,
        _userName: currentUser?.name,
        _userRole: currentUser?.role,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({ title: isEn ? "Lead assigned" : "Lead assigné" });
    },
  });

  const deleteLeadMut = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/leads/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({ title: isEn ? "Lead deleted" : "Lead supprimé" });
    },
    onError: (err: any) => {
      toast({ title: isEn ? "Delete failed" : "Suppression échouée", description: err?.message || "", variant: "destructive" });
    },
  });

  // -------- Edit lead (admins + sales reps with edit_lead) --------
  const editForm = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      clientName: "", phone: "", email: "", address: "", city: "", province: "QC",
      postalCode: "", neighborhood: "", fenceType: "Bois traité", message: "", source: "manuel",
    },
  });
  const updateLeadMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) =>
      apiRequest("PATCH", `/api/leads/${id}`, {
        ...data,
        _userId: currentUser?.id,
        _userName: currentUser?.name,
        _userRole: currentUser?.role,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({ title: isEn ? "Lead updated" : "Lead mis à jour" });
      setEditingLead(null);
    },
    onError: (err: any) => {
      toast({ title: isEn ? "Update failed" : "Échec mise à jour", description: err?.message || "", variant: "destructive" });
    },
  });
  const openEdit = (lead: Lead) => {
    editForm.reset({
      clientName: lead.clientName || "",
      phone: lead.phone || "",
      email: lead.email || "",
      address: lead.address || "",
      city: lead.city || "",
      province: lead.province || "QC",
      postalCode: lead.postalCode || "",
      neighborhood: lead.neighborhood || "",
      fenceType: lead.fenceType || "Bois traité",
      message: lead.message || "",
      source: (lead.source as any) || "manuel",
    });
    setEditingLead(lead);
  };

  const isAdmin = currentUser?.role === "admin";
  const canSyncIntimura = canSyncIntimuraRole;
  const canServerSyncIntimura = !!intimuraCreds?.hasServerCredentials;

  // Handler pour aller à la page de setup du bookmarklet
  const handleGoToBookmarkletSetup = () => {
    if (typeof window !== "undefined") {
      window.location.hash = "#/intimura-bookmarklet";
    }
  };
  const handleMarkAsTest = (leadId: number) => {
    if (filterStatus !== "all" && filterStatus !== "test") {
      setFilterStatus("all");
    }
    updateStatus.mutate({ id: leadId, status: "test" });
  };

  const handleDeleteLead = (lead: Lead) => {
    const msg = isEn
      ? `Permanently delete the lead "${lead.clientName}"? This action cannot be undone.`
      : `Supprimer définitivement le lead « ${lead.clientName} » ? Cette action est irréversible.`;
    if (window.confirm(msg)) {
      deleteLeadMut.mutate(lead.id);
    }
  };

  // -------- Intimura sync (server-side, admin only) --------
  const syncMut = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/intimura/sync", {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intimura/auto-sync/status"] });
      const created = data?.createdLeads ?? 0;
      const skipped = data?.skipped ?? 0;
      toast({
        title: isEn ? "Sync complete" : "Synchronisation terminée",
        description: isEn
          ? created > 0
            ? `${created} new lead(s) added. ${skipped} already in CRM (skipped).`
            : `No new leads. ${skipped} already in CRM.`
          : created > 0
            ? `${created} nouveau(x) lead(s) ajouté(s). ${skipped} déjà dans le CRM (ignoré(s)).`
            : `Aucun nouveau lead. ${skipped} déjà dans le CRM.`,
      });
    },
    onError: (err: any) => {
      const raw = String(err?.message || "");
      const credsMissing = raw.includes("INTIMURA_CREDENTIALS_MISSING");
      if (credsMissing) {
        toast({
          title: isEn ? "Use bookmarklet sync" : "Utilise la synchronisation bookmarklet",
          description: isEn
            ? "Server credentials are not configured. Opening bookmarklet setup."
            : "Les identifiants serveur ne sont pas configurés. Ouverture du setup bookmarklet.",
        });
        handleGoToBookmarkletSetup();
        return;
      }
      toast({
        title: isEn ? "Sync failed" : "Synchronisation échouée",
        description: raw,
        variant: "destructive",
      });
    },
  });

  return (
    <>
      <PageHeader
        title={isEn ? "Incoming leads - Intimura" : "Leads entrants — Intimura"}
        description={isEn ? "Centralized leads from crm.intimura.com. Automatic classification by province, city, neighborhood and postal code." : "Centralisation des leads provenant de crm.intimura.com. Classification automatique par province, ville, quartier et code postal."}
        action={can("edit_lead") ? (
          <div className="flex flex-wrap items-center gap-2">
            {canSyncIntimura && (
              <Button
                data-testid="button-sync-intimura"
                className="gap-2"
                onClick={handleGoToBookmarkletSetup}
              >
                <RefreshCw className="h-4 w-4" />
                {isEn ? "Sync from Intimura" : "Synchroniser depuis Intimura"}
              </Button>
            )}
            {canSyncIntimura && canServerSyncIntimura ? (
              <Button
                data-testid="button-intimura-server-sync"
                variant="outline"
                size="icon"
                title={isEn ? "Server-side sync (uses stored cookie/token)" : "Sync serveur (cookie/token sauvegardé)"}
                disabled={syncMut.isPending}
                onClick={() => syncMut.mutate()}
              >
                <RefreshCw className={`h-4 w-4 ${syncMut.isPending ? "animate-spin" : ""}`} />
              </Button>
            ) : null}
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-new-lead" variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" /> {isEn ? "Manual lead" : "Lead manuel"}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{isEn ? "New Intimura lead" : "Nouveau lead Intimura"}</DialogTitle>
                </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => createMut.mutate(data))} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="clientName" render={({ field }) => (
                      <FormItem><FormLabel>{isEn ? "Client name *" : "Nom du client *"}</FormLabel><FormControl><Input data-testid="input-clientName" {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="phone" render={({ field }) => (
                      <FormItem><FormLabel>{isEn ? "Phone" : "Téléphone"}</FormLabel><FormControl><Input data-testid="input-phone" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                    )}/>
                    <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem><FormLabel>{isEn ? "Email" : "Courriel"}</FormLabel><FormControl><Input data-testid="input-email" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                    )}/>
                    <FormField control={form.control} name="address" render={({ field }) => (
                      <FormItem><FormLabel>{isEn ? "Address" : "Adresse"}</FormLabel><FormControl><Input data-testid="input-address" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                    )}/>
                    <FormField control={form.control} name="city" render={({ field }) => (
                      <FormItem><FormLabel>{isEn ? "City" : "Ville"}</FormLabel><FormControl><Input data-testid="input-city" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                    )}/>
                    <FormField control={form.control} name="province" render={({ field }) => (
                      <FormItem><FormLabel>{isEn ? "Province *" : "Province *"}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? "QC"}>
                          <FormControl><SelectTrigger data-testid="select-province"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>{PROVINCES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                        </Select><FormMessage />
                      </FormItem>
                    )}/>
                    <FormField control={form.control} name="postalCode" render={({ field }) => (
                      <FormItem><FormLabel>{isEn ? "Postal code" : "Code postal"}</FormLabel><FormControl><Input data-testid="input-postal" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                    )}/>
                    <FormField control={form.control} name="neighborhood" render={({ field }) => (
                      <FormItem><FormLabel>{isEn ? "Neighborhood" : "Quartier"}</FormLabel><FormControl><Input data-testid="input-neighborhood" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                    )}/>
                    <FormField control={form.control} name="fenceType" render={({ field }) => (
                      <FormItem className="col-span-2"><FormLabel>{isEn ? "Fence type" : "Type de clôture"}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? "Bois traité"}>
                          <FormControl><SelectTrigger data-testid="select-fenceType"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>{FENCE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                        </Select>
                      </FormItem>
                    )}/>
                  </div>
                  <FormField control={form.control} name="message" render={({ field }) => (
                    <FormItem><FormLabel>{isEn ? "Client message" : "Message du client"}</FormLabel><FormControl><Textarea rows={3} data-testid="input-message" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                  )}/>
                  <DialogFooter>
                    <Button type="submit" disabled={createMut.isPending} data-testid="button-submit-lead">
                      {createMut.isPending ? (isEn ? "Creating..." : "Création...") : (isEn ? "Create lead" : "Créer le lead")}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
          </div>
        ) : undefined}
      />

      <div className="p-6 lg:p-8 space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder={isEn ? "Search name, city, email..." : "Rechercher nom, ville, courriel..."}
            className="max-w-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-leads"
          />
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[200px]" data-testid="select-filter-status"><SelectValue placeholder={isEn ? "Status" : "Statut"} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEn ? "All statuses" : "Tous les statuts"}</SelectItem>
              {Object.entries(LEAD_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterProvince} onValueChange={setFilterProvince}>
            <SelectTrigger className="w-[140px]" data-testid="select-filter-province"><SelectValue placeholder={isEn ? "Province" : "Province"} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEn ? "All" : "Toutes"}</SelectItem>
              {PROVINCES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-muted-foreground">{filtered.length} {isEn ? "lead(s)" : "lead(s)"}</div>
        </div>

        {/* Lead list */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((lead) => {
            const rep = salesReps.find(r => r.id === lead.assignedSalesId);
            const isAssigned = !!lead.assignedSalesId;
            const linkedQuote = quoteByLeadId.get(lead.id);
            return (
              <Card
                key={lead.id}
                className={cn(
                  "hover-elevate border-2",
                  isAssigned ? "border-emerald-500" : "border-red-500",
                )}
                data-testid={`card-lead-${lead.id}`}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {linkedQuote ? (
                        <Link
                          href={`/soumissions/${linkedQuote.id}`}
                          className="font-semibold text-[14px] truncate block hover:underline text-primary"
                          data-testid={`link-lead-quote-${lead.id}`}
                        >
                          {lead.clientName}
                        </Link>
                      ) : (
                        <div className="font-semibold text-[14px] truncate">{lead.clientName}</div>
                      )}
                      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{lead.province}</Badge>
                        <span>{lead.sector}</span>
                        {(() => {
                          const src = (lead.source || "").toLowerCase();
                          if (src === "web") return (
                            <Badge variant="default" className="text-[10px] bg-emerald-600 hover:bg-emerald-700 gap-1">
                              <Globe className="h-2.5 w-2.5" />
                              {isEn ? "Website" : "Site web"}
                            </Badge>
                          );
                          if (src === "intimura") return (
                            <Badge variant="default" className="text-[10px] bg-violet-600 hover:bg-violet-700 gap-1">
                              <Database className="h-2.5 w-2.5" />
                              Intimura
                            </Badge>
                          );
                          return <Badge variant="outline" className="text-[10px]">{lead.source || "—"}</Badge>;
                        })()}
                        {lead.createdAt && lead.createdAt !== "CURRENT_TIMESTAMP" && (() => {
                          const d = new Date(lead.createdAt);
                          if (isNaN(d.getTime())) return null;
                          const dateStr = d.toLocaleDateString(isEn ? "en-CA" : "fr-CA", { year: "numeric", month: "short", day: "numeric" });
                          const timeStr = d.toLocaleTimeString(isEn ? "en-CA" : "fr-CA", { hour: "2-digit", minute: "2-digit" });
                          return (
                            <span className="inline-flex items-center gap-1" title={d.toLocaleString(isEn ? "en-CA" : "fr-CA")}>
                              <Clock className="h-2.5 w-2.5" />
                              {dateStr} · {timeStr}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                    <StatusBadge status={lead.status} />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[12px] text-muted-foreground">
                    {lead.email && <div className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3" />{lead.email}</div>}
                    {lead.phone && <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{lead.phone}</div>}
                    {lead.address && <div className="flex items-center gap-1.5 truncate col-span-2"><MapPin className="h-3 w-3" />{lead.address}, {lead.city}</div>}
                  </div>

                  {lead.message && <p className="text-[12px] text-foreground/80 line-clamp-2">{lead.message}</p>}

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
                    <div className="text-[11px]">
                      {lead.fenceType && <Badge variant="secondary" className="text-[10px]">{lead.fenceType}</Badge>}
                      {lead.estimatedValue && <span className="ml-2 tabular font-semibold">{Intl.NumberFormat(isEn ? "en-CA" : "fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(lead.estimatedValue)}</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {rep ? <>{isEn ? "Sales rep" : "Vendeur"}: <span className="font-medium text-foreground">{rep.name}</span></> : <span className="text-amber-600">{isEn ? "Unassigned" : "Non assigné"}</span>}
                    </div>
                  </div>

                  {can("assign_sales") && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Select
                        value={lead.assignedSalesId ? String(lead.assignedSalesId) : ""}
                        onValueChange={(value) => assignSalesMut.mutate({ id: lead.id, salesId: Number(value) })}
                        disabled={assignSalesMut.isPending}
                      >
                        <SelectTrigger className="h-8 w-[220px]" data-testid={`select-assign-sales-${lead.id}`}>
                          <SelectValue placeholder={isEn ? "Assign to a seller..." : "Assigner à un vendeur..."} />
                        </SelectTrigger>
                        <SelectContent>
                          {salesReps.map((rep) => (
                            <SelectItem key={rep.id} value={String(rep.id)}>
                              {rep.name}
                              {rep.region === lead.province ? " ★" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {can("edit_lead") && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {Object.entries(LEAD_STATUSES).filter(([k]) => k !== lead.status && (lead.status === "test" || k !== "test")).map(([k, v]) => (
                        <Button key={k} size="sm" variant="outline" className="h-7 text-[11px]"
                          onClick={() => updateStatus.mutate({ id: lead.id, status: k })}
                          data-testid={`button-status-${lead.id}-${k}`}>
                          → {v}
                        </Button>
                      ))}
                    </div>
                  )}

                  {can("edit_lead") && (
                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] gap-1"
                        onClick={() => openEdit(lead)}
                        data-testid={`button-edit-lead-${lead.id}`}
                      >
                        <Pencil className="h-3 w-3" />
                        {isEn ? "Edit" : "Modifier"}
                      </Button>
                      {lead.status !== "test" && can("assign_sales") && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-[11px] gap-1"
                          onClick={() => handleMarkAsTest(lead.id)}
                          disabled={updateStatus.isPending}
                          data-testid={`button-mark-test-${lead.id}`}
                        >
                          <FlaskConical className="h-3 w-3" />
                          {isEn ? "Mark for testing" : "Marquer pour test"}
                        </Button>
                      )}
                    </div>
                  )}

                  {isAdmin && (
                    <div className="flex justify-end pt-1 border-t border-border/50">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                        onClick={() => handleDeleteLead(lead)}
                        disabled={deleteLeadMut.isPending}
                        data-testid={`button-delete-lead-${lead.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                        {isEn ? "Delete" : "Supprimer"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground text-sm">{isEn ? "No lead matches the current filters." : "Aucun lead ne correspond aux filtres."}</div>
          )}
        </div>
      </div>

      {/* Edit lead dialog */}
      <Dialog open={!!editingLead} onOpenChange={(o) => { if (!o) setEditingLead(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEn ? "Edit lead" : "Modifier le lead"}</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit((data) => {
                if (editingLead) updateLeadMut.mutate({ id: editingLead.id, data });
              })}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <FormField control={editForm.control} name="clientName" render={({ field }) => (
                  <FormItem><FormLabel>{isEn ? "Client name *" : "Nom du client *"}</FormLabel><FormControl><Input data-testid="edit-input-clientName" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={editForm.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>{isEn ? "Phone" : "Téléphone"}</FormLabel><FormControl><Input data-testid="edit-input-phone" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                )}/>
                <FormField control={editForm.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>{isEn ? "Email" : "Courriel"}</FormLabel><FormControl><Input data-testid="edit-input-email" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                )}/>
                <FormField control={editForm.control} name="address" render={({ field }) => (
                  <FormItem><FormLabel>{isEn ? "Address" : "Adresse"}</FormLabel><FormControl><Input data-testid="edit-input-address" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                )}/>
                <FormField control={editForm.control} name="city" render={({ field }) => (
                  <FormItem><FormLabel>{isEn ? "City" : "Ville"}</FormLabel><FormControl><Input data-testid="edit-input-city" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                )}/>
                <FormField control={editForm.control} name="province" render={({ field }) => (
                  <FormItem><FormLabel>{isEn ? "Province *" : "Province *"}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? "QC"}>
                      <FormControl><SelectTrigger data-testid="edit-select-province"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{PROVINCES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select><FormMessage />
                  </FormItem>
                )}/>
                <FormField control={editForm.control} name="postalCode" render={({ field }) => (
                  <FormItem><FormLabel>{isEn ? "Postal code" : "Code postal"}</FormLabel><FormControl><Input data-testid="edit-input-postal" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                )}/>
                <FormField control={editForm.control} name="neighborhood" render={({ field }) => (
                  <FormItem><FormLabel>{isEn ? "Neighborhood" : "Quartier"}</FormLabel><FormControl><Input data-testid="edit-input-neighborhood" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                )}/>
                <FormField control={editForm.control} name="fenceType" render={({ field }) => (
                  <FormItem className="col-span-2"><FormLabel>{isEn ? "Fence type" : "Type de clôture"}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? "Bois traité"}>
                      <FormControl><SelectTrigger data-testid="edit-select-fenceType"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{FENCE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormItem>
                )}/>
              </div>
              <FormField control={editForm.control} name="message" render={({ field }) => (
                <FormItem><FormLabel>{isEn ? "Message / notes" : "Message / notes"}</FormLabel><FormControl><Textarea rows={3} data-testid="edit-input-message" {...field} value={field.value ?? ""} /></FormControl></FormItem>
              )}/>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingLead(null)}>
                  {isEn ? "Cancel" : "Annuler"}
                </Button>
                <Button type="submit" disabled={updateLeadMut.isPending} data-testid="button-save-edit-lead">
                  {updateLeadMut.isPending ? (isEn ? "Saving..." : "Enregistrement...") : (isEn ? "Save" : "Enregistrer")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
