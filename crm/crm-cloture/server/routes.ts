import type { Express, Request, Response, NextFunction } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { storage, detectSector, seed, hashPassword, verifyPassword } from "./storage";
import { sendInviteEmail, sendInstallerProfileReminderEmail, sendLeadAssignedEmail, sendInstallerAssignedEmail } from "./email";
import { sendInviteSms, sendInstallerProfileReminderSms } from "./sms";
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

const installerPostalCoordCache = new Map<string, [number, number]>();

async function geocodeCanadianPostalCode(postalCode?: string | null): Promise<[number, number] | null> {
  const clean = String(postalCode || "").replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(clean)) return null;
  const cached = installerPostalCoordCache.get(clean);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      q: `${clean}, Canada`,
      format: "jsonv2",
      limit: "1",
      countrycodes: "ca",
      addressdetails: "0",
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { "User-Agent": "cloture-crm/1.0" },
    });
    if (!response.ok) return null;
    const payload = await response.json() as Array<{ lat?: string; lon?: string }>;
    const first = payload?.[0];
    const lat = first?.lat ? Number(first.lat) : NaN;
    const lon = first?.lon ? Number(first.lon) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const coords: [number, number] = [lat, lon];
    installerPostalCoordCache.set(clean, coords);
    return coords;
  } catch {
    return null;
  }
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
        res.json({ ...safeUser, mustChangePassword: user.mustChangePassword ?? true });
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
    // Re-fetch mustChangePassword fresh from DB
    storage.getUserByEmailWithHash((req.user as any).email).then(u => {
      res.json({ ...safeUser, mustChangePassword: u?.mustChangePassword ?? true });
    }).catch(() => res.json(safeUser));
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
    if (req.path.startsWith("/public/")) return next();
    if (req.method === "OPTIONS") return next();
    return requireAuth(req, res, next);
  });
  // ───────────────────────────────────────────────────────────────────

  // ── Public invite routes ────────────────────────────────────────────
  // GET /i/:token — short redirect used in invite emails and SMS gateways
  app.get("/i/:token", async (req, res) => {
    const user = await storage.getUserByInviteToken(req.params.token);
    if (!user) return res.status(404).send("Lien invalide ou expiré");
    res.redirect(`${process.env.APP_URL || "https://cloture-crm.onrender.com"}/#/accept-invite?token=${req.params.token}`);
  });

  // GET /api/auth/invite/:token — check token, return user info (no sensitive data)
  app.get("/api/auth/invite/:token", async (req, res) => {
    const user = await storage.getUserByInviteToken(req.params.token);
    if (!user) return res.status(404).json({ error: "Lien invalide ou expiré" });
    res.json({ name: user.name, email: user.email, role: user.role });
  });

  // POST /api/auth/accept-invite — set password, clear token, log user in
  app.post("/api/auth/accept-invite", async (req, res, next) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) return res.status(400).json({ error: "Données manquantes" });
      if (typeof password !== "string" || password.length < 6)
        return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères" });
      const user = await storage.getUserByInviteToken(token);
      if (!user) return res.status(404).json({ error: "Lien invalide ou expiré" });
      await storage.setUserPassword(user.id, hashPassword(password));
      await storage.clearInviteToken(user.id);
      // Log the user in automatically
      req.logIn(user, (err) => {
        if (err) return next(err);
        res.json({ ...user, mustChangePassword: false });
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/auth/installer-profile-complete — installer confirms subcontractor form completion
  app.post("/api/auth/installer-profile-complete", requireAuth, async (req, res, next) => {
    try {
      const user = req.user as any;
      if (!user || user.role !== "installer") {
        return res.status(403).json({ error: "Acces reserve aux installateurs" });
      }
      await storage.setInstallerProfileCompleted(user.id, true);
      const refreshed = await storage.getUserByEmailWithHash(user.email);
      return res.json({ ok: true, installerProfileCompleted: refreshed?.installerProfileCompleted ?? true });
    } catch (err) {
      return next(err);
    }
  });

  app.get("/api/auth/installer-profile-data", requireAuth, async (req, res, next) => {
    try {
      const user = req.user as any;
      if (!user || user.role !== "installer") {
        return res.status(403).json({ error: "Acces reserve aux installateurs" });
      }
      const raw = await storage.getInstallerProfileFormData(user.id);
      let data: Record<string, any> = {};
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          data = {};
        }
      }
      return res.json({ ok: true, data });
    } catch (err) {
      return next(err);
    }
  });

  app.post("/api/auth/installer-profile-data", requireAuth, async (req, res, next) => {
    try {
      const user = req.user as any;
      if (!user || user.role !== "installer") {
        return res.status(403).json({ error: "Acces reserve aux installateurs" });
      }
      const data = req.body?.data;
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        return res.status(400).json({ error: "Payload invalide" });
      }
      const json = JSON.stringify(data);
      if (json.length > 200000) {
        return res.status(400).json({ error: "Fiche trop volumineuse" });
      }
      await storage.setInstallerProfileFormData(user.id, json);
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  // Serve subcontractor onboarding form HTML used after installer password creation
  app.get("/installer-sous-traitant-form", (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).send("Authentification requise");
    }

    const user = req.user as any;
    if (user.role !== "installer" && user.role !== "admin") {
      return res.status(403).send("Acces refuse");
    }

    const formNames = ["fiche_sous_traitant_interactive (1).html", "fiche_sous_traitant_interactive.html"];
    const candidates: string[] = [];

    // Resolve from current working directory and up to 5 parent levels to survive different deploy cwd values.
    let cursor = process.cwd();
    for (let i = 0; i < 6; i += 1) {
      for (const name of formNames) {
        candidates.push(path.resolve(cursor, name));
      }
      const parent = path.resolve(cursor, "..");
      if (parent === cursor) break;
      cursor = parent;
    }

    const formPath = candidates.find((p) => existsSync(p));
    if (!formPath) {
      return res.status(404).send("Fiche sous-traitant introuvable");
    }

    return res.sendFile(formPath);
  });
  // ───────────────────────────────────────────────────────────────────

  // GET /api/users/:id/installer-form-data — read a specific installer's form (admin/directors)
  app.get("/api/users/:id/installer-form-data", requireAuth, async (req, res, next) => {
    try {
      const actor = req.user as any;
      const allowed = ["admin", "sales_director", "install_director"];
      if (!allowed.includes(actor?.role)) {
        return res.status(403).json({ error: "Accès refusé" });
      }
      const userId = parseInt(req.params.id, 10);
      if (isNaN(userId)) return res.status(400).json({ error: "ID invalide" });
      const raw = await storage.getInstallerProfileFormData(userId);
      if (!raw) return res.json({ data: null });
      try {
        return res.json({ data: JSON.parse(raw) });
      } catch {
        return res.json({ data: null });
      }
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/users/:id/installer-form-data — admin edits an installer's form
  app.put("/api/users/:id/installer-form-data", requireAuth, async (req, res, next) => {
    try {
      const actor = req.user as any;
      if (actor?.role !== "admin") {
        return res.status(403).json({ error: "Accès refusé" });
      }
      const userId = parseInt(req.params.id, 10);
      if (isNaN(userId)) return res.status(400).json({ error: "ID invalide" });
      const { data } = req.body;
      if (!data || typeof data !== "object") return res.status(400).json({ error: "Données invalides" });
      const json = JSON.stringify(data);
      if (json.length > 200000) return res.status(400).json({ error: "Fiche trop volumineuse" });
      await storage.setInstallerProfileFormData(userId, json);
      return res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/installer-profiles — all installer territories for heatmap (admin/directors/sales_rep)
  app.get("/api/installer-profiles", requireAuth, async (req, res, next) => {
    try {
      const actor = req.user as any;
      const allowed = ["admin", "sales_director", "install_director", "sales_rep"];
      if (!allowed.includes(actor?.role)) {
        return res.status(403).json({ error: "Accès refusé" });
      }
      const users = await storage.getUsers();
      const installers = users.filter((u: any) => u.role === "installer");
      const profiles = await Promise.all(
        installers.map(async (u: any) => {
          const raw = await storage.getInstallerProfileFormData(u.id);
          let formData: Record<string, string | boolean> = {};
          if (raw) {
            try { formData = JSON.parse(raw); } catch { /* ignore */ }
          }
          return {
            userId: u.id,
            displayName: (formData.field_0 as string) || (formData.field_2 as string) || u.email,
            city: (formData.field_7 as string) || "",
            province: (formData.field_8 as string) || "",
            postalCode: ((formData.field_14 as string) || "").replace(/\s/g, "").toUpperCase(),
            radius: (formData.field_13 as string) || "",
            regions: (formData.field_12 as string) || "",
            latLng: null as [number, number] | null,
          };
        })
      );

      const withCoords = await Promise.all(
        profiles.map(async (p) => ({
          ...p,
          latLng: await geocodeCanadianPostalCode(p.postalCode),
        }))
      );
      res.json(withCoords.filter(p => p.postalCode));
    } catch (err) {
      next(err);
    }
  });

  // -------- Users --------
  app.get("/api/users", async (_req, res) => {
    res.json(await storage.getUsers());
  });

  const userMutationErrorMessage = (error: any) => {
    const code = String(error?.code || "");
    const detail = String(error?.detail || "");
    const message = String(error?.message || "");
    const full = `${message} ${detail}`.toLowerCase();

    if (code === "23505" || full.includes("duplicate key") || full.includes("users_email_key") || full.includes("email")) {
      return "Ce courriel est deja utilise par un autre utilisateur.";
    }
    if (code === "23502" || full.includes("null value")) {
      return "Un champ obligatoire est manquant.";
    }
    return "Impossible d'enregistrer l'utilisateur.";
  };

  app.post("/api/users", async (req, res) => {
    const parsed = insertUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const user = await storage.createUser(parsed.data);
      if (user.role === "installer") {
        await storage.setInstallerProfileCompleted(user.id, false);
      }
      const freshUser = (await storage.getUser(user.id)) || user;
      // Generate invite token (7-day expiry) and send welcome email
      const token = randomBytes(32).toString("hex");
      const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
      await storage.setInviteToken(freshUser.id, token, expiresAt);
      const baseUrl = process.env.APP_URL || `https://cloture-crm.onrender.com`;
      const inviteUrl = `${baseUrl}/i/${token}`;
      const [emailResult, smsResult] = await Promise.all([
        sendInviteEmail(freshUser.email, freshUser.name, freshUser.role, inviteUrl),
        sendInviteSms(freshUser.phone ?? "", freshUser.smsCarrier ?? "", freshUser.name, freshUser.role, inviteUrl),
      ]);
      res.json({
        ...freshUser,
        inviteUrl,
        emailSent: emailResult.ok,
        emailError: emailResult.error,
        smsSent: smsResult.ok,
        smsError: smsResult.error,
      });
    } catch (error: any) {
      res.status(400).json({ error: userMutationErrorMessage(error) });
    }
  });
  app.post("/api/users/:id/resend-invite", async (req, res) => {
    try {
      const user = await storage.getUser(Number(req.params.id));
      if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
      const token = randomBytes(32).toString("hex");
      const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
      await storage.setInviteToken(user.id, token, expiresAt);
      const baseUrl = process.env.APP_URL || "https://cloture-crm.onrender.com";
      const inviteUrl = `${baseUrl}/i/${token}`;
      const [emailResult, smsResult] = await Promise.all([
        sendInviteEmail(user.email, user.name, user.role, inviteUrl),
        sendInviteSms(user.phone ?? "", user.smsCarrier ?? "", user.name, user.role, inviteUrl),
      ]);
      res.json({
        ok: true,
        inviteUrl,
        emailSent: emailResult.ok,
        emailError: emailResult.error,
        smsSent: smsResult.ok,
        smsError: smsResult.error,
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "Erreur lors du renvoi" });
    }
  });
  app.post("/api/users/:id/resend-installer-form", async (req, res) => {
    try {
      const actorRole = (req.user as any)?.role;
      if (!["admin", "sales_director", "install_director"].includes(actorRole)) {
        return res.status(403).json({ error: "Acces refuse" });
      }

      const user = await storage.getUser(Number(req.params.id));
      if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
      if (user.role !== "installer") return res.status(400).json({ error: "Cet utilisateur n'est pas un installateur" });

      await storage.setInstallerProfileCompleted(user.id, false);

      const baseUrl = process.env.APP_URL || "https://cloture-crm.onrender.com";
      const loginUrl = `${baseUrl}/`;
      const [emailResult, smsResult] = await Promise.all([
        sendInstallerProfileReminderEmail(user.email, user.name, loginUrl),
        sendInstallerProfileReminderSms(user.phone ?? "", user.smsCarrier ?? "", user.name, loginUrl),
      ]);

      const actor = (req.user as any)?.name || "Admin";
      const actorRoleSafe = (req.user as any)?.role || "admin";
      const channels: string[] = [];
      if (emailResult.ok) channels.push("email");
      if (smsResult.ok) channels.push("sms");
      const channelText = channels.length ? channels.join("+") : "none";
      const errorText = [emailResult.error ? `email=${emailResult.error}` : null, smsResult.error ? `sms=${smsResult.error}` : null]
        .filter(Boolean)
        .join(" | ");

      await storage.createActivity({
        userId: (req.user as any)?.id || null,
        userName: actor,
        userRole: actorRoleSafe,
        action: "installer_form_reminder",
        note: `Rappel fiche installateur envoye a ${user.name} (${user.email}) - canaux: ${channelText}${errorText ? ` - erreurs: ${errorText}` : ""}`,
      });

      res.json({
        ok: true,
        loginUrl,
        emailSent: emailResult.ok,
        emailError: emailResult.error,
        smsSent: smsResult.ok,
        smsError: smsResult.error,
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "Erreur lors de l'envoi du rappel" });
    }
  });
  app.patch("/api/users/:id/installer-profile-status", async (req, res) => {
    try {
      const actor = req.user as any;
      if (!["admin", "sales_director", "install_director"].includes(actor?.role)) {
        return res.status(403).json({ error: "Acces refuse" });
      }

      const user = await storage.getUser(Number(req.params.id));
      if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
      if (user.role !== "installer") return res.status(400).json({ error: "Cet utilisateur n'est pas un installateur" });

      const completed = req.body?.completed === true;
      await storage.setInstallerProfileCompleted(user.id, completed);

      await storage.createActivity({
        userId: actor?.id || null,
        userName: actor?.name || "Admin",
        userRole: actor?.role || "admin",
        action: "installer_form_status",
        note: `${completed ? "Fiche installateur marquee completee" : "Fiche installateur marquee non completee"} pour ${user.name} (${user.email})`,
      });

      const refreshed = await storage.getUser(user.id);
      return res.json({ ok: true, installerProfileCompleted: refreshed?.installerProfileCompleted ?? completed });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Erreur lors de la mise a jour de la fiche" });
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
      res.status(400).json({ error: userMutationErrorMessage(error) });
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
    const leadId = Number(req.params.id);
    const before = await storage.getLead(leadId);
    if (!before) return res.status(404).json({ error: "Not found" });

    const { _userId, _userName, _userRole, ...payload } = req.body;
    const updated = await storage.updateLead(leadId, payload);
    if (!updated) return res.status(404).json({ error: "Not found" });

    let assignedRepName: string | null = null;
    if (payload.assignedSalesId && Number(payload.assignedSalesId) !== (before.assignedSalesId || null)) {
      const rep = await storage.getUser(Number(payload.assignedSalesId));
      assignedRepName = rep?.name || null;
      if (rep?.email) {
        const emailResult = await sendLeadAssignedEmail({
          to: rep.email,
          salesRepName: rep.name,
          leadClientName: updated.clientName,
          city: updated.city,
          province: updated.province,
          fenceType: updated.fenceType,
        });
        if (!emailResult.ok) {
          console.warn("[lead-assignment-email] failed:", emailResult.error || "unknown error");
        }
      }
    }

    await storage.createActivity({
      leadId: updated.id,
      userId: _userId || null,
      userName: _userName || "Système",
      userRole: _userRole || "system",
      action: "update",
      note: assignedRepName
        ? `Assignation vendeur → ${assignedRepName} (notification envoyée)`
        : payload.status
          ? `Statut → ${payload.status}`
          : (payload.assignedSalesId ? `Assignation vendeur` : "Mise à jour lead"),
    });
    res.json(updated);
  });

  // -------- Public lead intake (website soumission form) --------
  // CORS open to clotureimpress.com (apex + www) and the GitHub Pages preview origin.
  const PUBLIC_LEAD_ORIGINS = new Set([
    "https://clotureimpress.com",
    "https://www.clotureimpress.com",
    "https://befcoinc.github.io",
    "http://localhost:8080",
    "http://localhost:3000",
    "http://127.0.0.1:5500",
  ]);
  const applyPublicCors = (req: Request, res: Response) => {
    const origin = req.headers.origin as string | undefined;
    if (origin && PUBLIC_LEAD_ORIGINS.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
  };
  app.options("/api/public/lead", (req, res) => {
    applyPublicCors(req, res);
    res.status(204).end();
  });
  app.post("/api/public/lead", async (req, res) => {
    applyPublicCors(req, res);
    try {
      const b = req.body || {};
      // Accept both raw schema fields and the website's French names.
      const prenom = String(b.prenom || b.firstName || "").trim();
      const nom = String(b.nom || b.lastName || "").trim();
      const fullName = String(b.clientName || `${prenom} ${nom}`).trim();
      const phone = String(b.telephone || b.phone || "").trim() || null;
      const email = String(b.email || b.courriel || "").trim() || null;
      const city = String(b.ville || b.city || "").trim() || null;
      const fenceMap: Record<string, string> = {
        ornementale: "ornemental",
        maille: "mailles",
        intimite: "intimité",
        commercial: "industrielle",
        portail: "ornemental",
        verre: "ornemental",
        autre: "À confirmer",
      };
      const rawService = String(b.service || b.fenceType || "").trim();
      const fenceType = fenceMap[rawService] || rawService || null;
      const message = String(b.message || "").trim() || null;

      if (!fullName || (!phone && !email)) {
        return res.status(400).json({ error: "Nom et au moins un moyen de contact requis." });
      }
      // Basic anti-bot honeypot: any value in `website` field rejects silently.
      if (b.website) return res.json({ ok: true });

      const lead = await storage.createLead({
        clientName: fullName,
        phone,
        email,
        address: null,
        city,
        province: "QC",
        postalCode: null,
        neighborhood: city,
        fenceType,
        message,
        source: "web",
        intimuraId: null,
        status: "nouveau",
        assignedSalesId: null,
        estimatedValue: null,
        estimatedLength: null,
      });
      await storage.createActivity({
        leadId: lead.id,
        userId: null,
        userName: "Site web",
        userRole: "system",
        action: "create",
        note: `Lead créé depuis le formulaire du site — secteur ${lead.sector}`,
      });
      res.json({ ok: true, id: lead.id });
    } catch (err) {
      console.error("[public/lead] error", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
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

    let assignedInstallerName: string | null = null;
    if (payload.assignedInstallerId && Number(payload.assignedInstallerId) !== (existing.assignedInstallerId || null)) {
      const installer = await storage.getUser(Number(payload.assignedInstallerId));
      assignedInstallerName = installer?.name || null;
      if (installer?.email) {
        const emailResult = await sendInstallerAssignedEmail({
          to: installer.email,
          installerName: installer.name,
          clientName: updated.clientName,
          city: updated.city,
          province: updated.province,
          fenceType: updated.fenceType,
        });
        if (!emailResult.ok) {
          console.warn("[installer-assignment-email] failed:", emailResult.error || "unknown error");
        }
      }
    }

    await storage.createActivity({
      quoteId: id,
      userId: _userId || null,
      userName: _userName || "Système",
      userRole: _userRole || "system",
      action: _timelineStep ? "status_change" : "update",
      note: assignedInstallerName
        ? `Assignation installateur → ${assignedInstallerName} (notification envoyée)`
        : _note || (payload.salesStatus ? `Vente → ${payload.salesStatus}` : payload.installStatus ? `Install → ${payload.installStatus}` : "Mise à jour"),
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
