import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useRole } from "@/lib/role-context";
import { useToast } from "@/hooks/use-toast";
import type { Crew, User } from "@shared/schema";
import { PROVINCES, ROLES } from "@shared/schema";
import { Pencil, Plus, ShieldCheck, Trash2, UsersRound, Wrench } from "lucide-react";

const PERMISSIONS_TABLE: Array<{ perm: string; admin: boolean; sdir: boolean; idir: boolean; sales: boolean; install: boolean }> = [
  { perm: "Voir toutes les soumissions", admin: true, sdir: true, idir: true, sales: false, install: false },
  { perm: "Modifier infos vente", admin: true, sdir: true, idir: false, sales: true, install: false },
  { perm: "Modifier infos installation", admin: true, sdir: false, idir: true, sales: false, install: true },
  { perm: "Modifier prix", admin: true, sdir: true, idir: true, sales: false, install: false },
  { perm: "Assigner vendeur", admin: true, sdir: true, idir: false, sales: false, install: false },
  { perm: "Assigner installateur", admin: true, sdir: false, idir: true, sales: false, install: false },
  { perm: "Mise à jour terrain (statut, photos)", admin: true, sdir: false, idir: true, sales: false, install: true },
  { perm: "Voir ses propres dossiers seulement", admin: false, sdir: false, idir: false, sales: true, install: true },
];

type UserDialogState = { mode: "create" | "edit"; user?: User } | null;
type CrewDialogState = { mode: "create" | "edit"; crew?: Crew } | null;

export function Utilisateurs() {
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: crews = [] } = useQuery<Crew[]>({ queryKey: ["/api/crews"] });
  const { role } = useRole();
  const { toast } = useToast();
  const [userDialog, setUserDialog] = useState<UserDialogState>(null);
  const [crewDialog, setCrewDialog] = useState<CrewDialogState>(null);

  const canManage = role === "admin";

  const groups = useMemo(() => {
    const grouped: Record<string, User[]> = {};
    for (const u of users) {
      if (!grouped[u.role]) grouped[u.role] = [];
      grouped[u.role].push(u);
    }
    return grouped;
  }, [users]);

  const onMutationError = (err: Error) =>
    toast({ title: "Erreur", description: err.message, variant: "destructive" });

  const createUser = useMutation({
    mutationFn: async (payload: Partial<User>) => (await apiRequest("POST", "/api/users", payload)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setUserDialog(null);
      toast({ title: "Utilisateur créé" });
    },
    onError: onMutationError,
  });

  const updateUser = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Partial<User> }) => (await apiRequest("PATCH", `/api/users/${id}`, payload)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setUserDialog(null);
      toast({ title: "Utilisateur modifié" });
    },
    onError: onMutationError,
  });

  const deleteUser = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({ title: "Utilisateur supprimé" });
    },
    onError: onMutationError,
  });

  const createCrew = useMutation({
    mutationFn: async (payload: Partial<Crew>) => (await apiRequest("POST", "/api/crews", payload)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crews"] });
      setCrewDialog(null);
      toast({ title: "Équipe créée" });
    },
    onError: onMutationError,
  });

  const updateCrew = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Partial<Crew> }) => (await apiRequest("PATCH", `/api/crews/${id}`, payload)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crews"] });
      setCrewDialog(null);
      toast({ title: "Équipe modifiée" });
    },
    onError: onMutationError,
  });

  const deleteCrew = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/crews/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({ title: "Équipe supprimée" });
    },
    onError: onMutationError,
  });

  return (
    <>
      <PageHeader
        title="Utilisateurs, rôles & entités"
        description="Créer, modifier ou supprimer les comptes internes, vendeurs, installateurs et équipes terrain."
        action={canManage && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-1.5" onClick={() => setUserDialog({ mode: "create" })} data-testid="button-create-user">
              <Plus className="h-4 w-4" /> Utilisateur
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCrewDialog({ mode: "create" })} data-testid="button-create-crew">
              <Plus className="h-4 w-4" /> Équipe
            </Button>
          </div>
        )}
      />

      <div className="p-6 lg:p-8 space-y-6">
        {!canManage && (
          <Card className="border-warning/30 bg-warning/5">
            <CardContent className="pt-5 text-sm text-muted-foreground">
              La modification, création et suppression des entités est réservée à l’admin. Les autres rôles peuvent consulter la structure.
            </CardContent>
          </Card>
        )}

        {Object.keys(ROLES).map((rk) => {
          const list = groups[rk] || [];
          return (
            <Card key={rk}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> {ROLES[rk as keyof typeof ROLES]} ({list.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {list.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Aucun utilisateur dans ce rôle.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {list.map(u => (
                      <div key={u.id} className="rounded-md border border-card-border bg-card p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-[13px]">{u.name}</div>
                            <div className="text-[11px] text-muted-foreground truncate">{u.email}</div>
                            <div className="text-[11px] text-muted-foreground">{u.phone || "Téléphone non défini"}</div>
                          </div>
                          <Badge variant={u.active ? "outline" : "secondary"} className="shrink-0 text-[10px]">{u.active ? "Actif" : "Inactif"}</Badge>
                        </div>
                        <div className="flex items-center gap-1.5 mt-2">
                          {u.region && <Badge variant="outline" className="text-[10px]">{u.region}</Badge>}
                          {u.cities && <span className="text-[10px] text-muted-foreground truncate">{formatCities(u.cities)}</span>}
                        </div>
                        {canManage && (
                          <div className="mt-3 flex gap-2">
                            <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => setUserDialog({ mode: "edit", user: u })} data-testid={`button-edit-user-${u.id}`}>
                              <Pencil className="h-3.5 w-3.5" /> Modifier
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1.5 text-destructive hover:text-destructive"
                              onClick={() => {
                                if (window.confirm(`Supprimer ${u.name}? Ses assignations seront retirées des soumissions.`)) deleteUser.mutate(u.id);
                              }}
                              data-testid={`button-delete-user-${u.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Supprimer
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" /> Équipes d’installation / sous-traitants ({crews.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {crews.map(c => (
                <div key={c.id} className="rounded-md border border-card-border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-[13px]">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground">{c.contactName || "Contact non défini"}</div>
                      <div className="text-[11px] text-muted-foreground">{c.phone || "Téléphone non défini"}</div>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px]">{c.status}</Badge>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    {c.province && <Badge variant="outline" className="text-[10px]">{c.province}</Badge>}
                    <span className="text-[10px] text-muted-foreground truncate">{formatCities(c.cities)}</span>
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground">Capacité : <span className="font-semibold text-foreground">{c.capacity || 1}/jour</span> · Type : {c.type}</div>
                  {canManage && (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => setCrewDialog({ mode: "edit", crew: c })} data-testid={`button-edit-crew-${c.id}`}>
                        <Pencil className="h-3.5 w-3.5" /> Modifier
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (window.confirm(`Supprimer l’équipe ${c.name}? Ses assignations seront retirées du calendrier.`)) deleteCrew.mutate(c.id);
                        }}
                        data-testid={`button-delete-crew-${c.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Supprimer
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><UsersRound className="h-4 w-4" /> Matrice des permissions</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 font-semibold">Permission</th>
                    <th className="py-2 px-3 font-semibold text-center">Admin</th>
                    <th className="py-2 px-3 font-semibold text-center">Dir. Ventes</th>
                    <th className="py-2 px-3 font-semibold text-center">Dir. Installation</th>
                    <th className="py-2 px-3 font-semibold text-center">Vendeur</th>
                    <th className="py-2 px-3 font-semibold text-center">Installateur</th>
                  </tr>
                </thead>
                <tbody>
                  {PERMISSIONS_TABLE.map((row, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-2 pr-3 text-[13px]">{row.perm}</td>
                      <td className="py-2 px-3 text-center">{row.admin ? "✓" : "—"}</td>
                      <td className="py-2 px-3 text-center">{row.sdir ? "✓" : "—"}</td>
                      <td className="py-2 px-3 text-center">{row.idir ? "✓" : "—"}</td>
                      <td className="py-2 px-3 text-center">{row.sales ? "✓" : "—"}</td>
                      <td className="py-2 px-3 text-center">{row.install ? "✓" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!userDialog} onOpenChange={(open) => !open && setUserDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{userDialog?.mode === "edit" ? "Modifier l’utilisateur" : "Créer un utilisateur"}</DialogTitle>
            <DialogDescription>Compte CRM avec rôle, région, villes et statut actif.</DialogDescription>
          </DialogHeader>
          {userDialog && (
            <UserForm
              user={userDialog.user}
              isPending={createUser.isPending || updateUser.isPending}
              onCancel={() => setUserDialog(null)}
              onSubmit={(payload) => userDialog.mode === "edit" && userDialog.user ? updateUser.mutate({ id: userDialog.user.id, payload }) : createUser.mutate(payload)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!crewDialog} onOpenChange={(open) => !open && setCrewDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{crewDialog?.mode === "edit" ? "Modifier l’équipe" : "Créer une équipe"}</DialogTitle>
            <DialogDescription>Équipe interne ou sous-traitant disponible pour les installations.</DialogDescription>
          </DialogHeader>
          {crewDialog && (
            <CrewForm
              crew={crewDialog.crew}
              isPending={createCrew.isPending || updateCrew.isPending}
              onCancel={() => setCrewDialog(null)}
              onSubmit={(payload) => crewDialog.mode === "edit" && crewDialog.crew ? updateCrew.mutate({ id: crewDialog.crew.id, payload }) : createCrew.mutate(payload)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function UserForm({ user, isPending, onCancel, onSubmit }: { user?: User; isPending: boolean; onCancel: () => void; onSubmit: (payload: Partial<User>) => void }) {
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [role, setRole] = useState(user?.role || "sales_rep");
  const [region, setRegion] = useState(user?.region || "Canada");
  const [phone, setPhone] = useState(user?.phone || "");
  const [active, setActive] = useState(user?.active === false ? "false" : "true");
  const [cities, setCities] = useState(citiesText(user?.cities));

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      email: email.trim(),
      role,
      region: region || null,
      cities: citiesJson(cities),
      phone: phone.trim() || null,
      active: active === "true",
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Nom"><Input required value={name} onChange={e => setName(e.target.value)} data-testid="input-user-name" /></Field>
        <Field label="Courriel"><Input type="email" required value={email} onChange={e => setEmail(e.target.value)} data-testid="input-user-email" /></Field>
        <Field label="Rôle">
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger data-testid="select-user-role"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(ROLES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Province / région">
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger data-testid="select-user-region"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Canada">Canada</SelectItem>
              {PROVINCES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Téléphone"><Input value={phone} onChange={e => setPhone(e.target.value)} data-testid="input-user-phone" /></Field>
        <Field label="Statut">
          <Select value={active} onValueChange={setActive}>
            <SelectTrigger data-testid="select-user-active"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Actif</SelectItem>
              <SelectItem value="false">Inactif</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Villes couvertes, séparées par des virgules">
        <Textarea rows={2} value={cities} onChange={e => setCities(e.target.value)} placeholder="Montréal, Laval, Longueuil" data-testid="textarea-user-cities" />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Annuler</Button>
        <Button type="submit" disabled={isPending} data-testid="button-save-user">Enregistrer</Button>
      </div>
    </form>
  );
}

function CrewForm({ crew, isPending, onCancel, onSubmit }: { crew?: Crew; isPending: boolean; onCancel: () => void; onSubmit: (payload: Partial<Crew>) => void }) {
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onSubmit({
      name: String(form.get("name") || "").trim(),
      type: String(form.get("type") || "sous-traitant"),
      contactName: nullable(form.get("contactName")),
      phone: nullable(form.get("phone")),
      email: nullable(form.get("email")),
      province: nullable(form.get("province")),
      cities: citiesJson(form.get("cities")),
      capacity: Number(form.get("capacity") || 1),
      rating: Number(form.get("rating") || 5),
      status: String(form.get("status") || "disponible"),
      notes: nullable(form.get("notes")),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Nom de l’équipe"><Input name="name" required defaultValue={crew?.name || ""} data-testid="input-crew-name" /></Field>
        <Field label="Type">
          <Select name="type" defaultValue={crew?.type || "sous-traitant"}>
            <SelectTrigger data-testid="select-crew-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="interne">Interne</SelectItem>
              <SelectItem value="sous-traitant">Sous-traitant</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Contact"><Input name="contactName" defaultValue={crew?.contactName || ""} data-testid="input-crew-contact" /></Field>
        <Field label="Téléphone"><Input name="phone" defaultValue={crew?.phone || ""} data-testid="input-crew-phone" /></Field>
        <Field label="Courriel"><Input name="email" type="email" defaultValue={crew?.email || ""} data-testid="input-crew-email" /></Field>
        <Field label="Province">
          <Select name="province" defaultValue={crew?.province || "QC"}>
            <SelectTrigger data-testid="select-crew-province"><SelectValue /></SelectTrigger>
            <SelectContent>{PROVINCES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Capacité / jour"><Input name="capacity" type="number" min={1} defaultValue={crew?.capacity || 1} data-testid="input-crew-capacity" /></Field>
        <Field label="Statut">
          <Select name="status" defaultValue={crew?.status || "disponible"}>
            <SelectTrigger data-testid="select-crew-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="disponible">Disponible</SelectItem>
              <SelectItem value="occupe">Occupé</SelectItem>
              <SelectItem value="indisponible">Indisponible</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Villes couvertes, séparées par des virgules">
        <Textarea name="cities" rows={2} defaultValue={citiesText(crew?.cities)} placeholder="Québec, Lévis, Saguenay" data-testid="textarea-crew-cities" />
      </Field>
      <Field label="Notes">
        <Textarea name="notes" rows={2} defaultValue={crew?.notes || ""} data-testid="textarea-crew-notes" />
      </Field>
      <input type="hidden" name="rating" value={crew?.rating || 5} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Annuler</Button>
        <Button type="submit" disabled={isPending} data-testid="button-save-crew">Enregistrer</Button>
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

function formatCities(value?: string | null) {
  const cities = parseCities(value);
  return cities.length ? cities.join(", ") : "Aucune ville définie";
}

function citiesText(value?: string | null) {
  return parseCities(value).join(", ");
}

function citiesJson(value: FormDataEntryValue | null) {
  const cities = String(value || "").split(",").map(v => v.trim()).filter(Boolean);
  return cities.length ? JSON.stringify(cities) : null;
}

function parseCities(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value.split(",").map(v => v.trim()).filter(Boolean);
  }
}

function nullable(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  return text || null;
}
