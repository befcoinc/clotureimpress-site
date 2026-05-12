import { pgTable, text, integer, serial, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============= USERS =============
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull(), // admin | sales_director | install_director | sales_rep | installer
  region: text("region"), // province/region of responsibility
  cities: text("cities"), // JSON array of cities
  phone: text("phone"),
  active: boolean("active").notNull().default(true),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ============= LEADS =============
export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  clientName: text("client_name").notNull(),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  city: text("city"),
  province: text("province"),
  postalCode: text("postal_code"),
  neighborhood: text("neighborhood"),
  fenceType: text("fence_type"), // bois, mailles, ornemental, intimité, agricole, industrielle
  message: text("message"),
  source: text("source").notNull().default("email"), // email, web, téléphone, référence
  intimuraId: text("intimura_id"), // external quote/lead id from Intimura
  sector: text("sector"), // computed sector tag e.g. "QC-Montreal-Plateau"
  status: text("status").notNull().default("nouveau"), // nouveau, a_qualifier, assigne, en_cours, gagne, perdu
  assignedSalesId: integer("assigned_sales_id"),
  estimatedValue: real("estimated_value"),
  estimatedLength: real("estimated_length"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const insertLeadSchema = createInsertSchema(leads).omit({ id: true, createdAt: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;

// ============= QUOTES / SOUMISSIONS =============
export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id"),
  intimuraId: text("intimura_id"),
  clientName: text("client_name").notNull(),
  address: text("address"),
  city: text("city"),
  province: text("province"),
  sector: text("sector"),
  status: text("status").notNull().default("brouillon"), // brouillon, envoyee, suivi, rendez_vous, signee, perdue
  salesStatus: text("sales_status").notNull().default("nouveau"), // nouveau, contacte, rdv_mesure, envoyee, suivi, rendez_vous, signee, perdue
  installStatus: text("install_status").notNull().default("a_planifier"), // a_planifier, planifiee, materiel, en_route, en_cours, terminee, inspection, probleme
  assignedSalesId: integer("assigned_sales_id"),
  assignedInstallerId: integer("assigned_installer_id"),
  assignedCrewId: integer("assigned_crew_id"),
  fenceType: text("fence_type"),
  estimatedLength: real("estimated_length"),
  estimatedPrice: real("estimated_price"),
  finalPrice: real("final_price"),
  salesNotes: text("sales_notes"),
  installNotes: text("install_notes"),
  scheduledDate: text("scheduled_date"),
  scheduledTime: text("scheduled_time"),
  signedDate: text("signed_date"),
  installedDate: text("installed_date"),
  paidDate: text("paid_date"),
  timeline: text("timeline"), // JSON array of {step, date, userId, note}
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const insertQuoteSchema = createInsertSchema(quotes).omit({ id: true, createdAt: true });
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotes.$inferSelect;

// ============= CREWS / INSTALLATEURS =============
export const crews = pgTable("crews", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("interne"), // interne, sous-traitant
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  province: text("province"),
  cities: text("cities"), // JSON array
  capacity: integer("capacity").notNull().default(1), // jobs simultanés
  rating: real("rating").default(5),
  status: text("status").notNull().default("disponible"), // disponible, occupe, indisponible
  notes: text("notes"),
});

export const insertCrewSchema = createInsertSchema(crews).omit({ id: true });
export type InsertCrew = z.infer<typeof insertCrewSchema>;
export type Crew = typeof crews.$inferSelect;

// ============= ACTIVITIES / NOTES =============
export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id"),
  leadId: integer("lead_id"),
  userId: integer("user_id"),
  userName: text("user_name"),
  userRole: text("user_role"),
  action: text("action").notNull(), // status_change, note, contact, assignment...
  note: text("note"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const insertActivitySchema = createInsertSchema(activities).omit({ id: true, createdAt: true });
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activities.$inferSelect;

// ============= CONSTANTS / ENUMS =============
export const PROVINCES = ["QC", "ON", "AB", "BC", "MB", "SK", "NS", "NB", "PE", "NL"] as const;

export const ROLES = {
  admin: "Admin",
  sales_director: "Directrice des ventes",
  install_director: "Directeur des installations",
  sales_rep: "Vendeur",
  installer: "Installateur / Sous-traitant",
} as const;

export const LEAD_STATUSES = {
  nouveau: "Nouveau",
  a_qualifier: "À qualifier",
  assigne: "Assigné vendeur",
  en_cours: "Soumission en cours",
  gagne: "Gagné",
  perdu: "Perdu",
} as const;

export const SALES_STATUSES = {
  nouveau: "Lead reçu",
  contacte: "Contacté",
  rdv_mesure: "Rendez-vous mesure",
  envoyee: "Soumission envoyée",
  suivi: "Suivi",
  rendez_vous: "Rendez-vous",
  signee: "Signée",
  perdue: "Perdue",
} as const;

export const INSTALL_STATUSES = {
  a_planifier: "À planifier",
  planifiee: "Planifiée",
  materiel: "Matériel à préparer",
  en_route: "En route",
  en_cours: "En cours",
  terminee: "Terminée",
  inspection: "Inspection",
  probleme: "Problème",
} as const;

export const FENCE_TYPES = [
  "À confirmer",
  "Clôture résidentielle",
  "Clôture commerciale",
  "Clôture industrielle",
  "Clôture ornementale - aluminium peint",
  "Clôture ornementale - fer forgé",
  "Maille de chaîne / Frost",
  "Clôture d'intimité - bois",
  "Clôture d'intimité - composite",
  "Clôture d'intimité - vinyle / PVC",
  "Clôture pour entrepôt",
  "Clôture pour stationnement",
  "Clôture pour site industriel",
  "Clôture et rampe en verre",
  "Portail sur mesure - manuel",
  "Portail sur mesure - motorisé",
  "Projet mixte clôture + portail",
  "Réparation / remplacement",
] as const;
