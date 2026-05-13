import {
  users, leads, quotes, crews, activities, installerApplications,
  type User, type InsertUser,
  type Lead, type InsertLead,
  type Quote, type InsertQuote,
  type Crew, type InsertCrew,
  type Activity, type InsertActivity,
  type InstallerApplication, type InsertInstallerApplication,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, desc, sql } from "drizzle-orm";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

// Render PostgreSQL requires SSL. Enable it whenever the URL points at Render
// (both internal `dpg-...` and external `*.render.com` hostnames support TLS).
const databaseUrl = process.env.DATABASE_URL!;
const needsSsl =
  /render\.com/i.test(databaseUrl) ||
  /\bdpg-[a-z0-9]+/i.test(databaseUrl) ||
  process.env.PGSSL === "require" ||
  process.env.NODE_ENV === "production";

const client = postgres(databaseUrl, needsSsl ? { ssl: "require" } : undefined);
export const db = drizzle(client);

// =============== PASSWORD UTILITIES ===============
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const input = scryptSync(plain, salt, 64);
    return timingSafeEqual(input, Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

// =============== SECTOR DETECTION ===============
function detectSector(lead: Partial<InsertLead>): string {
  const pc = (lead.postalCode || "").toUpperCase().replace(/\s/g, "");
  const city = (lead.city || "").trim();
  const province = (lead.province || "").trim().toUpperCase();
  const fsa = pc.slice(0, 3);
  const hood = lead.neighborhood?.trim();

  const parts = [province || "??", city || fsa || "??"];
  if (hood) parts.push(hood);
  else if (fsa) parts.push(fsa);
  return parts.join(" › ");
}

// =============== SCHEMA MIGRATION (idempotent) ===============
// Runs CREATE TABLE IF NOT EXISTS for all tables defined in shared/schema.ts.
// Avoids needing a separate `drizzle-kit push` step at deploy time.
async function migrate() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      region TEXT,
      cities TEXT,
      phone TEXT,
      sms_carrier TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE
    )
  `);
  // Add password_hash column for existing deployments (idempotent)
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;`);
  // Invite token columns
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token TEXT;`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_expires_at BIGINT;`);
  // Add mobile carrier for free email-to-SMS gateway delivery
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_carrier TEXT;`);
  // Force password change on first login
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT TRUE;`);
  // Require subcontractor profile onboarding for newly-created installers
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS installer_profile_completed BOOLEAN NOT NULL DEFAULT TRUE;`);
  // If an installer has no phone, we treat onboarding as incomplete.
  await db.execute(sql`
    UPDATE users
    SET installer_profile_completed = FALSE
    WHERE role = 'installer'
      AND (phone IS NULL OR btrim(phone) = '')
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      client_name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      province TEXT,
      postal_code TEXT,
      neighborhood TEXT,
      fence_type TEXT,
      message TEXT,
      source TEXT NOT NULL DEFAULT 'email',
      intimura_id TEXT,
      sector TEXT,
      status TEXT NOT NULL DEFAULT 'nouveau',
      assigned_sales_id INTEGER,
      estimated_value REAL,
      estimated_length REAL,
      created_at TEXT NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS quotes (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER,
      intimura_id TEXT,
      client_name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      province TEXT,
      sector TEXT,
      status TEXT NOT NULL DEFAULT 'brouillon',
      sales_status TEXT NOT NULL DEFAULT 'nouveau',
      install_status TEXT NOT NULL DEFAULT 'a_planifier',
      assigned_sales_id INTEGER,
      assigned_installer_id INTEGER,
      assigned_crew_id INTEGER,
      fence_type TEXT,
      estimated_length REAL,
      estimated_price REAL,
      final_price REAL,
      sales_notes TEXT,
      install_notes TEXT,
      scheduled_date TEXT,
      scheduled_time TEXT,
      signed_date TEXT,
      installed_date TEXT,
      paid_date TEXT,
      timeline TEXT,
      created_at TEXT NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS crews (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'interne',
      contact_name TEXT,
      phone TEXT,
      email TEXT,
      province TEXT,
      cities TEXT,
      capacity INTEGER NOT NULL DEFAULT 1,
      rating REAL DEFAULT 5,
      status TEXT NOT NULL DEFAULT 'disponible',
      notes TEXT
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS activities (
      id SERIAL PRIMARY KEY,
      quote_id INTEGER,
      lead_id INTEGER,
      user_id INTEGER,
      user_name TEXT,
      user_role TEXT,
      action TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS installer_profiles (
      user_id INTEGER PRIMARY KEY,
      form_data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS installer_applications (
      id SERIAL PRIMARY KEY,
      company_name TEXT NOT NULL,
      website TEXT,
      address TEXT,
      year_founded TEXT,
      employee_count TEXT,
      regions TEXT,
      contact_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      fence_types TEXT,
      years_experience TEXT,
      status TEXT NOT NULL DEFAULT 'en_attente',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
    )
  `);
}

// =============== PASSWORD SEEDING ===============
async function seedPasswords() {
  const rows = await db.execute(sql`SELECT id FROM users WHERE password_hash IS NULL`);
  for (const row of rows) {
    const hash = hashPassword("Cloture2025!");
    const rowId = (row as any).id;
    await db.execute(sql`UPDATE users SET password_hash = ${hash} WHERE id = ${rowId}`);
  }
}

// =============== SEED DATA ===============
async function seed() {
  await migrate();
  const existing = await db.select().from(users).limit(1);
  if (existing.length === 0) {

  const seedUsers: InsertUser[] = [
    { name: "Marie Tremblay", email: "admin@cloturepro.ca", role: "admin", region: "Canada", phone: "514-555-0001", active: true },
    { name: "Sophie Bergeron", email: "sophie@cloturepro.ca", role: "sales_director", region: "Canada", phone: "514-555-0002", active: true },
    { name: "Marc Lavoie", email: "marc@cloturepro.ca", role: "install_director", region: "Canada", phone: "514-555-0003", active: true },
    { name: "Julien Côté", email: "julien@cloturepro.ca", role: "sales_rep", region: "QC", cities: JSON.stringify(["Montréal", "Laval"]), phone: "514-555-1010", active: true },
    { name: "Isabelle Roy", email: "isabelle@cloturepro.ca", role: "sales_rep", region: "QC", cities: JSON.stringify(["Québec", "Lévis"]), phone: "418-555-1020", active: true },
    { name: "David Chen", email: "david@cloturepro.ca", role: "sales_rep", region: "ON", cities: JSON.stringify(["Toronto", "Mississauga"]), phone: "416-555-1030", active: true },
    { name: "Amélie Gagnon", email: "amelie@cloturepro.ca", role: "sales_rep", region: "AB", cities: JSON.stringify(["Calgary", "Edmonton"]), phone: "403-555-1040", active: true },
    { name: "Patrick Boivin", email: "patrick@cloturepro.ca", role: "installer", region: "QC", cities: JSON.stringify(["Montréal", "Laval", "Longueuil"]), phone: "514-555-2010", active: true },
    { name: "Steve O'Brien", email: "steve@cloturepro.ca", role: "installer", region: "ON", cities: JSON.stringify(["Toronto", "Brampton"]), phone: "416-555-2020", active: true },
    { name: "Luc Pelletier", email: "luc@cloturepro.ca", role: "installer", region: "QC", cities: JSON.stringify(["Québec", "Lévis", "Saguenay"]), phone: "418-555-2030", active: true },
  ];
  await db.insert(users).values(seedUsers).onConflictDoNothing();

  const seedCrews: InsertCrew[] = [
    { name: "Équipe Boivin & Fils", type: "interne", contactName: "Patrick Boivin", phone: "514-555-2010", province: "QC", cities: JSON.stringify(["Montréal", "Laval", "Longueuil"]), capacity: 2, rating: 4.8, status: "disponible" },
    { name: "Clôtures Pelletier", type: "sous-traitant", contactName: "Luc Pelletier", phone: "418-555-2030", province: "QC", cities: JSON.stringify(["Québec", "Lévis", "Saguenay"]), capacity: 3, rating: 4.6, status: "disponible" },
    { name: "O'Brien Fencing", type: "sous-traitant", contactName: "Steve O'Brien", phone: "416-555-2020", province: "ON", cities: JSON.stringify(["Toronto", "Brampton", "Mississauga"]), capacity: 2, rating: 4.9, status: "occupe" },
    { name: "Prairie Fence Co.", type: "sous-traitant", contactName: "Tom Wilson", phone: "403-555-2040", province: "AB", cities: JSON.stringify(["Calgary", "Edmonton", "Red Deer"]), capacity: 2, rating: 4.5, status: "disponible" },
    { name: "West Coast Fence", type: "sous-traitant", contactName: "Hannah Lee", phone: "604-555-2050", province: "BC", cities: JSON.stringify(["Vancouver", "Burnaby", "Surrey"]), capacity: 2, rating: 4.7, status: "disponible" },
    { name: "Équipe Tremblay", type: "interne", contactName: "Jean Tremblay", phone: "514-555-2060", province: "QC", cities: JSON.stringify(["Montréal", "Laval"]), capacity: 1, rating: 4.4, status: "indisponible" },
  ];
  await db.insert(crews).values(seedCrews);

  const seedLeadData: Array<Partial<InsertLead> & { clientName: string }> = [
    { clientName: "Jean-François Dubois", phone: "514-222-1100", email: "jf.dubois@gmail.com", address: "1245 rue Saint-Denis", city: "Montréal", province: "QC", postalCode: "H2X 3K8", neighborhood: "Le Plateau", fenceType: "Bois traité", message: "J'aimerais une soumission pour clôturer mon arrière-cour, environ 40 pieds.", status: "nouveau", estimatedValue: 4200, estimatedLength: 40 },
    { clientName: "Sarah Mitchell", phone: "416-333-2200", email: "smitchell@outlook.com", address: "88 King St W", city: "Toronto", province: "ON", postalCode: "M5H 1A1", neighborhood: "Financial District", fenceType: "Ornementale (aluminium)", message: "Need a quote for ornamental aluminum fence around front yard, ~60ft.", status: "a_qualifier", estimatedValue: 8400, estimatedLength: 60 },
    { clientName: "Robert Lalonde", phone: "450-444-3300", email: "rlalonde@videotron.ca", address: "55 boul. des Laurentides", city: "Laval", province: "QC", postalCode: "H7G 2T8", neighborhood: "Pont-Viau", fenceType: "Mailles de chaîne", message: "Remplacement de la clôture actuelle, terrain commercial.", status: "assigne", assignedSalesId: 4, estimatedValue: 6800, estimatedLength: 120 },
    { clientName: "Emma Thompson", phone: "403-555-4400", email: "ethompson@telus.net", address: "1200 6 Ave SW", city: "Calgary", province: "AB", postalCode: "T2P 0S4", neighborhood: "Beltline", fenceType: "Intimité PVC", message: "Looking for 50ft of privacy fencing, white PVC.", status: "en_cours", assignedSalesId: 7, estimatedValue: 5200, estimatedLength: 50 },
    { clientName: "Mohammed Al-Hassan", phone: "604-666-5500", email: "m.alhassan@shaw.ca", address: "777 Robson St", city: "Vancouver", province: "BC", postalCode: "V6Z 1A1", neighborhood: "Downtown", fenceType: "Industrielle / commerciale", message: "Commercial property, industrial chain link fence with gates.", status: "en_cours", estimatedValue: 18500, estimatedLength: 250 },
    { clientName: "Marie-Claude Lemieux", phone: "418-777-6600", email: "mclemieux@hotmail.com", address: "320 rue Saint-Jean", city: "Québec", province: "QC", postalCode: "G1R 1N8", neighborhood: "Vieux-Québec", fenceType: "Bois traité", message: "Petite cour arrière, environ 25 pieds.", status: "gagne", assignedSalesId: 5, estimatedValue: 2800, estimatedLength: 25 },
    { clientName: "James Wilson", phone: "905-888-7700", email: "jwilson@bell.net", address: "150 Main St", city: "Mississauga", province: "ON", postalCode: "L5A 1B2", neighborhood: "Port Credit", fenceType: "Bois traité", message: "Side and back yard, two gates.", status: "perdu", assignedSalesId: 6, estimatedValue: 5600, estimatedLength: 80 },
    { clientName: "Catherine Pageau", phone: "514-999-8800", email: "cpageau@gmail.com", address: "4500 rue Bélanger", city: "Montréal", province: "QC", postalCode: "H1T 1B6", neighborhood: "Rosemont", fenceType: "Ornementale (aluminium)", message: "Avant et côté, ~45 pieds, noir.", status: "nouveau", estimatedValue: 6300, estimatedLength: 45 },
    { clientName: "David Park", phone: "780-111-9900", email: "dpark@gmail.com", address: "9999 Jasper Ave", city: "Edmonton", province: "AB", postalCode: "T5J 1N9", neighborhood: "Downtown", fenceType: "Mailles de chaîne", message: "Industrial yard fencing, ~200ft.", status: "a_qualifier", estimatedValue: 11000, estimatedLength: 200 },
    { clientName: "Nathalie Goyer", phone: "450-222-3344", email: "ngoyer@videotron.ca", address: "200 ch. Chambly", city: "Longueuil", province: "QC", postalCode: "J4H 3L3", neighborhood: "Vieux-Longueuil", fenceType: "Intimité PVC", message: "Cour arrière, clôture d'intimité 6 pieds.", status: "gagne", assignedSalesId: 4, estimatedValue: 4800, estimatedLength: 35 },
  ];
  const insertedLeads = await db.insert(leads).values(
    seedLeadData.map(l => ({ ...l, sector: detectSector(l), source: "email" as const }))
  ).returning();

  const now = Date.now();
  const quoteSeeds = [
    { leadIdx: 2, status: "envoyee", salesStatus: "envoyee", installStatus: "a_planifier", assignedSalesId: 4, assignedInstallerId: 8, fenceType: "Mailles de chaîne", estimatedLength: 120, estimatedPrice: 6800, salesNotes: "Client veut une réponse cette semaine.", scheduledDate: null as string | null, signedDate: null as string | null, finalPrice: null as number | null, installNotes: null as string | null },
    { leadIdx: 3, status: "envoyee", salesStatus: "suivi", installStatus: "a_planifier", assignedSalesId: 7, assignedInstallerId: null, fenceType: "Intimité PVC", estimatedLength: 50, estimatedPrice: 5200, salesNotes: "Suivi prévu vendredi.", scheduledDate: null, signedDate: null, finalPrice: null, installNotes: null },
    { leadIdx: 4, status: "envoyee", salesStatus: "rdv_mesure", installStatus: "a_planifier", assignedSalesId: null, assignedInstallerId: null, fenceType: "Industrielle / commerciale", estimatedLength: 250, estimatedPrice: 18500, salesNotes: "Mesure à programmer.", scheduledDate: null, signedDate: null, finalPrice: null, installNotes: null },
    { leadIdx: 5, status: "signee", salesStatus: "signee", installStatus: "planifiee", assignedSalesId: 5, assignedInstallerId: 10, fenceType: "Bois traité", estimatedLength: 25, estimatedPrice: 2800, finalPrice: 2750, salesNotes: "Signé. Acompte reçu.", installNotes: "Prévu mardi prochain, matin.", scheduledDate: new Date(now + 5 * 86400000).toISOString().slice(0, 10), signedDate: new Date(now - 3 * 86400000).toISOString().slice(0, 10) },
    { leadIdx: 9, status: "signee", salesStatus: "signee", installStatus: "a_planifier", assignedSalesId: 4, assignedInstallerId: null, fenceType: "Intimité PVC", estimatedLength: 35, estimatedPrice: 4800, finalPrice: 4750, salesNotes: "Signé hier soir, à planifier.", scheduledDate: null, signedDate: new Date(now - 1 * 86400000).toISOString().slice(0, 10), installNotes: null },
    { leadIdx: 0, status: "signee", salesStatus: "signee", installStatus: "en_cours", assignedSalesId: 4, assignedInstallerId: 8, fenceType: "Bois traité", estimatedLength: 40, estimatedPrice: 4200, finalPrice: 4100, salesNotes: "Signé.", installNotes: "Installation en cours aujourd'hui.", scheduledDate: new Date(now).toISOString().slice(0, 10), signedDate: new Date(now - 10 * 86400000).toISOString().slice(0, 10) },
  ];
  for (const q of quoteSeeds) {
    const lead = insertedLeads[q.leadIdx];
    if (!lead) continue;
    const timeline = JSON.stringify([
      { step: "Lead reçu", date: lead.createdAt, note: "Lead créé depuis email" },
      ...(q.salesStatus !== "nouveau" ? [{ step: "Contacté", date: new Date(now - 7 * 86400000).toISOString() }] : []),
      ...(["rdv_mesure","envoyee","signee"].includes(q.salesStatus) ? [{ step: "Rendez-vous mesure", date: new Date(now - 5 * 86400000).toISOString() }] : []),
      ...(["envoyee","signee"].includes(q.salesStatus) ? [{ step: "Soumission envoyée", date: new Date(now - 3 * 86400000).toISOString() }] : []),
      ...(q.salesStatus === "signee" ? [{ step: "Signée", date: q.signedDate }] : []),
      ...(q.installStatus === "planifiee" ? [{ step: "Planifiée", date: q.scheduledDate }] : []),
      ...(q.installStatus === "en_cours" ? [{ step: "Planifiée", date: q.scheduledDate }, { step: "En cours", date: new Date(now).toISOString() }] : []),
    ]);
    await db.insert(quotes).values({
      leadId: lead.id, clientName: lead.clientName, address: lead.address, city: lead.city,
      province: lead.province, sector: lead.sector, status: q.status as any,
      salesStatus: q.salesStatus as any, installStatus: q.installStatus as any,
      assignedSalesId: q.assignedSalesId, assignedInstallerId: q.assignedInstallerId,
      fenceType: q.fenceType, estimatedLength: q.estimatedLength, estimatedPrice: q.estimatedPrice,
      finalPrice: q.finalPrice, salesNotes: q.salesNotes, installNotes: q.installNotes,
      scheduledDate: q.scheduledDate, signedDate: q.signedDate, timeline,
    });
  }

  await db.insert(activities).values([
    { quoteId: 1, userId: 4, userName: "Julien Côté", userRole: "sales_rep", action: "status_change", note: "Soumission envoyée par courriel." },
    { quoteId: 4, userId: 5, userName: "Isabelle Roy", userRole: "sales_rep", action: "status_change", note: "Contrat signé, acompte reçu." },
    { quoteId: 4, userId: 3, userName: "Marc Lavoie", userRole: "install_director", action: "assignment", note: "Assigné à Clôtures Pelletier." },
    { leadId: 1, userId: 2, userName: "Sophie Bergeron", userRole: "sales_director", action: "note", note: "Lead à fort potentiel, à qualifier rapidement." },
    { quoteId: 6, userId: 8, userName: "Patrick Boivin", userRole: "installer", action: "status_change", note: "Équipe en route ce matin." },
  ]);
  } // end if (existing.length === 0)
  await seedPasswords();
}

// =============== STORAGE INTERFACE ===============
export interface IStorage {
  // Users
  getUsers(): Promise<User[]>;
  getUser(id: number): Promise<User | undefined>;
  getUsersByRole(role: string): Promise<User[]>;
  createUser(data: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: number): Promise<User | undefined>;
  getUserByEmailWithHash(email: string): Promise<(User & { passwordHash: string | null }) | undefined>;
  setUserPassword(id: number, passwordHash: string): Promise<void>;
  setInstallerProfileCompleted(id: number, completed: boolean): Promise<void>;
  setInviteToken(userId: number, token: string, expiresAt: number): Promise<void>;
  getUserByInviteToken(token: string): Promise<User | undefined>;
  clearInviteToken(userId: number): Promise<void>;
  getInstallerProfileFormData(userId: number): Promise<string | null>;
  setInstallerProfileFormData(userId: number, formData: string): Promise<void>;
  // Leads
  getLeads(): Promise<Lead[]>;
  getLead(id: number): Promise<Lead | undefined>;
  getLeadByIntimuraId(intimuraId: string): Promise<Lead | undefined>;
  createLead(data: InsertLead): Promise<Lead>;
  updateLead(id: number, data: Partial<InsertLead>): Promise<Lead | undefined>;
  // Quotes
  getQuotes(): Promise<Quote[]>;
  getQuote(id: number): Promise<Quote | undefined>;
  getQuoteByIntimuraId(intimuraId: string): Promise<Quote | undefined>;
  createQuote(data: InsertQuote): Promise<Quote>;
  updateQuote(id: number, data: Partial<InsertQuote>): Promise<Quote | undefined>;
  deleteQuote(id: number): Promise<Quote | undefined>;
  // Crews
  getCrews(): Promise<Crew[]>;
  createCrew(data: InsertCrew): Promise<Crew>;
  updateCrew(id: number, data: Partial<InsertCrew>): Promise<Crew | undefined>;
  deleteCrew(id: number): Promise<Crew | undefined>;
  // Activities
  getActivities(filter?: { quoteId?: number; leadId?: number }): Promise<Activity[]>;
  createActivity(data: InsertActivity): Promise<Activity>;
}

export class DatabaseStorage implements IStorage {
  async getUsers() { return db.select().from(users); }
  async getUser(id: number) { return (await db.select().from(users).where(eq(users.id, id)))[0]; }
  async getUsersByRole(role: string) { return db.select().from(users).where(eq(users.role, role)); }
  async createUser(data: InsertUser) {
    return (await db.insert(users).values(data).returning())[0];
  }
  async updateUser(id: number, data: Partial<InsertUser>) {
    return (await db.update(users).set(data).where(eq(users.id, id)).returning())[0];
  }
  async deleteUser(id: number) {
    const existing = await this.getUser(id);
    if (!existing) return undefined;
    await db.update(quotes).set({ assignedSalesId: null }).where(eq(quotes.assignedSalesId, id));
    await db.update(quotes).set({ assignedInstallerId: null }).where(eq(quotes.assignedInstallerId, id));
    await db.delete(users).where(eq(users.id, id));
    return existing;
  }
  async getUserByEmailWithHash(email: string) {
    const rows = await db.execute(sql`SELECT id, name, email, role, region, cities, phone, sms_carrier, active, password_hash, must_change_password, installer_profile_completed FROM users WHERE email = ${email} LIMIT 1`);
    if (!rows[0]) return undefined;
    const row = rows[0] as any;
    return {
      id: row.id, name: row.name, email: row.email, role: row.role,
      region: row.region ?? null, cities: row.cities ?? null,
      phone: row.phone ?? null,
      smsCarrier: row.sms_carrier ?? null,
      active: row.active ?? true,
      passwordHash: row.password_hash ?? null,
      mustChangePassword: row.must_change_password ?? true,
      installerProfileCompleted: row.installer_profile_completed ?? true,
    };
  }
  async setUserPassword(id: number, passwordHash: string): Promise<void> {
    await db.execute(sql`UPDATE users SET password_hash = ${passwordHash}, must_change_password = FALSE WHERE id = ${id}`);
  }
  async setInstallerProfileCompleted(id: number, completed: boolean): Promise<void> {
    await db.execute(sql`UPDATE users SET installer_profile_completed = ${completed} WHERE id = ${id}`);
  }
  async setInviteToken(userId: number, token: string, expiresAt: number): Promise<void> {
    await db.execute(sql`UPDATE users SET invite_token = ${token}, invite_expires_at = ${expiresAt} WHERE id = ${userId}`);
  }
  async getUserByInviteToken(token: string): Promise<User | undefined> {
    const rows = await db.execute(sql`
      SELECT id, name, email, role, region, cities, phone, sms_carrier, active, must_change_password, installer_profile_completed
      FROM users
      WHERE invite_token = ${token} AND invite_expires_at > ${Date.now()}
      LIMIT 1
    `);
    if (!rows[0]) return undefined;
    const r = rows[0] as any;
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      region: r.region ?? null,
      cities: r.cities ?? null,
      phone: r.phone ?? null,
      smsCarrier: r.sms_carrier ?? null,
      active: r.active ?? true,
      mustChangePassword: r.must_change_password ?? true,
      installerProfileCompleted: r.installer_profile_completed ?? true,
    };
  }
  async clearInviteToken(userId: number): Promise<void> {
    await db.execute(sql`UPDATE users SET invite_token = NULL, invite_expires_at = NULL WHERE id = ${userId}`);
  }
  async getInstallerProfileFormData(userId: number): Promise<string | null> {
    const rows = await db.execute(sql`SELECT form_data FROM installer_profiles WHERE user_id = ${userId} LIMIT 1`);
    const row = rows[0] as any;
    if (!row) return null;
    return typeof row.form_data === "string" ? row.form_data : JSON.stringify(row.form_data ?? {});
  }
  async setInstallerProfileFormData(userId: number, formData: string): Promise<void> {
    await db.execute(sql`
      INSERT INTO installer_profiles (user_id, form_data, updated_at)
      VALUES (${userId}, ${formData}, ${new Date().toISOString()})
      ON CONFLICT (user_id)
      DO UPDATE SET form_data = EXCLUDED.form_data, updated_at = EXCLUDED.updated_at
    `);
  }

  async getLeads() { return db.select().from(leads).orderBy(desc(leads.id)); }
  async getLead(id: number) { return (await db.select().from(leads).where(eq(leads.id, id)))[0]; }
  async getLeadByIntimuraId(intimuraId: string) { return (await db.select().from(leads).where(eq(leads.intimuraId, intimuraId)))[0]; }
  async createLead(data: InsertLead) {
    const sector = data.sector || detectSector(data);
    return (await db.insert(leads).values({ ...data, sector }).returning())[0];
  }
  async updateLead(id: number, data: Partial<InsertLead>) {
    return (await db.update(leads).set(data).where(eq(leads.id, id)).returning())[0];
  }

  async getQuotes() { return db.select().from(quotes).orderBy(desc(quotes.id)); }
  async getQuote(id: number) { return (await db.select().from(quotes).where(eq(quotes.id, id)))[0]; }
  async getQuoteByIntimuraId(intimuraId: string) { return (await db.select().from(quotes).where(eq(quotes.intimuraId, intimuraId)))[0]; }
  async createQuote(data: InsertQuote) {
    return (await db.insert(quotes).values(data).returning())[0];
  }
  async updateQuote(id: number, data: Partial<InsertQuote>) {
    return (await db.update(quotes).set(data).where(eq(quotes.id, id)).returning())[0];
  }
  async deleteQuote(id: number) {
    const existing = await this.getQuote(id);
    if (!existing) return undefined;
    await db.delete(activities).where(eq(activities.quoteId, id));
    await db.delete(quotes).where(eq(quotes.id, id));
    return existing;
  }

  async getCrews() { return db.select().from(crews); }
  async createCrew(data: InsertCrew) {
    return (await db.insert(crews).values(data).returning())[0];
  }
  async updateCrew(id: number, data: Partial<InsertCrew>) {
    return (await db.update(crews).set(data).where(eq(crews.id, id)).returning())[0];
  }
  async deleteCrew(id: number) {
    const existing = (await db.select().from(crews).where(eq(crews.id, id)))[0];
    if (!existing) return undefined;
    await db.update(quotes).set({ assignedCrewId: null }).where(eq(quotes.assignedCrewId, id));
    await db.delete(crews).where(eq(crews.id, id));
    return existing;
  }

  async getActivities(filter?: { quoteId?: number; leadId?: number }) {
    if (filter?.quoteId) return db.select().from(activities).where(eq(activities.quoteId, filter.quoteId)).orderBy(desc(activities.id));
    if (filter?.leadId) return db.select().from(activities).where(eq(activities.leadId, filter.leadId)).orderBy(desc(activities.id));
    return db.select().from(activities).orderBy(desc(activities.id));
  }
  async createActivity(data: InsertActivity) {
    return (await db.insert(activities).values(data).returning())[0];
  }

  async getInstallerApplications(): Promise<InstallerApplication[]> {
    return db.select().from(installerApplications).orderBy(desc(installerApplications.id));
  }
  async getInstallerApplication(id: number): Promise<InstallerApplication | undefined> {
    return (await db.select().from(installerApplications).where(eq(installerApplications.id, id)))[0];
  }
  async createInstallerApplication(data: InsertInstallerApplication): Promise<InstallerApplication> {
    return (await db.insert(installerApplications).values(data).returning())[0];
  }
  async updateInstallerApplication(id: number, data: Partial<InsertInstallerApplication>): Promise<InstallerApplication | undefined> {
    return (await db.update(installerApplications).set(data).where(eq(installerApplications.id, id)).returning())[0];
  }
}

export const storage = new DatabaseStorage();
export { detectSector, seed };
