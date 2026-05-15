import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { ArrowLeft, MapPin, Ruler, DollarSign, Calendar, Phone, Mail, User as UserIcon, Check, Sparkles, Copy, ChevronDown, ChevronUp, Camera, X as XIcon, ZoomIn } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useRole } from "@/lib/role-context";
import { useLanguage } from "@/lib/language-context";
import { useToast } from "@/hooks/use-toast";
import type { Quote, User, Activity, Crew, Lead } from "@shared/schema";
import { SALES_STATUSES, INSTALL_STATUSES } from "@shared/schema";
import { getWinProbability, getProbabilityBadgeColor } from "@/lib/win-probability";

const TIMELINE_STEPS = [
  { label: "Lead reçu", labelEn: "Lead received", aliases: ["Lead reçu", "Lead créé"], team: "sales" },
  { label: "Soumission envoyée", labelEn: "Quote sent", aliases: ["Soumission envoyée"], team: "sales", payload: { salesStatus: "envoyee", status: "envoyee" } },
  { label: "Suivi", labelEn: "Follow-up", aliases: ["Suivi", "Contacté"], team: "sales", payload: { salesStatus: "suivi" } },
  { label: "Rendez-vous vente / mesure", labelEn: "Sales/measurement appointment", aliases: ["Rendez-vous vente / mesure", "Rendez-vous mesure", "Rendez-vous"], team: "sales", payload: { salesStatus: "rendez_vous" } },
  { label: "Signature estimation", labelEn: "Quote signed", aliases: ["Signature estimation", "Signée"], team: "sales", payload: { salesStatus: "signee", status: "signee" } },
  { label: "Dépôt payé", labelEn: "Deposit paid", aliases: ["Dépôt payé", "Dépôt payer", "Acompte reçu"], team: "sales" },
  { label: "Matériel commandé", labelEn: "Material ordered", aliases: ["Matériel commandé", "Matériel à préparer", "Matériel préparé"], team: "install", payload: { installStatus: "materiel" } },
  { label: "Matériel en route", labelEn: "Material on the way", aliases: ["Matériel en route", "En route"], team: "install", payload: { installStatus: "en_route" } },
  { label: "Matériel livré", labelEn: "Material delivered", aliases: ["Matériel livré"], team: "install" },
  { label: "Installation", labelEn: "Installation", aliases: ["Installation", "Installation en cours", "En cours", "Planifiée", "Date d'installation planifiée", "Calendrier installation modifié"], team: "install", payload: { installStatus: "en_cours" } },
  { label: "Installation terminée et approuvée par client", labelEn: "Installation completed and client-approved", aliases: ["Installation terminée et approuvée par client", "Signature de satisfaction client", "Terminée", "Installée", "Inspection", "Inspectée"], team: "install", payload: { installStatus: "terminee" } },
  { label: "Paiement final", labelEn: "Final payment", aliases: ["Paiement final", "Payée", "Payé"], team: "sales", payload: { paidDate: new Date().toISOString().slice(0, 10) } },
];

export function QuoteDetail() {
  const [, params] = useRoute("/soumissions/:id");
  const id = Number(params?.id);
  const { currentUser, can, role } = useRole();
  const { language } = useLanguage();
  const isEn = language === "en";
  const { toast } = useToast();
  const [newNote, setNewNote] = useState("");
  const [salesNotes, setSalesNotes] = useState("");
  const [installNotes, setInstallNotes] = useState("");

  const { data: quote } = useQuery<Quote>({ queryKey: ["/api/quotes", id], enabled: !!id });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: crews = [] } = useQuery<Crew[]>({ queryKey: ["/api/crews"] });
  const { data: lead } = useQuery<Lead>({ queryKey: ["/api/leads", quote?.leadId], enabled: !!quote?.leadId });

  // Parse the Intimura submission blob attached to this quote (if any).
  let intimura: any = null;
  try { intimura = quote?.intimuraData ? JSON.parse(quote.intimuraData as any) : null; } catch { intimura = null; }
  const intimuraCustomer = intimura?.customer || null;
  const intimuraQuote = intimura?.quote || null;
  const initialItems = Array.isArray(intimura?.items) ? intimura.items : [];
  const [itemsDraft, setItemsDraft] = useState<any[] | null>(null);
  const items = itemsDraft ?? initialItems;
  const itemsDirty = itemsDraft !== null;
  const updateItem = (idx: number, patch: any) => {
    const next = items.map((it: any, i: number) => i === idx ? { ...it, ...patch } : it);
    setItemsDraft(next);
  };
  const removeItem = (idx: number) => setItemsDraft(items.filter((_: any, i: number) => i !== idx));
  const addItem = () => setItemsDraft([...items, { id: `new-${Date.now()}`, description: "", qty: "1", unit_price: "0", catalog_item_id: null, catalog_item_variant_id: null }]);
  const subtotal = items.reduce((s: number, it: any) => s + Number(it?.qty || 0) * Number(it?.unit_price || 0), 0);
  const saveItems = () => {
    if (!intimura) return;
    const updatedBlob = { ...intimura, items, modifiedInCrmAt: new Date().toISOString() };
    updateMut.mutate({
      intimuraData: JSON.stringify(updatedBlob),
      estimatedPrice: subtotal,
      _note: isEn ? "Intimura items edited" : "Items Intimura modifiés",
    });
    setItemsDraft(null);
  };
  const { data: activities = [] } = useQuery<Activity[]>({
    queryKey: ["/api/activities", { quoteId: id }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/activities?quoteId=${id}`);
      return res.json();
    },
    enabled: !!id,
  });

  const rep = users.find(u => u.id === quote?.assignedSalesId);
  const installer = users.find(u => u.id === quote?.assignedInstallerId);
  const moneyFmt = new Intl.NumberFormat(isEn ? "en-CA" : "fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

  const updateMut = useMutation({
    mutationFn: async (data: any) => apiRequest("PATCH", `/api/quotes/${id}`, {
      ...data, _userId: currentUser?.id, _userName: currentUser?.name, _userRole: currentUser?.role,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities", { quoteId: id }] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: isEn ? "Quote updated" : "Soumission mise à jour" });
    },
  });

  const leadUpdateMut = useMutation({
    mutationFn: async (data: any) => {
      if (!quote?.leadId) throw new Error("no lead");
      return apiRequest("PATCH", `/api/leads/${quote.leadId}`, {
        ...data, _userId: currentUser?.id, _userName: currentUser?.name, _userRole: currentUser?.role,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads", quote?.leadId] });
      toast({ title: isEn ? "Lead updated" : "Lead mis à jour" });
    },
  });

  if (!quote) {
    return <div className="p-8 text-muted-foreground">{isEn ? "Loading..." : "Chargement…"}</div>;
  }

  const timeline: Array<{ step: string; date?: string; note?: string }> = quote.timeline ? JSON.parse(quote.timeline) : [];
  const isDirector = role === "admin" || role === "sales_director" || role === "install_director";
  const canEditSales = (can("edit_sales") || isDirector) && (role !== "sales_rep" || quote.assignedSalesId === currentUser?.id);
  const canEditInstall = (can("edit_install") || isDirector) && (role !== "installer" || quote.assignedInstallerId === currentUser?.id);
  const canEditClient = can("edit_sales") || can("edit_lead") || isDirector;
  const canMarkStep = (team: string) => canEditSales || (team === "install" && canEditInstall);
  const stepKey = (label: string) => label.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  const markStep = (step: typeof TIMELINE_STEPS[number]) => updateMut.mutate({
    ...(step.payload || {}),
    _timelineStep: step.label,
    _note: isEn ? `Step checked: ${step.labelEn}` : `Étape cochée : ${step.label}`,
  });
  const unmarkStep = (step: typeof TIMELINE_STEPS[number]) => {
    const updatedTimeline = timeline.filter(t => !step.aliases.includes(t.step));
    updateMut.mutate({
      timeline: JSON.stringify(updatedTimeline),
      ...(step.label === "Paiement final" ? { paidDate: null } : {}),
      _note: isEn ? `Step unchecked: ${step.labelEn}` : `Étape décochée : ${step.label}`,
    });
  };

  return (
    <>
      <PageHeader
        title={`${isEn ? "Quote" : "Soumission"} #${quote.id} — ${quote.clientName}`}
        description={`${quote.fenceType || (isEn ? "Type undefined" : "Type non défini")} · ${quote.sector || (isEn ? "Sector undefined" : "Secteur non défini")}`}
        action={
          <Link href="/soumissions">
            <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-back-quotes"><ArrowLeft className="h-4 w-4" /> {isEn ? "Back" : "Retour"}</Button>
          </Link>
        }
      />

      <div className="p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Client info */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{isEn ? "Client & address" : "Client & adresse"}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <EditableInfo
                icon={<UserIcon className="h-3.5 w-3.5" />}
                label={isEn ? "Client" : "Client"}
                value={quote.clientName || ""}
                editable={canEditClient}
                onSave={(v) => updateMut.mutate({ clientName: v })}
                placeholder="—"
              />
              <EditableInfo
                icon={<MapPin className="h-3.5 w-3.5" />}
                label={isEn ? "Address" : "Adresse"}
                value={quote.address || ""}
                editable={canEditClient}
                onSave={(v) => updateMut.mutate({ address: v })}
                placeholder="—"
              />
              <EditableInfo
                icon={<MapPin className="h-3.5 w-3.5" />}
                label={isEn ? "City" : "Ville"}
                value={quote.city || ""}
                editable={canEditClient}
                onSave={(v) => updateMut.mutate({ city: v })}
                placeholder="—"
              />
              <EditableInfo
                icon={<MapPin className="h-3.5 w-3.5" />}
                label={isEn ? "Province" : "Province"}
                value={quote.province || ""}
                editable={canEditClient}
                onSave={(v) => updateMut.mutate({ province: v })}
                placeholder="—"
              />
              <EditableInfo
                icon={<Phone className="h-3.5 w-3.5" />}
                label={isEn ? "Phone" : "Téléphone"}
                value={lead?.phone || ""}
                editable={canEditClient && !!quote.leadId}
                onSave={(v) => leadUpdateMut.mutate({ phone: v })}
                placeholder="—"
              />
              <EditableInfo
                icon={<Mail className="h-3.5 w-3.5" />}
                label={isEn ? "Email" : "Courriel"}
                value={lead?.email || ""}
                editable={canEditClient && !!quote.leadId}
                onSave={(v) => leadUpdateMut.mutate({ email: v })}
                placeholder="—"
              />
              <EditableInfo
                icon={<Ruler className="h-3.5 w-3.5" />}
                label={isEn ? "Estimated length" : "Longueur estimée"}
                value={quote.estimatedLength != null ? String(quote.estimatedLength) : ""}
                editable={canEditClient}
                type="number"
                suffix={isEn ? " ft" : " pi"}
                onSave={(v) => updateMut.mutate({ estimatedLength: v === "" ? null : parseFloat(v) })}
                placeholder="—"
              />
              <EditableInfo
                icon={<DollarSign className="h-3.5 w-3.5" />}
                label={isEn ? "Estimated price" : "Prix estimé"}
                value={quote.estimatedPrice != null ? String(quote.estimatedPrice) : ""}
                editable={canEditClient}
                type="number"
                display={quote.estimatedPrice ? moneyFmt.format(quote.estimatedPrice) : "—"}
                onSave={(v) => updateMut.mutate({ estimatedPrice: v === "" ? null : parseFloat(v) })}
                placeholder="—"
              />
              <Info icon={<UserIcon className="h-3.5 w-3.5" />} label={isEn ? "Sales rep" : "Vendeur"} value={rep?.name || (isEn ? "Unassigned" : "Non assigné")} />
              <Info icon={<UserIcon className="h-3.5 w-3.5" />} label={isEn ? "Installer" : "Installateur"} value={installer?.name || (isEn ? "Unassigned" : "Non assigné")} />
            </CardContent>
          </Card>

          {/* Intimura submission (if synced) */}
          {intimura && (
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base">{isEn ? "Intimura submission" : "Soumission Intimura"}</CardTitle>
                <a
                  href={`https://crm.intimura.com/app/quotes/${quote.intimuraId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-primary hover:underline"
                >
                  {isEn ? "Open in Intimura ↗" : "Ouvrir dans Intimura ↗"}
                </a>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {intimuraQuote && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Info icon={<Calendar className="h-3.5 w-3.5" />} label={isEn ? "Issued" : "Émise"} value={intimuraQuote.issued_at || "—"} />
                    <Info icon={<Calendar className="h-3.5 w-3.5" />} label={isEn ? "Valid until" : "Valide jusqu'au"} value={intimuraQuote.valid_until || "—"} />
                    <Info icon={<DollarSign className="h-3.5 w-3.5" />} label={isEn ? "First payment" : "1er paiement"} value={intimuraQuote.first_payment_amount ? `$${intimuraQuote.first_payment_amount}` : "—"} />
                    <Info icon={<UserIcon className="h-3.5 w-3.5" />} label={isEn ? "Assigned" : "Assigné à"} value={intimuraQuote.assigned_user_name || "—"} />
                  </div>
                )}

                {Array.isArray(intimura.metadata) && intimura.metadata.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">{isEn ? "Specifications" : "Spécifications"}</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {intimura.metadata.map((m: any) => (
                        <div key={m.id} className="text-[12px]">
                          <span className="text-muted-foreground">{m.label}: </span>
                          <span className="font-medium">{m.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(intimuraQuote?.internal_notes || quote.salesNotes || canEditSales) && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">{isEn ? "Internal notes" : "Notes internes"}</div>
                    {intimuraQuote?.internal_notes && (
                      <pre className="whitespace-pre-wrap text-[12px] bg-muted/40 rounded p-2">{intimuraQuote.internal_notes}</pre>
                    )}
                    {quote.salesNotes && (
                      <pre className="whitespace-pre-wrap text-[12px] bg-muted/40 rounded p-2 mt-2">{quote.salesNotes}</pre>
                    )}
                    {canEditSales && (
                      <div className="mt-2 flex gap-2 items-start">
                        <Textarea
                          rows={2}
                          placeholder={isEn ? "Add an internal note (will be timestamped)..." : "Ajouter une note interne (date et auteur ajoutés)..."}
                          value={newNote}
                          onChange={(e) => setNewNote(e.target.value)}
                          className="text-[12px]"
                          data-testid="textarea-add-internal-note"
                        />
                        <Button
                          size="sm"
                          disabled={!newNote.trim()}
                          onClick={() => {
                            const stamp = new Date().toISOString().slice(0, 10);
                            const author = currentUser?.name || "";
                            const prefix = author ? `${stamp} — ${author} : ` : `${stamp} : `;
                            const line = prefix + newNote.trim();
                            const next = quote.salesNotes ? `${quote.salesNotes}\n${line}` : line;
                            updateMut.mutate({ salesNotes: next, _note: newNote.trim() });
                            setNewNote("");
                          }}
                          data-testid="button-add-internal-note"
                        >
                          {isEn ? "Add" : "Ajouter"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{isEn ? "Line items" : "Articles"}</div>
                    {canEditSales && (
                      <Button size="sm" variant="outline" onClick={addItem} data-testid="button-add-intimura-item">+ {isEn ? "Add item" : "Ajouter article"}</Button>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead className="text-muted-foreground text-left">
                        <tr>
                          <th className="font-medium py-1 pr-2">{isEn ? "Description" : "Description"}</th>
                          <th className="font-medium py-1 px-2 w-20">{isEn ? "Qty" : "Qté"}</th>
                          <th className="font-medium py-1 px-2 w-28">{isEn ? "Unit $" : "Prix unit."}</th>
                          <th className="font-medium py-1 pl-2 w-28 text-right">{isEn ? "Total" : "Total"}</th>
                          {canEditSales && <th className="w-8"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it: any, idx: number) => {
                          const lineTotal = Number(it?.qty || 0) * Number(it?.unit_price || 0);
                          return (
                            <tr key={it.id || idx} className="border-t">
                              <td className="py-1 pr-2">
                                {canEditSales ? (
                                  <Input value={it.description || ""} onChange={(e) => updateItem(idx, { description: e.target.value })} className="h-7 text-[12px]" />
                                ) : (it.description || "—")}
                              </td>
                              <td className="py-1 px-2">
                                {canEditSales ? (
                                  <Input type="number" step="0.01" value={it.qty ?? ""} onChange={(e) => updateItem(idx, { qty: e.target.value })} className="h-7 text-[12px]" />
                                ) : it.qty}
                              </td>
                              <td className="py-1 px-2">
                                {canEditSales ? (
                                  <Input type="number" step="0.01" value={it.unit_price ?? ""} onChange={(e) => updateItem(idx, { unit_price: e.target.value })} className="h-7 text-[12px]" />
                                ) : it.unit_price}
                              </td>
                              <td className="py-1 pl-2 text-right tabular-nums">${lineTotal.toFixed(2)}</td>
                              {canEditSales && (
                                <td className="py-1 pl-2">
                                  <button type="button" onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive" title={isEn ? "Remove" : "Supprimer"}>×</button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                        {items.length === 0 && (
                          <tr><td colSpan={canEditSales ? 5 : 4} className="py-3 text-center text-muted-foreground">{isEn ? "No items." : "Aucun article."}</td></tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="border-t font-semibold">
                          <td colSpan={3} className="py-2 text-right">{isEn ? "Subtotal" : "Sous-total"}</td>
                          <td className="py-2 pl-2 text-right tabular-nums">${subtotal.toFixed(2)}</td>
                          {canEditSales && <td></td>}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {canEditSales && itemsDirty && (
                    <div className="flex gap-2 mt-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => setItemsDraft(null)} data-testid="button-cancel-intimura-items">{isEn ? "Cancel" : "Annuler"}</Button>
                      <Button size="sm" onClick={saveItems} data-testid="button-save-intimura-items">{isEn ? "Save items" : "Enregistrer articles"}</Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Status controls */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{isEn ? "Statuses" : "Statuts"}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">{isEn ? "Sales" : "Vente"}</div>
                  <div className="flex items-center gap-2 mb-2">
                    <StatusBadge status={quote.salesStatus} />
                    <Badge className={`text-[11px] font-semibold ${getProbabilityBadgeColor(getWinProbability(quote.salesStatus))}`}>
                      {getWinProbability(quote.salesStatus)}% {isEn ? "win" : "probabilité"}
                    </Badge>
                  </div>
                  {canEditSales && (
                    <Select value={quote.salesStatus} onValueChange={(v) => updateMut.mutate({ salesStatus: v, _timelineStep: SALES_STATUSES[v as keyof typeof SALES_STATUSES] })}>
                      <SelectTrigger className="w-full" data-testid="select-sales-status"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(SALES_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">{isEn ? "Installation" : "Installation"}</div>
                  <div className="flex items-center gap-2 mb-2"><StatusBadge status={quote.installStatus} /></div>
                  {canEditInstall && (
                    <Select value={quote.installStatus} onValueChange={(v) => updateMut.mutate({ installStatus: v, _timelineStep: INSTALL_STATUSES[v as keyof typeof INSTALL_STATUSES] })}>
                      <SelectTrigger className="w-full" data-testid="select-install-status"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(INSTALL_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">{isEn ? "Sales notes" : "Notes vente"}</div>
                  <Textarea
                    rows={4}
                    defaultValue={quote.salesNotes || ""}
                    onChange={(e) => setSalesNotes(e.target.value)}
                    disabled={!canEditSales}
                    data-testid="textarea-sales-notes"
                  />
                  {canEditSales && (
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => updateMut.mutate({ salesNotes })} data-testid="button-save-sales-notes">{isEn ? "Save sales notes" : "Enregistrer notes vente"}</Button>
                  )}
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">{isEn ? "Installation notes" : "Notes installation"}</div>
                  <Textarea
                    rows={4}
                    defaultValue={quote.installNotes || ""}
                    onChange={(e) => setInstallNotes(e.target.value)}
                    disabled={!canEditInstall}
                    data-testid="textarea-install-notes"
                  />
                  {canEditInstall && (
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => updateMut.mutate({ installNotes })} data-testid="button-save-install-notes">{isEn ? "Save installation notes" : "Enregistrer notes installation"}</Button>
                  )}
                </div>
              </div>

              {/* Price (admin / sales_director / install_director) */}
              {can("edit_price") && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">{isEn ? "Estimated price" : "Prix estimé"}</div>
                    <Input type="number" defaultValue={quote.estimatedPrice ?? ""}
                      onBlur={(e) => updateMut.mutate({ estimatedPrice: parseFloat(e.target.value) || null })}
                      data-testid="input-estimated-price" />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">{isEn ? "Final price" : "Prix final"}</div>
                    <Input type="number" defaultValue={quote.finalPrice ?? ""}
                      onBlur={(e) => updateMut.mutate({ finalPrice: parseFloat(e.target.value) || null })}
                      data-testid="input-final-price" />
                  </div>
                </div>
              )}

              {/* Assign installer (install_director / admin) */}
              {can("assign_installer") && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">{isEn ? "Assign installer" : "Assigner un installateur"}</div>
                  <Select value={quote.assignedInstallerId?.toString() || ""} onValueChange={(v) => updateMut.mutate({ assignedInstallerId: Number(v) })}>
                    <SelectTrigger className="w-full max-w-md" data-testid="select-assign-installer"><SelectValue placeholder={isEn ? "Choose..." : "Choisir..."} /></SelectTrigger>
                    <SelectContent>
                      {users.filter(u => u.role === "installer").map(i => <SelectItem key={i.id} value={i.id.toString()}>{i.name} ({i.region})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Add note */}
              <div>
                <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">{isEn ? "Add activity note" : "Ajouter une note d'activité"}</div>
                <div className="flex gap-2">
                  <Input placeholder={isEn ? "Quick note..." : "Note rapide..."} value={newNote} onChange={e => setNewNote(e.target.value)} data-testid="input-new-note" />
                  <Button size="sm" disabled={!newNote.trim()} onClick={() => {
                    updateMut.mutate({ _note: newNote });
                    setNewNote("");
                  }} data-testid="button-add-note">{isEn ? "Add" : "Ajouter"}</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar : timeline + activity */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{isEn ? "Timeline" : "Timeline"}</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-2">
                {TIMELINE_STEPS.map((step) => {
                  const match = timeline.find(t => step.aliases.includes(t.step));
                  const done = !!match;
                  return (
                    <li key={step.label} className="flex items-start gap-2.5">
                      <button
                        type="button"
                        disabled={!canMarkStep(step.team)}
                        data-testid={`${done ? "button-unmark-step" : "button-mark-step"}-${stepKey(step.label)}`}
                        onClick={() => done ? unmarkStep(step) : markStep(step)}
                        className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0 border transition-colors ${done ? "bg-primary border-primary text-primary-foreground" : "bg-card border-border hover:border-primary"} ${!done && canMarkStep(step.team) ? "cursor-pointer" : "cursor-default opacity-80"}`}
                        title={done ? (isEn ? "Uncheck this step" : "Décocher cette étape") : canMarkStep(step.team) ? (isEn ? "Check this step" : "Cocher cette étape") : (isEn ? "Insufficient permission" : "Permission insuffisante")}
                      >
                        {done && <Check className="h-3 w-3" />}
                      </button>
                      <div className="min-w-0">
                        <div className={`text-[13px] ${done ? "font-medium" : "text-muted-foreground"}`}>{isEn ? step.labelEn : step.label}</div>
                        {done && (
                          <div className="text-[10px] text-muted-foreground">
                            {match?.date && new Date(match.date).toLocaleDateString(isEn ? "en-CA" : "fr-CA")}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>

          {(can("edit_sales") || can("edit_install")) && (
            <CallScriptPanel quoteId={id} isEn={isEn} />
          )}
          <CompletionPhotosPanel
            quoteId={id}
            isEn={isEn}
            canUpload={canEditInstall || isDirector}
            existingPhotos={(quote as any).completionPhotos ? JSON.parse((quote as any).completionPhotos) : []}
            onUploaded={() => queryClient.invalidateQueries({ queryKey: [`/api/quotes/${id}`] })}
          />


          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{isEn ? "Activity" : "Activité"}</CardTitle></CardHeader>
            <CardContent className="px-3">
              <ul className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {activities.map(a => (
                  <li key={a.id} className="text-[12px] border-l-2 border-primary/40 pl-2.5 py-1">
                    <div>{a.note || a.action}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{a.userName} · {formatActivityDate(a.createdAt, isEn ? "en-CA" : "fr-CA", isEn ? "Date unavailable" : "Date non disponible")}</div>
                  </li>
                ))}
                {activities.length === 0 && <li className="text-sm text-muted-foreground">{isEn ? "No activity." : "Aucune activité."}</li>}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{icon} {label}</div>
      <div className="text-[13px]">{value}</div>
    </div>
  );
}

function EditableInfo({
  icon,
  label,
  value,
  editable,
  onSave,
  type = "text",
  placeholder = "—",
  display,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  editable: boolean;
  onSave: (next: string) => void;
  type?: string;
  placeholder?: string;
  display?: string;
  suffix?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };
  if (!editable) {
    return (
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{icon} {label}</div>
        <div className="text-[13px]">{display ?? (value ? value + (suffix || "") : placeholder)}</div>
      </div>
    );
  }
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{icon} {label}</div>
      {editing ? (
        <Input
          autoFocus
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { setDraft(value); setEditing(false); }
          }}
          className="h-7 text-[13px]"
        />
      ) : (
        <button
          type="button"
          onClick={() => { setDraft(value); setEditing(true); }}
          className="text-[13px] text-left w-full hover:bg-muted/40 rounded px-1 -mx-1 py-0.5 cursor-text"
          title="Cliquer pour modifier"
        >
          {display ?? (value ? value + (suffix || "") : <span className="text-muted-foreground italic">{placeholder}</span>)}
        </button>
      )}
    </div>
  );
}

// ─── Script d'appel ──────────────────────────────────────────────────────────
function CallScriptPanel({ quoteId, isEn }: { quoteId: number; isEn: boolean }) {
  const [script, setScript] = useState<string | null>(null);
  const [source, setSource] = useState<"ai" | "template" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/call-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Erreur ${res.status}`);
      }
      const data = await res.json();
      setScript(data.script);
      setSource(data.source);
      setOpen(true);
    } catch (e: any) {
      setError(e.message || "Erreur inconnue");
      toast({ title: isEn ? "Error generating script" : "Erreur lors de la génération", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!script) return;
    navigator.clipboard.writeText(script).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Format markdown-style bold (**text**) and bullet points
  const formatScript = (text: string) => {
    return text.split("\n").map((line, i) => {
      // Section headers like **🎯 OBJECTIF**
      if (/^\*\*.*\*\*$/.test(line.trim())) {
        return (
          <div key={i} className="mt-4 first:mt-0 text-[13px] font-semibold text-foreground">
            {line.replace(/\*\*/g, "")}
          </div>
        );
      }
      // Bullet lines
      if (/^[•\-]/.test(line.trim())) {
        return (
          <div key={i} className="text-[12px] text-muted-foreground pl-3 mt-0.5">
            {line}
          </div>
        );
      }
      // Separator
      if (/^---/.test(line.trim())) {
        return <hr key={i} className="my-3 border-border" />;
      }
      // Small note
      if (/^\*⚠️/.test(line.trim())) {
        return <div key={i} className="text-[10px] text-muted-foreground italic mt-2">{line.replace(/\*/g, "")}</div>;
      }
      // Normal line
      if (!line.trim()) return <div key={i} className="h-1" />;
      return <div key={i} className="text-[12px] mt-0.5">{line}</div>;
    });
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {isEn ? "AI Call Script" : "Script d'appel IA"}
          </CardTitle>
          {script && (
            <button
              type="button"
              onClick={() => setOpen(v => !v)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {!script && (
          <p className="text-[12px] text-muted-foreground">
            {isEn
              ? "Claude analyzes this prospect's history and generates a personalized call script."
              : "Claude analyse l'historique de ce prospect et génère un script d'appel personnalisé."}
          </p>
        )}

        {error && (
          <p className="text-[12px] text-destructive">{error}</p>
        )}

        <Button
          size="sm"
          className="w-full gap-2"
          onClick={generate}
          disabled={loading}
          data-testid="button-generate-call-script"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {loading
            ? (isEn ? "Generating…" : "Génération en cours…")
            : script
              ? (isEn ? "Regenerate script" : "Régénérer le script")
              : (isEn ? "Generate call script" : "Générer le script d'appel")}
        </Button>

        {script && open && (
          <div className="space-y-1">
            <div className="flex items-center justify-between mb-2">
              {source === "ai" && (
                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                  {isEn ? "Powered by Claude AI" : "Généré par Claude IA"}
                </span>
              )}
              <button
                type="button"
                onClick={copyToClipboard}
                className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                title={isEn ? "Copy to clipboard" : "Copier"}
              >
                <Copy className="h-3 w-3" />
                {copied ? (isEn ? "Copied!" : "Copié !") : (isEn ? "Copy" : "Copier")}
              </button>
            </div>
            <div className="bg-card rounded-lg border p-3 max-h-[500px] overflow-y-auto">
              {formatScript(script)}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Script d'appel IA

function formatActivityDate(value?: string | null, locale = "fr-CA", fallback = "Date non disponible") {
  if (!value || value === "CURRENT_TIMESTAMP") return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
}

// ─── Photos de fin de chantier ────────────────────────────────────────────────

interface CompletionPhoto {
  url: string;
  uploadedAt: string;
  uploadedBy: string;
}

function CompletionPhotosPanel({
  quoteId,
  isEn,
  canUpload,
  existingPhotos,
  onUploaded,
}: {
  quoteId: number;
  isEn: boolean;
  canUpload: boolean;
  existingPhotos: CompletionPhoto[];
  onUploaded: () => void;
}) {
  const { toast } = useToast();
  const [photos, setPhotos] = useState<CompletionPhoto[]>(existingPhotos);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const compressImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 900;
        let { width, height } = img;
        if (width > MAX) { height = Math.round((height * MAX) / width); width = MAX; }
        if (height > MAX) { width = Math.round((width * MAX) / height); height = MAX; }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(objectUrl);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = reject;
      img.src = objectUrl;
    });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = 3 - photos.length;
    if (remaining <= 0) {
      toast({ title: isEn ? "Maximum 3 photos" : "Maximum 3 photos atteint", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const toUpload = Array.from(files).slice(0, remaining);
      const compressed = await Promise.all(toUpload.map(compressImage));
      const payload = compressed.map((url) => ({ url, uploadedBy: "Installateur" }));
      const res = await fetch(`/api/quotes/${quoteId}/completion-photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: payload }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPhotos(data.photos);
      onUploaded();
      toast({ title: isEn ? `${toUpload.length} photo(s) uploaded` : `${toUpload.length} photo(s) ajoutée(s)` });
    } catch (e: any) {
      toast({ title: isEn ? "Upload failed" : "Erreur d'envoi", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (idx: number) => {
    try {
      const res = await fetch(`/api/quotes/${quoteId}/completion-photos/${idx}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPhotos(data.photos);
      onUploaded();
    } catch (e: any) {
      toast({ title: isEn ? "Delete failed" : "Erreur de suppression", variant: "destructive" });
    }
  };

  if (!canUpload && photos.length === 0) return null;

  return (
    <>
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
          onClick={() => setLightbox(null)}
        >
          <button className="absolute top-4 right-4 text-white" onClick={() => setLightbox(null)}>
            <XIcon className="w-7 h-7" />
          </button>
          <img src={lightbox} alt="Photo chantier" className="max-w-[95vw] max-h-[90vh] rounded-lg object-contain" />
        </div>
      )}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Camera className="w-4 h-4 text-green-600" />
            {isEn ? "Completion photos" : "Photos de fin de chantier"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border bg-gray-50">
                  <img
                    src={p.url}
                    alt={`Photo ${i + 1}`}
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => setLightbox(p.url)}
                  />
                  <button
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setLightbox(p.url)}
                  >
                    <ZoomIn className="w-3 h-3" />
                  </button>
                  {canUpload && (
                    <button
                      className="absolute bottom-1 right-1 bg-red-600/80 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDelete(i)}
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                    {p.uploadedBy}
                  </div>
                </div>
              ))}
            </div>
          )}

          {canUpload && photos.length < 3 && (
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-lg p-4 cursor-pointer hover:border-green-400 hover:bg-green-50/30 transition-colors">
              <Camera className={`w-6 h-6 ${uploading ? "text-gray-300 animate-pulse" : "text-green-500"}`} />
              <span className="text-xs text-muted-foreground text-center">
                {uploading
                  ? (isEn ? "Uploading..." : "Envoi en cours...")
                  : (isEn
                    ? `Add photo (${3 - photos.length} remaining)`
                    : `Ajouter une photo (${3 - photos.length} restante${3 - photos.length > 1 ? "s" : ""})`)}
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                disabled={uploading}
                onChange={(e) => handleFiles(e.target.files)}
              />
            </label>
          )}

          {canUpload && photos.length === 0 && (
            <p className="text-xs text-muted-foreground text-center pb-1">
              {isEn ? "No photos yet. Tap above to capture." : "Aucune photo. Appuyez pour prendre une photo."}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

