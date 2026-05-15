import { useMemo, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Mail, Phone, MapPin, Filter, Globe, Database, Clock, Trash2, FlaskConical, RefreshCw, KeyRound, ExternalLink, Pencil, StickyNote } from "lucide-react";
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

/** Texte notes vente tel que renvoyé par l'API (camelCase ou snake_case). */
function quoteSalesNotes(q: any): string {
  return String(q?.salesNotes ?? q?.sales_notes ?? "");
}

function quoteIntimuraBlob(q: any): unknown {
  return q?.intimuraData ?? q?.intimura_data;
}

/** Ligne créée dans notre CRM via « Ajouter une note interne » (voir QuoteDetail : date — auteur : …). */
const CRM_INTERNAL_NOTE_LINE =
  /^\d{4}-\d{2}-\d{2}\s+(?:[—\-–]\s*.+|:\s*.+)$/;

function getLastCrmInternalNoteLine(salesNotes: string): string | null {
  const norm = salesNotes.replace(/\r\n/g, "\n");
  const lines = norm.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (!t) continue;
    if (CRM_INTERNAL_NOTE_LINE.test(t)) return t;
    if (/^\d{4}-\d{2}-\d{2}\b/.test(t) && /\s:\s/.test(t)) return t;
  }
  return null;
}

function truncateNote(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1).trimEnd()}…`;
}

function extractInternalNoteCandidate(blob: unknown, syncedAt?: string | null): { text: string; ts: number } | null {
  if (!blob) return null;
  let d: any = blob;
  if (typeof blob === "string") {
    try {
      d = JSON.parse(blob);
    } catch {
      return null;
    }
  }
  const q = d?.quote;
  const raw = q?.internal_notes ?? q?.internalNotes;
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return null;
  const crmInInt = getLastCrmInternalNoteLine(text);
  const displayBody = crmInInt || text;
  const fetched = d?.fetchedAt || syncedAt;
  const ts = fetched ? Date.parse(String(fetched)) : 0;
  return { text: displayBody, ts: Number.isFinite(ts) ? ts : 0 };
}

/** Dernière note interne : lignes CRM datées sur la soumission, puis Intimura (JSON / bloc salesNotes). */
function getSubmissionInternalNotePreview(quote: any, maxLen = 420): string | null {
  if (!quote) return null;
  const sn = quoteSalesNotes(quote);
  const crmLast = getLastCrmInternalNoteLine(sn);

  const candidates: { text: string; ts: number }[] = [];

  const main = extractInternalNoteCandidate(quoteIntimuraBlob(quote), null);
  if (main) candidates.push(main);

  try {
    const linkedRaw = quote.linkedIntimuraQuotes ?? quote.linked_intimura_quotes;
    const arr = typeof linkedRaw === "string" ? JSON.parse(linkedRaw) : linkedRaw;
    if (Array.isArray(arr)) {
      for (const entry of arr) {
        const n = extractInternalNoteCandidate(entry?.intimuraData ?? entry?.intimura_data, entry?.syncedAt ?? null);
        if (n) candidates.push(n);
      }
    }
  } catch {
    /* ignore */
  }

  candidates.sort((a, b) => a.ts - b.ts);
  let chosen = candidates.length ? candidates[candidates.length - 1]!.text : null;

  if (!chosen) {
    const snNorm = sn.replace(/\r\n/g, "\n");
    const doubleMk = "\n\n--- Intimura ---\n";
    const singleMk = "\n--- Intimura ---\n";
    let idx = snNorm.lastIndexOf(doubleMk);
    let mkLen = doubleMk.length;
    if (idx < 0) {
      idx = snNorm.lastIndexOf(singleMk);
      mkLen = singleMk.length;
    }
    if (idx >= 0) chosen = snNorm.slice(idx + mkLen).trim();
  }

  const out = crmLast || chosen;
  if (!out) return null;
  if (out.length > maxLen) return `${out.slice(0, maxLen - 1).trimEnd()}…`;
  return out;
}

/** Dernière note sur la carte : d’abord notes CRM (`salesNotes`), puis repli contenu Intimura sur la soumission. */
function getSubmissionNoteForLead(
  leadId: number,
  quotes: any[],
  maxLen = 420,
): { text: string; fromCrm: boolean } | null {
  const forLead = quotes.filter((q) => q != null && Number(q.leadId) === Number(leadId));
  if (!forLead.length) return null;

  const mergedSn = forLead.map((q) => quoteSalesNotes(q)).join("\n");
  const fromMerged = getLastCrmInternalNoteLine(mergedSn);
  if (fromMerged) return { text: truncateNote(fromMerged, maxLen), fromCrm: true };

  const sorted = [...forLead].sort((a, b) => Number(b.id) - Number(a.id));
  for (const q of sorted) {
    const crmOne = getLastCrmInternalNoteLine(quoteSalesNotes(q));
    if (crmOne) return { text: truncateNote(crmOne, maxLen), fromCrm: true };
  }

  for (const q of sorted) {
    const p = getSubmissionInternalNotePreview(q, maxLen);
    if (p) return { text: p, fromCrm: false };
  }
  return null;
}

export function Leads() {
  const { currentUser, can } = useRole();
  /** Dernière note sur la soumission (CRM d’abord, puis Intimura). */
  const canViewSubmissionInternalNote = can("view_sales");
  const { language } = useLanguage();
  const isEn = language === "en";
  const { toast } = useToast();
  const [location] = useLocation();
  /** Liste Intimura : tout sauf source site web. Liste Impress : uniquement source `web`. */
  const leadListKind: "intimura" | "impress" = location.startsWith("/leads-impress") ? "impress" : "intimura";
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
  /** Soumission la plus récente (id max) pour le lien ; la note sur la carte agrège toutes les soumissions du lead. */
  const quoteByLeadId = useMemo(() => {
    const m = new Map<number, any>();
    for (const q of quotes) {
      if (q?.leadId == null) continue;
      const lid = Number(q.leadId);
      const prev = m.get(lid);
      if (!prev || Number(q.id) > Number(prev.id)) m.set(lid, q);
    }
    return m;
  }, [quotes]);
  const salesReps = users.filter(u => u.role === "sales_rep");

  const filtered = useMemo(() => {
    return leads.filter(l => {
      const src = (l.source || "").toLowerCase();
      if (leadListKind === "impress") {
        if (src !== "web") return false;
      } else if (src === "web") {
        return false;
      }
      if (filterStatus !== "all" && l.status !== filterStatus) return false;
      if (filterProvince !== "all" && l.province !== filterProvince) return false;
      if (search) {
        const s = normalizeForSearch(search);
        const searchable = [l.clientName, l.city || "", l.email || ""].map(normalizeForSearch).join(" ");
        return searchable.includes(s);
      }
      return true;
    });
  }, [leads, filterStatus, filterProvince, search, leadListKind]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      clientName: "", phone: "", email: "", address: "", city: "", province: "QC",
      postalCode: "", neighborhood: "", fenceType: "Bois traité", message: "",
      source: leadListKind === "impress" ? "web" : "intimura",
      status: "nouveau",
    },
  });

  useEffect(() => {
    form.reset({
      clientName: "", phone: "", email: "", address: "", city: "", province: "QC",
      postalCode: "", neighborhood: "", fenceType: "Bois traité", message: "",
      source: leadListKind === "impress" ? "web" : "intimura",
      status: "nouveau",
    });
  }, [leadListKind, form]);

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
      const quotes = data?.createdQuotes ?? 0;
      const detailed = data?.detailsUpdated ?? 0;
      const skipped = data?.skipped ?? 0;
      toast({
        title: isEn ? "Sync complete" : "Synchronisation terminée",
        description: isEn
          ? `${created} new lead(s), ${quotes} quote(s), ${detailed} full Intimura sheet(s). ${skipped} skipped.`
          : `${created} nouveau(x) lead(s), ${quotes} soumission(s), ${detailed} fiche(s) Intimura complète(s). ${skipped} ignoré(s).`,
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
        title={
          leadListKind === "impress"
            ? isEn
              ? "Website leads — Impress"
              : "Leads Impress (site web)"
            : isEn
              ? "Incoming leads - Intimura"
              : "Leads entrants — Intimura"
        }
        description={
          leadListKind === "impress"
            ? isEn
              ? "Requests submitted through the Clôture Impress website."
              : "Demandes envoyées depuis le site Clôture Impress."
            : isEn
              ? "Centralized leads from crm.intimura.com. Automatic classification by province, city, neighborhood and postal code."
              : "Centralisation des leads provenant de crm.intimura.com. Classification automatique par province, ville, quartier et code postal."
        }
        action={can("edit_lead") ? (
          <div className="flex flex-wrap items-center gap-2">
            {leadListKind === "intimura" && canSyncIntimura && (
              <Button
                data-testid="button-sync-intimura"
                className="gap-2"
                onClick={handleGoToBookmarkletSetup}
              >
                <RefreshCw className="h-4 w-4" />
                {isEn ? "Sync from Intimura" : "Synchroniser depuis Intimura"}
              </Button>
            )}
            {leadListKind === "intimura" && canSyncIntimura && canServerSyncIntimura ? (
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
                  <DialogTitle>
                    {leadListKind === "impress"
                      ? isEn
                        ? "New website lead (manual)"
                        : "Nouveau lead site web (manuel)"
                      : isEn
                        ? "New Intimura lead"
                        : "Nouveau lead Intimura"}
                  </DialogTitle>
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
            const submissionNote = getSubmissionNoteForLead(lead.id, quotes);
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

                  {canViewSubmissionInternalNote && submissionNote && (
                    <div className="rounded-md border-2 border-amber-400/70 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[12px] text-foreground">
                      <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                        <StickyNote className="h-3.5 w-3.5 shrink-0" />
                        {isEn ? "Last internal note" : "Dernière note interne"}
                      </div>
                      <p className="line-clamp-3 whitespace-pre-wrap break-words text-foreground/80 leading-snug">{submissionNote.text}</p>
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
