import type { Express, Request, Response, NextFunction } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { storage, detectSector, seed, hashPassword, verifyPassword } from "./storage";
import { insertLeadSchema, insertQuoteSchema, insertActivitySchema, insertUserSchema, insertCrewSchema } from "@shared/schema";

function decodeSvelteData(data: any[]) {
  const decode = (value: any): any => {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < data.length) return decode(data[value]);
    if (Array.isArray(value)) {
      if (value[0] === "Date") return value[1];
      return value.map(decode);
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v)]));
    }
    return value;
  };
  return decode(data[0]);
}

function extractCity(title = "") {
  const parts = title.split(/\s+x\s+/i).map(p => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function inferProvince(city = "") {
  const c = city.toLowerCase();
  if (["moncton"].some(v => c.includes(v))) return "NB";
  if (["toronto", "ottawa", "mississauga", "cantley"].some(v => c.includes(v))) return c.includes("cantley") ? "QC" : "ON";
  if (["calgary", "edmonton"].some(v => c.includes(v))) return "AB";
  if (["vancouver"].some(v => c.includes(v))) return "BC";
  return "QC";
}

function mapIntimuraStatus(status = "") {
  if (status === "approved") return "signee";
  if (status === "snoozed") return "suivi";
  if (status === "sent") return "envoyee";
  return "nouveau";
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await seed();

  // ── Passport Local Strategy ─────────────────────────────────────────
  passport.use(
    new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
      try {
        const user = await storage.getUserByEmailWithHash(email);
        if (!user) return done(null, false, { message: "Email ou mot de passe incorrect" });
        if (!user.passwordHash)
          return done(null, false, { message: "Compte non configuré — contactez l'administrateur" });
        if (!verifyPassword(password, user.passwordHash))
          return done(null, false, { message: "Email ou mot de passe incorrect" });
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );
  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user ?? null);
    } catch (err) {
      done(err);
    }
  });

  // requireAuth middleware
  function requireAuth(req: Request, res: Response, next: NextFunction) {
    if (req.isAuthenticated()) return next();
    return res.status(401).json({ error: "Authentification requise" });
  }

  // ── Auth routes (public) ────────────────────────────────────────────
  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ error: info?.message || "Identifiants incorrects" });
      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        const { passwordHash, ...safeUser } = user;
        res.json(safeUser);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ error: "Non authentifié" });
    const { passwordHash, ...safeUser } = req.user as any;
    res.json(safeUser);
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword)
        return res.status(400).json({ error: "Les deux champs sont requis" });
      if (typeof newPassword !== "string" || newPassword.length < 6)
        return res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 6 caractères" });
      const userId = (req.user as any).id;
      const userWithHash = await storage.getUserByEmailWithHash((req.user as any).email);
      if (!userWithHash?.passwordHash || !verifyPassword(currentPassword, userWithHash.passwordHash))
        return res.status(401).json({ error: "Mot de passe actuel incorrect" });
      await storage.setUserPassword(userId, hashPassword(newPassword));
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // ── Protect all other /api routes ──────────────────────────────────
  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/auth/")) return next();
    return requireAuth(req, res, next);
  });
  // ───────────────────────────────────────────────────────────────────

  // -------- Users --------
  app.get("/api/users", async (_req, res) => {
    res.json(await storage.getUsers());
  });
  app.post("/api/users", async (req, res) => {
    const parsed = insertUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      res.json(await storage.createUser(parsed.data));
    } catch (error: any) {
      res.status(400).json({ error: error?.message || "Impossible de créer l'utilisateur" });
    }
  });
  app.patch("/api/users/:id", async (req, res) => {
    const parsed = insertUserSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const updated = await storage.updateUser(Number(req.params.id), parsed.data);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || "Impossible de modifier l'utilisateur" });
    }
  });
  app.delete("/api/users/:id", async (req, res) => {
    const deleted = await storage.deleteUser(Number(req.params.id));
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, deleted });
  });

  // -------- Leads --------
  app.get("/api/leads", async (_req, res) => {
    res.json(await storage.getLeads());
  });
  app.get("/api/leads/:id", async (req, res) => {
    const lead = await storage.getLead(Number(req.params.id));
    if (!lead) return res.status(404).json({ error: "Not found" });
    res.json(lead);
  });
  app.post("/api/leads", async (req, res) => {
    const parsed = insertLeadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const lead = await storage.createLead(parsed.data);
    await storage.createActivity({
      leadId: lead.id,
      userId: req.body._userId || null,
      userName: req.body._userName || "Système",
      userRole: req.body._userRole || "system",
      action: "create",
      note: `Lead créé depuis ${lead.source || "email"} — secteur ${lead.sector}`,
    });
    res.json(lead);
  });
  app.patch("/api/leads/:id", async (req, res) => {
    const { _userId, _userName, _userRole, ...payload } = req.body;
    const updated = await storage.updateLead(Number(req.params.id), payload);
    if (!updated) return res.status(404).json({ error: "Not found" });
    await storage.createActivity({
      leadId: updated.id,
      userId: _userId || null,
      userName: _userName || "Système",
      userRole: _userRole || "system",
      action: "update",
      note: payload.status ? `Statut → ${payload.status}` : (payload.assignedSalesId ? `Assignation vendeur` : "Mise à jour lead"),
    });
    res.json(updated);
  });

  // -------- Sector detection helper --------
  app.post("/api/sector/detect", (req, res) => {
    res.json({ sector: detectSector(req.body || {}) });
  });

  // -------- Intimura sync --------
  app.post("/api/intimura/sync", async (_req, res) => {
    const cookieFile = "/home/user/workspace/intimura-cookie-header.txt";
    const cookie = process.env.INTIMURA_COOKIE || (existsSync(cookieFile) ? readFileSync(cookieFile, "utf8").trim() : "");
    if (!cookie) {
      return res.status(400).json({
        error: "INTIMURA_COOKIE manquant",
        message: "Connecte Intimura ou configure une session/Service Token Cloudflare pour activer la synchronisation.",
      });
    }

    const response = await fetch("https://crm.intimura.com/app/board/__data.json?x-sveltekit-invalidated=001", {
      headers: { Cookie: cookie, Accept: "application/json" },
    });
    if (!response.ok) return res.status(response.status).json({ error: `Intimura HTTP ${response.status}` });

    const payload = await response.json() as any;
    const node = payload.nodes?.find((n: any) => n.type === "data");
    const root = node?.data ? decodeSvelteData(node.data) : null;
    const intimuraQuotes = Array.isArray(root?.quotes) ? root.quotes : [];

    let createdLeads = 0;
    let createdQuotes = 0;
    let skipped = 0;

    for (const iq of intimuraQuotes) {
      if (!iq?.id) continue;
      const existing = await storage.getLeadByIntimuraId(iq.id);
      if (existing) {
        skipped++;
        continue;
      }
      const city = extractCity(iq.title || "");
      const province = inferProvince(city);
      const salesStatus = mapIntimuraStatus(iq.status);
      const lead = await storage.createLead({
        clientName: iq.customer_name || iq.title || "Client Intimura",
        phone: iq.customer_phone || null,
        email: null,
        address: null,
        city,
        province,
        postalCode: null,
        neighborhood: city,
        fenceType: "À confirmer",
        message: `Synchronisé depuis Intimura. Titre: ${iq.title || ""}. Statut Intimura: ${iq.status || ""}. Assigné: ${iq.assigned_user_name || ""}.`,
        source: "intimura",
        intimuraId: iq.id,
        status: salesStatus === "signee" ? "gagne" : "en_cours",
        assignedSalesId: null,
        estimatedValue: Number(iq.subtotal || 0),
        estimatedLength: null,
      });
      createdLeads++;

      await storage.createQuote({
        leadId: lead.id,
        intimuraId: iq.id,
        clientName: lead.clientName,
        address: null,
        city,
        province,
        sector: lead.sector,
        status: salesStatus === "signee" ? "signee" : "envoyee",
        salesStatus,
        installStatus: "a_planifier",
        assignedSalesId: null,
        assignedInstallerId: null,
        fenceType: "À confirmer",
        estimatedLength: null,
        estimatedPrice: Number(iq.subtotal || 0),
        finalPrice: null,
        salesNotes: `Import Intimura ${iq.id}. Premier paiement: ${iq.first_payment_amount || "n/d"}.`,
        installNotes: iq.with_installation ? "Installation demandée dans Intimura." : null,
        scheduledDate: iq.target_date || null,
        signedDate: salesStatus === "signee" ? iq.issued_at || null : null,
        installedDate: null,
        paidDate: iq.first_payment_paid_at || null,
        timeline: JSON.stringify([
          { step: "Import Intimura", date: new Date().toISOString(), note: `Quote ${iq.id}` },
          { step: "Statut Intimura", date: iq.created_at || new Date().toISOString(), note: iq.status || "" },
        ]),
      });
      createdQuotes++;

      await storage.createActivity({
        leadId: lead.id,
        userId: null,
        userName: "Sync Intimura",
        userRole: "system",
        action: "intimura_sync",
        note: `Lead importé depuis Intimura: ${iq.title || iq.customer_name}`,
      });
    }

    res.json({ fetched: intimuraQuotes.length, createdLeads, createdQuotes, skipped, syncedAt: new Date().toISOString() });
  });

  // Poll Intimura automatically while the CRM server is running.
  // This is a preview/MVP bridge. For production, replace the temporary
  // browser session cookie with a Cloudflare Access Service Token or API key.
  const g = globalThis as any;
  if (!g.__intimuraPollerStarted) {
    g.__intimuraPollerStarted = true;
    setInterval(async () => {
      try {
        await fetch("http://127.0.0.1:5000/api/intimura/sync", { method: "POST" });
      } catch (error) {
        console.warn("Intimura auto-sync failed", error);
      }
    }, 5 * 60 * 1000);
  }

  // -------- Quotes --------
  app.get("/api/quotes", async (_req, res) => {
    res.json(await storage.getQuotes());
  });
  app.get("/api/quotes/:id", async (req, res) => {
    const q = await storage.getQuote(Number(req.params.id));
    if (!q) return res.status(404).json({ error: "Not found" });
    res.json(q);
  });
  app.post("/api/quotes", async (req, res) => {
    const { _userId, _userName, _userRole, ...payload } = req.body;
    const parsed = insertQuoteSchema.safeParse(payload);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const quote = await storage.createQuote(parsed.data);
    await storage.createActivity({
      quoteId: quote.id,
      userId: _userId || null,
      userName: _userName || "Système",
      userRole: _userRole || "system",
      action: "create",
      note: "Soumission créée",
    });
    res.json(quote);
  });
  app.patch("/api/quotes/:id", async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getQuote(id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const { _userId, _userName, _userRole, _timelineStep, _note, ...payload } = req.body;

    if (_timelineStep) {
      const timeline = existing.timeline ? JSON.parse(existing.timeline) : [];
      timeline.push({ step: _timelineStep, date: new Date().toISOString(), userName: _userName, note: _note });
      payload.timeline = JSON.stringify(timeline);
    }

    const updated = await storage.updateQuote(id, payload);
    await storage.createActivity({
      quoteId: id,
      userId: _userId || null,
      userName: _userName || "Système",
      userRole: _userRole || "system",
      action: _timelineStep ? "status_change" : "update",
      note: _note || (payload.salesStatus ? `Vente → ${payload.salesStatus}` : payload.installStatus ? `Install → ${payload.installStatus}` : "Mise à jour"),
    });
    res.json(updated);
  });
  app.delete("/api/quotes/:id", async (req, res) => {
    const deleted = await storage.deleteQuote(Number(req.params.id));
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, deleted });
  });

  // -------- Crews --------
  app.get("/api/crews", async (_req, res) => {
    res.json(await storage.getCrews());
  });
  app.post("/api/crews", async (req, res) => {
    const parsed = insertCrewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const crew = await storage.createCrew(parsed.data);
    res.json(crew);
  });
  app.patch("/api/crews/:id", async (req, res) => {
    const parsed = insertCrewSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const updated = await storage.updateCrew(Number(req.params.id), parsed.data);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });
  app.delete("/api/crews/:id", async (req, res) => {
    const deleted = await storage.deleteCrew(Number(req.params.id));
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, deleted });
  });

  // -------- Activities --------
  app.get("/api/activities", async (req, res) => {
    const filter: any = {};
    if (req.query.quoteId) filter.quoteId = Number(req.query.quoteId);
    if (req.query.leadId) filter.leadId = Number(req.query.leadId);
    res.json(await storage.getActivities(filter));
  });
  app.post("/api/activities", async (req, res) => {
    const parsed = insertActivitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.json(await storage.createActivity(parsed.data));
  });

  // -------- Aggregated stats --------
  app.get("/api/stats", async (_req, res) => {
    const [allLeads, allQuotes, allUsers, allCrews] = await Promise.all([
      storage.getLeads(), storage.getQuotes(), storage.getUsers(), storage.getCrews(),
    ]);
    const nouveau = allLeads.filter(l => l.status === "nouveau").length;
    const enCours = allQuotes.filter(q => ["envoyee", "suivi", "rendez_vous", "rdv_mesure", "nouveau", "contacte"].includes(q.salesStatus)).length;
    const gagne = allQuotes.filter(q => q.salesStatus === "signee").length;
    const installPlanned = allQuotes.filter(q => q.installStatus === "planifiee").length;
    const enRetard = allQuotes.filter(q => {
      if (!q.scheduledDate) return false;
      return new Date(q.scheduledDate) < new Date(Date.now() - 86400000) && q.installStatus !== "terminee";
    }).length;
    const estimatedValue = allQuotes
      .filter(q => !["perdue"].includes(q.salesStatus))
      .reduce((s, q) => s + (q.estimatedPrice || 0), 0);

    res.json({
      leadsCount: allLeads.length,
      newLeads: nouveau,
      quotesInProgress: enCours,
      quotesWon: gagne,
      installsPlanned: installPlanned,
      installsLate: enRetard,
      estimatedValue,
      crewsCount: allCrews.length,
      usersCount: allUsers.length,
    });
  });

  return httpServer;
}
