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
import { useLanguage } from "@/lib/language-context";
import { useToast } from "@/hooks/use-toast";
import type { Crew, User } from "@shared/schema";
import { PROVINCES, ROLES } from "@shared/schema";
import { FileText, Mail, Pencil, Plus, ShieldCheck, Trash2, UsersRound, Wrench } from "lucide-react";

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

const PERMISSIONS_TABLE_EN: Array<{ perm: string; admin: boolean; sdir: boolean; idir: boolean; sales: boolean; install: boolean }> = [
  { perm: "View all quotes", admin: true, sdir: true, idir: true, sales: false, install: false },
  { perm: "Edit sales information", admin: true, sdir: true, idir: false, sales: true, install: false },
  { perm: "Edit installation information", admin: true, sdir: false, idir: true, sales: false, install: true },
  { perm: "Edit prices", admin: true, sdir: true, idir: true, sales: false, install: false },
  { perm: "Assign sales rep", admin: true, sdir: true, idir: false, sales: false, install: false },
  { perm: "Assign installer", admin: true, sdir: false, idir: true, sales: false, install: false },
  { perm: "Field update (status, photos)", admin: true, sdir: false, idir: true, sales: false, install: true },
  { perm: "View own files only", admin: false, sdir: false, idir: false, sales: true, install: true },
];

const ROLE_LABELS_EN: Record<string, string> = {
  admin: "Administrator",
  sales_director: "Sales Director",
  install_director: "Installation Director",
  sales_rep: "Sales Rep",
  installer: "Installer",
};

type UserDialogState = { mode: "create" | "edit"; user?: User } | null;
type CrewDialogState = { mode: "create" | "edit"; crew?: Crew } | null;

type SmsCarrier = "bell" | "bell_mts" | "fido" | "koodo" | "telus" | "public_mobile" | "pc_mobile" | "sasktel";

const SMS_CARRIER_LABELS: Array<{ value: SmsCarrier; label: string; hint: string }> = [
  { value: "bell", label: "Bell Canada", hint: "txt.bell.ca" },
  { value: "bell_mts", label: "Bell MTS", hint: "text.mts.net" },
  { value: "fido", label: "Fido", hint: "fido.ca" },
  { value: "koodo", label: "Koodo", hint: "msg.telus.com" },
  { value: "telus", label: "TELUS", hint: "msg.telus.com" },
  { value: "public_mobile", label: "Public Mobile", hint: "msg.telus.com" },
  { value: "pc_mobile", label: "PC Mobile", hint: "mobiletxt.ca" },
  { value: "sasktel", label: "SaskTel", hint: "sms.sasktel.com" },
];

function getCarrierLabel(carrier: string | null | undefined): string | null {
  if (!carrier) return null;
  const match = SMS_CARRIER_LABELS.find(c => c.value === carrier);
  return match ? match.label : null;
}

export function Utilisateurs() {
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: crews = [] } = useQuery<Crew[]>({ queryKey: ["/api/crews"] });
  const { role } = useRole();
  const { language } = useLanguage();
  const isEn = language === "en";
  const { toast } = useToast();
  const [userDialog, setUserDialog] = useState<UserDialogState>(null);
  const [crewDialog, setCrewDialog] = useState<CrewDialogState>(null);
  const [viewFormUserId, setViewFormUserId] = useState<number | null>(null);
  const [inviteResult, setInviteResult] = useState<null | {
    email: string;
    phone?: string;
    name: string;
    inviteUrl: string;
    emailSent: boolean;
    emailError?: string;
    smsSent: boolean;
    smsError?: string;
  }>(null);

  const canManage = role === "admin";
  const canManageInstallerForms = role === "admin" || role === "sales_director" || role === "install_director";
  const permissionRows = isEn ? PERMISSIONS_TABLE_EN : PERMISSIONS_TABLE;

  const groups = useMemo(() => {
    const grouped: Record<string, User[]> = {};
    for (const u of users) {
      if (!grouped[u.role]) grouped[u.role] = [];
      grouped[u.role].push(u);
    }
    return grouped;
  }, [users]);

  const onMutationError = (err: Error) =>
    toast({ title: isEn ? "Error" : "Erreur", description: err.message, variant: "destructive" });

  const createUser = useMutation({
    mutationFn: async (payload: Partial<User>) => (await apiRequest("POST", "/api/users", payload)).json(),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/installer-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setUserDialog(null);
      if (data?.inviteUrl) {
        setInviteResult({
          email: data.email,
          phone: data.phone,
          name: data.name,
          inviteUrl: data.inviteUrl,
          emailSent: !!data.emailSent,
          emailError: data.emailError,
          smsSent: !!data.smsSent,
          smsError: data.smsError,
        });
      } else {
        toast({ title: isEn ? "User created" : "Utilisateur créé" });
      }
    },
    onError: onMutationError,
  });

  const updateUser = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Partial<User> }) => (await apiRequest("PATCH", `/api/users/${id}`, payload)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/installer-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setUserDialog(null);
      toast({ title: isEn ? "User updated" : "Utilisateur modifié" });
    },
    onError: onMutationError,
  });

  const deleteUser = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/installer-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: isEn ? "User deleted" : "Utilisateur supprimé" });
    },
    onError: onMutationError,
  });

  const resendInvite = useMutation({
    mutationFn: async (id: number) => (await apiRequest("POST", `/api/users/${id}/resend-invite`, {})).json(),
    onSuccess: (data: any, id) => {
      const u = users.find(x => x.id === id);
      if (data?.inviteUrl && u) {
        setInviteResult({
          email: u.email,
          phone: u.phone || undefined,
          name: u.name,
          inviteUrl: data.inviteUrl,
          emailSent: !!data.emailSent,
          emailError: data.emailError,
          smsSent: !!data.smsSent,
          smsError: data.smsError,
        });
      } else {
        toast({ title: isEn ? "Invitation resent" : "Invitation renvoyée" });
      }
    },
    onError: onMutationError,
  });

  const resendInstallerForm = useMutation({
    mutationFn: async (id: number) => (await apiRequest("POST", `/api/users/${id}/resend-installer-form`, {})).json(),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      const channels: string[] = [];
      if (data?.emailSent) channels.push(isEn ? "email" : "courriel");
      if (data?.smsSent) channels.push("SMS");
      const sentText = channels.length > 0 ? channels.join(" + ") : (isEn ? "no channel" : "aucun canal");
      toast({
        title: isEn ? "Form reminder sent" : "Rappel de fiche envoye",
        description: isEn ? `Delivery: ${sentText}` : `Envoi: ${sentText}`,
      });
    },
    onError: onMutationError,
  });

  const setInstallerFormStatus = useMutation({
    mutationFn: async ({ id, completed }: { id: number; completed: boolean }) =>
      (await apiRequest("PATCH", `/api/users/${id}/installer-profile-status`, { completed })).json(),
    onSuccess: (_data: any, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({
        title: vars.completed
          ? (isEn ? "Form marked as completed" : "Fiche marquee comme completee")
          : (isEn ? "Form marked as not completed" : "Fiche marquee non completee"),
      });
    },
    onError: onMutationError,
  });

  const createCrew = useMutation({
    mutationFn: async (payload: Partial<Crew>) => (await apiRequest("POST", "/api/crews", payload)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crews"] });
      setCrewDialog(null);
      toast({ title: isEn ? "Crew created" : "Équipe créée" });
    },
    onError: onMutationError,
  });

  const updateCrew = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Partial<Crew> }) => (await apiRequest("PATCH", `/api/crews/${id}`, payload)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crews"] });
      setCrewDialog(null);
      toast({ title: isEn ? "Crew updated" : "Équipe modifiée" });
    },
    onError: onMutationError,
  });

  const deleteCrew = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/crews/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({ title: isEn ? "Crew deleted" : "Équipe supprimée" });
    },
    onError: onMutationError,
  });

  return (
    <>
      <PageHeader
        title={isEn ? "Users, roles & entities" : "Utilisateurs, rôles & entités"}
        description={isEn ? "Create, edit or delete internal accounts, sales reps, installers and field crews." : "Créer, modifier ou supprimer les comptes internes, vendeurs, installateurs et équipes terrain."}
        action={canManage && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-1.5" onClick={() => setUserDialog({ mode: "create" })} data-testid="button-create-user">
              <Plus className="h-4 w-4" /> {isEn ? "User" : "Utilisateur"}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCrewDialog({ mode: "create" })} data-testid="button-create-crew">
              <Plus className="h-4 w-4" /> {isEn ? "Crew" : "Équipe"}
            </Button>
          </div>
        )}
      />

      <div className="p-6 lg:p-8 space-y-6">
        {!canManage && (
          <Card className="border-warning/30 bg-warning/5">
            <CardContent className="pt-5 text-sm text-muted-foreground">
              {isEn ? "Entity creation, update and deletion are restricted to admin. Other roles can view the structure." : "La modification, création et suppression des entités est réservée à l’admin. Les autres rôles peuvent consulter la structure."}
            </CardContent>
          </Card>
        )}

        {Object.keys(ROLES).map((rk) => {
          const list = groups[rk] || [];
          return (
            <Card key={rk}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> {isEn ? (ROLE_LABELS_EN[rk] || ROLES[rk as keyof typeof ROLES]) : ROLES[rk as keyof typeof ROLES]} ({list.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {list.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">{isEn ? "No users in this role." : "Aucun utilisateur dans ce rôle."}</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {list.map(u => {
                      const accountCompleted = (u as any).mustChangePassword === false;
                      const installerProfileCompleted = (u as any).installerProfileCompleted === true;
                      const installerFormPending = u.role === "installer" && !installerProfileCompleted;
                      return (
                      <div key={u.id} className="rounded-md border border-card-border bg-card p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div
                              className={`font-semibold text-[13px]${u.role === "installer" && canManageInstallerForms ? " cursor-pointer text-primary hover:underline" : ""}`}
                              onClick={() => { if (u.role === "installer" && canManageInstallerForms) setViewFormUserId(u.id); }}
                            >{u.name}</div>
                            <div className="text-[11px] text-muted-foreground truncate">{u.email}</div>
                            <div className="text-[11px] text-muted-foreground">{u.phone || (isEn ? "Phone not set" : "Téléphone non défini")}</div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge variant={u.active ? "outline" : "secondary"} className="text-[10px]">{u.active ? (isEn ? "Active" : "Actif") : (isEn ? "Inactive" : "Inactif")}</Badge>
                            {installerFormPending ? (
                              <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-900 hover:bg-amber-100">📝 {isEn ? "Form not completed" : "Fiche non completee"}</Badge>
                            ) : accountCompleted ? (
                              <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600 text-white">✓ {isEn ? "Account completed" : "Compte complété"}</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-900 hover:bg-amber-100">⏳ {isEn ? "Pending" : "En attente"}</Badge>
                            )}
                            {getCarrierLabel((u as any).smsCarrier) && (
                              <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-200">📱 {getCarrierLabel((u as any).smsCarrier)}</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 mt-2">
                          {u.region && <Badge variant="outline" className="text-[10px]">{u.region}</Badge>}
                          {u.cities && <span className="text-[10px] text-muted-foreground truncate">{formatCities(u.cities, isEn)}</span>}
                        </div>
                        {(canManage || canManageInstallerForms) && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {canManage && (
                              <>
                                <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => setUserDialog({ mode: "edit", user: u })} data-testid={`button-edit-user-${u.id}`}>
                                  <Pencil className="h-3.5 w-3.5" /> {isEn ? "Edit" : "Modifier"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1.5"
                                  disabled={resendInvite.isPending}
                                  onClick={() => resendInvite.mutate(u.id)}
                                  data-testid={`button-resend-invite-${u.id}`}
                                >
                                  <Mail className="h-3.5 w-3.5" /> {isEn ? "Resend invitation" : "Renvoyer l'invitation"}
                                </Button>
                              </>
                            )}
                            {canManageInstallerForms && installerFormPending && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1.5"
                                disabled={resendInstallerForm.isPending}
                                onClick={() => resendInstallerForm.mutate(u.id)}
                                data-testid={`button-resend-installer-form-${u.id}`}
                              >
                                <Mail className="h-3.5 w-3.5" /> {isEn ? "Resend form" : "Renvoyer la fiche"}
                              </Button>
                            )}
                            {canManageInstallerForms && u.role === "installer" && installerProfileCompleted && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1.5"
                                disabled={setInstallerFormStatus.isPending}
                                onClick={() => setInstallerFormStatus.mutate({ id: u.id, completed: false })}
                                data-testid={`button-mark-installer-form-not-complete-${u.id}`}
                              >
                                {isEn ? "Mark form not completed" : "Marquer fiche non completee"}
                              </Button>
                            )}
                            {canManageInstallerForms && installerFormPending && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1.5"
                                disabled={setInstallerFormStatus.isPending}
                                onClick={() => setInstallerFormStatus.mutate({ id: u.id, completed: true })}
                                data-testid={`button-mark-installer-form-complete-${u.id}`}
                              >
                                {isEn ? "Mark form completed" : "Marquer fiche completee"}
                              </Button>
                            )}
                            {canManage && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1.5 text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (window.confirm(isEn ? `Delete ${u.name}? Assignments will be removed from quotes.` : `Supprimer ${u.name}? Ses assignations seront retirées des soumissions.`)) deleteUser.mutate(u.id);
                                }}
                                data-testid={`button-delete-user-${u.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> {isEn ? "Delete" : "Supprimer"}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {canManage && <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><UsersRound className="h-4 w-4" /> {isEn ? "Permissions matrix" : "Matrice des permissions"}</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 font-semibold">{isEn ? "Permission" : "Permission"}</th>
                    <th className="py-2 px-3 font-semibold text-center">Admin</th>
                    <th className="py-2 px-3 font-semibold text-center">{isEn ? "Sales Dir." : "Dir. Ventes"}</th>
                    <th className="py-2 px-3 font-semibold text-center">{isEn ? "Install Dir." : "Dir. Installation"}</th>
                    <th className="py-2 px-3 font-semibold text-center">{isEn ? "Sales rep" : "Vendeur"}</th>
                    <th className="py-2 px-3 font-semibold text-center">{isEn ? "Installer" : "Installateur"}</th>
                  </tr>
                </thead>
                <tbody>
                  {permissionRows.map((row, i) => (
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
        </Card>}
      </div>

      <Dialog open={!!userDialog} onOpenChange={(open) => !open && setUserDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{userDialog?.mode === "edit" ? (isEn ? "Edit user" : "Modifier l’utilisateur") : (isEn ? "Create user" : "Créer un utilisateur")}</DialogTitle>
            <DialogDescription>{isEn ? "CRM account with role, region, cities and active status." : "Compte CRM avec rôle, région, villes et statut actif."}</DialogDescription>
          </DialogHeader>
          {userDialog && (
            <UserForm
              user={userDialog.user}
              isEn={isEn}
              isPending={createUser.isPending || updateUser.isPending}
              onCancel={() => setUserDialog(null)}
              onSubmit={(payload) => userDialog.mode === "edit" && userDialog.user ? updateUser.mutate({ id: userDialog.user.id, payload }) : createUser.mutate(payload)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!inviteResult} onOpenChange={(open) => !open && setInviteResult(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{isEn ? "Invitation link for" : "Lien d'invitation pour"} {inviteResult?.name}</DialogTitle>
            <DialogDescription>
              {isEn ? "Automatic sending triggered on 2 channels: email + SMS." : "Envoi automatique déclenché sur les 2 canaux: email + SMS."}
            </DialogDescription>
          </DialogHeader>
          {inviteResult && (
            <div className="space-y-3">
              <div className="rounded-md border border-border p-3 text-[13px] space-y-1">
                <p>Email ({inviteResult.email}) : {inviteResult.emailSent ? (isEn ? "sent" : "envoyé") : (isEn ? "failed" : "échec")}</p>
                <p>SMS ({inviteResult.phone || (isEn ? "phone not set" : "numéro non défini")}) : {inviteResult.smsSent ? (isEn ? "sent" : "envoyé") : (isEn ? "failed" : "échec")}</p>
              </div>
              <div className="rounded-md border border-border bg-muted/50 p-3 break-all text-[13px] font-mono select-all">
                {inviteResult.inviteUrl}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteResult.inviteUrl);
                    toast({ title: isEn ? "Link copied to clipboard" : "Lien copié dans le presse-papiers" });
                  }}
                >
                  📋 {isEn ? "Copy link" : "Copier le lien"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const subject = encodeURIComponent(isEn ? "Your access to Cloture Impress CRM" : "Ton accès au CRM Clôture Impress");
                    const body = encodeURIComponent(isEn
                      ? `Hello ${inviteResult.name},\n\nHere is your link to create your password and access Cloture Impress CRM:\n\n${inviteResult.inviteUrl}\n\nThis link is valid for 7 days.\n\nThank you!`
                      : `Bonjour ${inviteResult.name},\n\nVoici le lien pour créer ton mot de passe et accéder au CRM Clôture Impress :\n\n${inviteResult.inviteUrl}\n\nCe lien est valide 7 jours.\n\nMerci !`);
                    window.location.href = `mailto:${inviteResult.email}?subject=${subject}&body=${body}`;
                  }}
                >
                  ✉️ {isEn ? "Send manually by email" : "Envoyer par courriel manuellement"}
                </Button>
              </div>
              {inviteResult.emailError && <p className="text-[12px] text-muted-foreground">{isEn ? "Email error" : "Erreur email"} : {inviteResult.emailError}</p>}
              {inviteResult.smsError && <p className="text-[12px] text-muted-foreground">{isEn ? "SMS error" : "Erreur SMS"} : {inviteResult.smsError}</p>}
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setInviteResult(null)}>{isEn ? "Close" : "Fermer"}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!crewDialog} onOpenChange={(open) => !open && setCrewDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{crewDialog?.mode === "edit" ? (isEn ? "Edit crew" : "Modifier l’équipe") : (isEn ? "Create crew" : "Créer une équipe")}</DialogTitle>
            <DialogDescription>{isEn ? "Internal crew or subcontractor available for installations." : "Équipe interne ou sous-traitant disponible pour les installations."}</DialogDescription>
          </DialogHeader>
          {crewDialog && (
            <CrewForm
              crew={crewDialog.crew}
              isEn={isEn}
              isPending={createCrew.isPending || updateCrew.isPending}
              onCancel={() => setCrewDialog(null)}
              onSubmit={(payload) => crewDialog.mode === "edit" && crewDialog.crew ? updateCrew.mutate({ id: crewDialog.crew.id, payload }) : createCrew.mutate(payload)}
            />
          )}
        </DialogContent>
      </Dialog>

      {viewFormUserId !== null && (
        <InstallerFormDialog
          userId={viewFormUserId}
          userName={users.find(u => u.id === viewFormUserId)?.name || ""}
          isEn={isEn}
          canEdit={canManage}
          onClose={() => setViewFormUserId(null)}
        />
      )}
    </>
  );
}

// ── InstallerFormDialog ───────────────────────────────────────────────────────

const FORM_FIELDS: Array<{ key: string; label: string; labelEn: string; section: string }> = [
  { key: "field_0", label: "Nom légal de l'entreprise", labelEn: "Legal company name", section: "1" },
  { key: "field_1", label: "Nom commercial", labelEn: "Trade name", section: "1" },
  { key: "field_2", label: "Nom du responsable", labelEn: "Contact name", section: "1" },
  { key: "field_3", label: "Courriel", labelEn: "Email", section: "1" },
  { key: "field_4", label: "Téléphone principal", labelEn: "Main phone", section: "1" },
  { key: "field_5", label: "Téléphone secondaire", labelEn: "Secondary phone", section: "1" },
  { key: "field_6", label: "Adresse complète", labelEn: "Full address", section: "1" },
  { key: "field_7", label: "Ville", labelEn: "City", section: "1" },
  { key: "field_8", label: "Province", labelEn: "Province", section: "1" },
  { key: "field_9", label: "Code postal", labelEn: "Postal code", section: "1" },
  { key: "field_10", label: "NEQ / Numéro d'entreprise", labelEn: "Business number (NEQ)", section: "1" },
  { key: "field_11", label: "Site web", labelEn: "Website", section: "1" },
  { key: "field_12", label: "Régions desservies", labelEn: "Service regions", section: "2" },
  { key: "field_13", label: "Rayon à partir du code postal", labelEn: "Radius from postal code", section: "2" },
  { key: "field_14", label: "Code postal de départ (heatmap)", labelEn: "Starting postal code (heatmap)", section: "2" },
  { key: "field_15", label: "Disponible hors région : Oui", labelEn: "Available outside region: Yes", section: "2" },
  { key: "field_16", label: "Disponible hors région : Non", labelEn: "Available outside region: No", section: "2" },
  { key: "field_17", label: "Province : Québec", labelEn: "Province: Quebec", section: "2" },
  { key: "field_18", label: "Province : Ontario", labelEn: "Province: Ontario", section: "2" },
  { key: "field_19", label: "Province : Alberta", labelEn: "Province: Alberta", section: "2" },
  { key: "field_20", label: "Province : Colombie-Britannique", labelEn: "Province: British Columbia", section: "2" },
  { key: "field_21", label: "Province : Autres", labelEn: "Province: Other", section: "2" },
];

const SECTION_LABELS: Record<string, { fr: string; en: string }> = {
  "1": { fr: "1. Informations générales", en: "1. General information" },
  "2": { fr: "2. Territoire desservi et secteur heatmap", en: "2. Service territory & heatmap sector" },
};

function InstallerFormDialog({ userId, userName, isEn, canEdit, onClose }: { userId: number; userName: string; isEn: boolean; canEdit: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ data: Record<string, string | boolean> | null }>({
    queryKey: [`/api/users/${userId}/installer-form-data`],
    enabled: userId > 0,
  });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});

  const formData = data?.data || null;
  const sections = [...new Set(FORM_FIELDS.map(f => f.section))];

  function startEdit() {
    setDraft({ ...(formData || {}) });
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft({});
  }

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, string | boolean>) =>
      (await apiRequest("PUT", `/api/users/${userId}/installer-form-data`, { data })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/installer-form-data`] });
      queryClient.invalidateQueries({ queryKey: ["/api/installer-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setEditing(false);
      setDraft({});
      toast({ title: isEn ? "Form saved" : "Fiche enregistrée" });
    },
    onError: () => {
      toast({ title: isEn ? "Save failed" : "Échec de la sauvegarde", variant: "destructive" });
    },
  });

  function renderViewField(field: typeof FORM_FIELDS[0]) {
    if (!formData) return null;
    const val = formData[field.key];
    if (val === undefined || val === null || val === "") return null;
    const display = typeof val === "boolean" ? (val ? "✓" : null) : String(val);
    if (!display) return null;
    return (
      <div key={field.key} className="flex flex-col">
        <span className="text-[11px] text-muted-foreground">{isEn ? field.labelEn : field.label}</span>
        <span className="text-[13px] font-medium">{display}</span>
      </div>
    );
  }

  function renderEditField(field: typeof FORM_FIELDS[0]) {
    const isBool = field.key === "field_15" || field.key === "field_16" ||
      (field.key >= "field_17" && field.key <= "field_21");
    const label = isEn ? field.labelEn : field.label;
    if (isBool) {
      return (
        <div key={field.key} className="flex items-center gap-2">
          <input
            type="checkbox"
            id={`edit-${field.key}`}
            checked={!!draft[field.key]}
            onChange={e => setDraft(prev => ({ ...prev, [field.key]: e.target.checked }))}
            className="h-4 w-4 cursor-pointer"
          />
          <label htmlFor={`edit-${field.key}`} className="text-[13px] cursor-pointer">{label}</label>
        </div>
      );
    }
    // Radius select
    if (field.key === "field_13") {
      const options = ["25 km","50 km","75 km","100 km","125 km","150 km","175 km","200 km","300 km","400 km","500 km"];
      return (
        <div key={field.key} className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground">{label}</label>
          <Select value={String(draft[field.key] || "")} onValueChange={v => setDraft(prev => ({ ...prev, [field.key]: v }))}>
            <SelectTrigger className="h-8 text-[13px]"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      );
    }
    return (
      <div key={field.key} className="flex flex-col gap-1">
        <label className="text-[11px] text-muted-foreground">{label}</label>
        <Input
          className="h-8 text-[13px]"
          value={String(draft[field.key] ?? "")}
          onChange={e => setDraft(prev => ({ ...prev, [field.key]: e.target.value }))}
        />
      </div>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {isEn ? "Subcontractor form — " : "Fiche sous-traitant — "}{userName}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? (isEn ? "Edit the form data on behalf of the installer." : "Modifier les données de la fiche au nom de l'installateur.")
              : (isEn ? "Data saved by the installer from their subcontractor form." : "Données enregistrées par l'installateur via sa fiche sous-traitant.")}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{isEn ? "Loading..." : "Chargement..."}</div>
        ) : editing ? (
          <div className="space-y-5">
            {sections.map(sec => {
              const fields = FORM_FIELDS.filter(f => f.section === sec);
              const sectionLabel = SECTION_LABELS[sec] ? (isEn ? SECTION_LABELS[sec].en : SECTION_LABELS[sec].fr) : `Section ${sec}`;
              const boolFields = fields.filter(f => ["field_15","field_16","field_17","field_18","field_19","field_20","field_21"].includes(f.key));
              const textFields = fields.filter(f => !["field_15","field_16","field_17","field_18","field_19","field_20","field_21"].includes(f.key));
              return (
                <div key={sec}>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 border-b border-border pb-1">{sectionLabel}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                    {textFields.map(f => renderEditField(f))}
                  </div>
                  {boolFields.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                      {boolFields.map(f => renderEditField(f))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : !formData ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {isEn ? "No form data saved yet." : "Aucune donnée de fiche enregistrée."}
            {canEdit && <div className="mt-3"><Button size="sm" onClick={() => { setDraft({}); setEditing(true); }}>{isEn ? "Fill in form" : "Remplir la fiche"}</Button></div>}
          </div>
        ) : (
          <div className="space-y-4">
            {sections.map(sec => {
              const fields = FORM_FIELDS.filter(f => f.section === sec);
              const sectionLabel = SECTION_LABELS[sec] ? (isEn ? SECTION_LABELS[sec].en : SECTION_LABELS[sec].fr) : `Section ${sec}`;
              const rendered = fields.map(f => renderViewField(f)).filter(Boolean);
              if (rendered.length === 0) return null;
              return (
                <div key={sec}>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 border-b border-border pb-1">{sectionLabel}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">{rendered}</div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-between pt-2 gap-2">
          <div>
            {canEdit && !editing && !isLoading && formData && (
              <Button size="sm" variant="outline" onClick={startEdit}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />{isEn ? "Edit" : "Modifier"}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {editing ? (
              <>
                <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saveMutation.isPending}>
                  {isEn ? "Cancel" : "Annuler"}
                </Button>
                <Button size="sm" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate(draft)}>
                  {saveMutation.isPending ? (isEn ? "Saving..." : "Enregistrement...") : (isEn ? "Save" : "Enregistrer")}
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={onClose}>{isEn ? "Close" : "Fermer"}</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UserForm({ user, isEn, isPending, onCancel, onSubmit }: { user?: User; isEn: boolean; isPending: boolean; onCancel: () => void; onSubmit: (payload: Partial<User>) => void }) {
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [role, setRole] = useState(user?.role || "sales_rep");
  const [region, setRegion] = useState(user?.region || "Canada");
  const [phone, setPhone] = useState(user?.phone || "");
  const [smsCarrier, setSmsCarrier] = useState((user as any)?.smsCarrier || "__none__");
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
      smsCarrier: smsCarrier === "__none__" ? null : smsCarrier,
      active: active === "true",
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={isEn ? "Name" : "Nom"}><Input required value={name} onChange={e => setName(e.target.value)} data-testid="input-user-name" /></Field>
        <Field label={isEn ? "Email" : "Courriel"}><Input type="email" required value={email} onChange={e => setEmail(e.target.value)} data-testid="input-user-email" /></Field>
        <Field label={isEn ? "Role" : "Rôle"}>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger data-testid="select-user-role"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(ROLES).map(([k, v]) => <SelectItem key={k} value={k}>{isEn ? (ROLE_LABELS_EN[k] || v) : v}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label={isEn ? "Province / region" : "Province / région"}>
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger data-testid="select-user-region"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Canada">Canada</SelectItem>
              {PROVINCES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label={isEn ? "Phone" : "Téléphone"}><Input value={phone} onChange={e => setPhone(e.target.value)} data-testid="input-user-phone" /></Field>
        <Field label={isEn ? "Mobile carrier (free SMS)" : "Transporteur mobile (SMS gratuit)"}>
          <Select value={smsCarrier} onValueChange={setSmsCarrier}>
            <SelectTrigger data-testid="select-user-sms-carrier"><SelectValue placeholder={isEn ? "Choose carrier" : "Choisir le transporteur"} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{isEn ? "None" : "Aucun"}</SelectItem>
              {SMS_CARRIER_LABELS.map((carrier) => (
                <SelectItem key={carrier.value} value={carrier.value}>{carrier.label} · {carrier.hint}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={isEn ? "Status" : "Statut"}>
          <Select value={active} onValueChange={setActive}>
            <SelectTrigger data-testid="select-user-active"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="true">{isEn ? "Active" : "Actif"}</SelectItem>
              <SelectItem value="false">{isEn ? "Inactive" : "Inactif"}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label={isEn ? "Covered cities, comma separated" : "Villes couvertes, séparées par des virgules"}>
        <Textarea rows={2} value={cities} onChange={e => setCities(e.target.value)} placeholder={isEn ? "Montreal, Laval, Longueuil" : "Montréal, Laval, Longueuil"} data-testid="textarea-user-cities" />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>{isEn ? "Cancel" : "Annuler"}</Button>
        <Button type="submit" disabled={isPending} data-testid="button-save-user">{isEn ? "Save" : "Enregistrer"}</Button>
      </div>
    </form>
  );
}

function CrewForm({ crew, isEn, isPending, onCancel, onSubmit }: { crew?: Crew; isEn: boolean; isPending: boolean; onCancel: () => void; onSubmit: (payload: Partial<Crew>) => void }) {
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
        <Field label={isEn ? "Crew name" : "Nom de l’équipe"}><Input name="name" required defaultValue={crew?.name || ""} data-testid="input-crew-name" /></Field>
        <Field label={isEn ? "Type" : "Type"}>
          <Select name="type" defaultValue={crew?.type || "sous-traitant"}>
            <SelectTrigger data-testid="select-crew-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="interne">{isEn ? "Internal" : "Interne"}</SelectItem>
              <SelectItem value="sous-traitant">{isEn ? "Subcontractor" : "Sous-traitant"}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={isEn ? "Contact" : "Contact"}><Input name="contactName" defaultValue={crew?.contactName || ""} data-testid="input-crew-contact" /></Field>
        <Field label={isEn ? "Phone" : "Téléphone"}><Input name="phone" defaultValue={crew?.phone || ""} data-testid="input-crew-phone" /></Field>
        <Field label={isEn ? "Email" : "Courriel"}><Input name="email" type="email" defaultValue={crew?.email || ""} data-testid="input-crew-email" /></Field>
        <Field label={isEn ? "Province" : "Province"}>
          <Select name="province" defaultValue={crew?.province || "QC"}>
            <SelectTrigger data-testid="select-crew-province"><SelectValue /></SelectTrigger>
            <SelectContent>{PROVINCES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label={isEn ? "Capacity / day" : "Capacité / jour"}><Input name="capacity" type="number" min={1} defaultValue={crew?.capacity || 1} data-testid="input-crew-capacity" /></Field>
        <Field label={isEn ? "Status" : "Statut"}>
          <Select name="status" defaultValue={crew?.status || "disponible"}>
            <SelectTrigger data-testid="select-crew-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="disponible">{isEn ? "Available" : "Disponible"}</SelectItem>
              <SelectItem value="occupe">{isEn ? "Busy" : "Occupé"}</SelectItem>
              <SelectItem value="indisponible">{isEn ? "Unavailable" : "Indisponible"}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label={isEn ? "Covered cities, comma separated" : "Villes couvertes, séparées par des virgules"}>
        <Textarea name="cities" rows={2} defaultValue={citiesText(crew?.cities)} placeholder={isEn ? "Quebec, Levis, Saguenay" : "Québec, Lévis, Saguenay"} data-testid="textarea-crew-cities" />
      </Field>
      <Field label={isEn ? "Notes" : "Notes"}>
        <Textarea name="notes" rows={2} defaultValue={crew?.notes || ""} data-testid="textarea-crew-notes" />
      </Field>
      <input type="hidden" name="rating" value={crew?.rating || 5} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>{isEn ? "Cancel" : "Annuler"}</Button>
        <Button type="submit" disabled={isPending} data-testid="button-save-crew">{isEn ? "Save" : "Enregistrer"}</Button>
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

function formatCities(value?: string | null, isEn = false) {
  const cities = parseCities(value);
  return cities.length ? cities.join(", ") : (isEn ? "No city defined" : "Aucune ville définie");
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
