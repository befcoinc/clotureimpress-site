import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Database, Layers, Workflow, Sparkles, CheckCircle2, ArrowRight } from "lucide-react";

export function Architecture() {
  return (
    <>
      <PageHeader title="Architecture CRM & Roadmap" description="Vue d'ensemble de la structure technique, des modules, des workflows et des prochaines étapes." />
      <div className="p-6 lg:p-8 space-y-6 max-w-6xl">

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4" /> Modules MVP</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { t: "Tableau de bord Admin", d: "KPIs, pipeline, actions urgentes, regroupement par secteur." },
                { t: "Leads email", d: "Entrée manuelle / simulation, classification automatique par secteur." },
                { t: "Dispatch vendeur", d: "Assignation manuelle ou recommandée selon province/villes, charge par vendeur." },
                { t: "Soumissions (Kanban + fiche)", d: "Pipeline 6 colonnes, fiche détaillée, timeline 10 étapes, notes." },
                { t: "Dispatch installation", d: "Équipes/sous-traitants, planification, regroupement secteur+date." },
                { t: "Tableaux dédiés", d: "Admin, Ventes, Installation, Secteurs & planification." },
                { t: "Utilisateurs & rôles", d: "Comptes démo, matrice de permissions, sélecteur de rôle live." },
                { t: "Architecture (cette page)", d: "Documentation interne pour les utilisateurs et l'équipe produit." },
              ].map((m) => (
                <div key={m.t} className="rounded-md border border-card-border bg-card p-3">
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> <span className="font-semibold text-[13px]">{m.t}</span></div>
                  <p className="text-[12px] text-muted-foreground mt-1">{m.d}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Database className="h-4 w-4" /> Schéma de données</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px]">
              <div className="rounded-md border border-card-border bg-muted/30 p-3">
                <div className="font-semibold mb-1">users</div>
                <div className="text-muted-foreground">id, name, email, role, region, cities[], phone, active</div>
              </div>
              <div className="rounded-md border border-card-border bg-muted/30 p-3">
                <div className="font-semibold mb-1">leads</div>
                <div className="text-muted-foreground">clientName, phone, email, address, city, province, postalCode, neighborhood, fenceType, message, source, sector, status, assignedSalesId, estimatedValue, estimatedLength</div>
              </div>
              <div className="rounded-md border border-card-border bg-muted/30 p-3">
                <div className="font-semibold mb-1">quotes</div>
                <div className="text-muted-foreground">leadId, clientName, address, sector, status, salesStatus, installStatus, assignedSalesId, assignedInstallerId, fenceType, estimatedLength, estimatedPrice, finalPrice, salesNotes, installNotes, scheduledDate, signedDate, installedDate, paidDate, timeline[]</div>
              </div>
              <div className="rounded-md border border-card-border bg-muted/30 p-3">
                <div className="font-semibold mb-1">crews</div>
                <div className="text-muted-foreground">name, type (interne/sous-traitant), contactName, phone, email, province, cities[], capacity, rating, status</div>
              </div>
              <div className="rounded-md border border-card-border bg-muted/30 p-3">
                <div className="font-semibold mb-1">activities</div>
                <div className="text-muted-foreground">quoteId, leadId, userId, userName, userRole, action, note, createdAt</div>
              </div>
              <div className="rounded-md border border-card-border bg-muted/30 p-3 bg-accent/30">
                <div className="font-semibold mb-1">Stack technique</div>
                <div className="text-muted-foreground">Express + Vite + React + TypeScript + Tailwind + shadcn/ui + Drizzle ORM + SQLite (better-sqlite3). Données persistantes côté serveur dans data.db.</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Workflow className="h-4 w-4" /> Workflows clés</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="font-semibold text-[13px] mb-1.5">1) Cycle complet d'un dossier</div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  {[
                    "Email reçu", "Fiche lead créée", "Secteur détecté", "Assignation vendeur",
                    "Contact client", "RDV mesure", "Soumission envoyée", "Suivi", "Signature",
                    "Planification", "Assignation sous-traitant", "Installation", "Inspection", "Paiement", "SAV"
                  ].map((s, i, arr) => (
                    <span key={s} className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">{s}</Badge>
                      {i < arr.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="font-semibold text-[13px] mb-1.5">2) Regroupement quotidien par secteur</div>
                <p className="text-[12px] text-muted-foreground">Chaque matin, le directeur des installations consulte la page Dispatch installation → onglet « Par secteur ». Les installations en attente sont automatiquement groupées par secteur (province › ville › quartier) pour optimiser la livraison de matériel et le déplacement des équipes.</p>
              </div>
              <div>
                <div className="font-semibold text-[13px] mb-1.5">3) Suivi admin</div>
                <p className="text-[12px] text-muted-foreground">L'Admin et la Directrice des ventes voient en temps réel les avancements via le Tableau de bord, le flux d'activité par soumission, et les KPIs filtrables. Aucune action ne disparaît : toute modification crée une entrée d'activité.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" /> Roadmap — prochaines étapes</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { phase: "Phase 1 — MVP (actuel)", items: ["Persistance SQLite", "RBAC visuel par rôle", "Pipelines vente/install", "Classification secteur automatique", "Comptes de démonstration"] },
                { phase: "Phase 2 — Automatisations", items: ["Ingestion réelle d'emails (IMAP/Gmail)", "Parsing IA des messages (extraction infos)", "SMS/email automatiques de relance", "Génération PDF de soumission", "Signature électronique"] },
                { phase: "Phase 3 — Mobile & terrain", items: ["App mobile installateur", "Photos avant/après", "Géolocalisation des équipes", "Bons de travail signés terrain", "Carte interactive provinces"] },
                { phase: "Phase 4 — Intégrations", items: ["Comptabilité (QuickBooks/Acomba)", "Paiement Stripe", "Facturation automatique", "Plan d'inventaire matériel", "Calendrier Google Workspace"] },
                { phase: "Phase 5 — Intelligence", items: ["Score lead automatique", "Prévision revenu mensuel", "Optimisation routes installateurs", "Analyse churn / SAV", "Tableau Power BI"] },
                { phase: "Phase 6 — Échelle", items: ["Multi-langues (FR/EN)", "Authentification réelle + SSO", "Audit log RGPD/PIPEDA", "API publique", "Marketplace sous-traitants"] },
              ].map((p) => (
                <div key={p.phase} className="rounded-md border border-card-border bg-card p-3">
                  <div className="font-semibold text-[13px] mb-2">{p.phase}</div>
                  <ul className="space-y-1">
                    {p.items.map(it => (
                      <li key={it} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                        <span className="text-primary mt-0.5">›</span>{it}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
