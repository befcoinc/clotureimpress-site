import twilio from "twilio";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM;
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SMS_SENDER = process.env.BREVO_SMS_SENDER || "Cloture";
const TEXTBELT_API_KEY = process.env.TEXTBELT_API_KEY || "textbelt";
const INVITE_GATEWAY_SENDER = process.env.BREVO_SENDER_EMAIL || process.env.SMTP_USER || "noreply@clotureimpress.com";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  sales_director: "Directeur/trice des ventes",
  install_director: "Directeur des installations",
  sales_rep: "Vendeur / Représentant",
  installer: "Installateur / Sous-traitant",
};

const SMS_GATEWAYS: Record<string, string> = {
  bell: "txt.bell.ca",
  bell_mts: "text.mts.net",
  fido: "fido.ca",
  koodo: "msg.telus.com",
  telus: "msg.telus.com",
  public_mobile: "msg.telus.com",
  pc_mobile: "mobiletxt.ca",
  sasktel: "sms.sasktel.com",
};

function normalizePhone(raw: string): string | null {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("+")) {
    const digits = "+" + trimmed.slice(1).replace(/\D/g, "");
    return digits.length >= 8 ? digits : null;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export async function sendInviteSms(
  toRaw: string,
  carrierRaw: string,
  name: string,
  role: string,
  inviteUrl: string
): Promise<{ ok: boolean; error?: string; sid?: string }> {
  const to = normalizePhone(toRaw);
  if (!to) {
    const msg = "Invalid or missing phone number";
    console.warn("[sms] Skipped:", msg, "input:", toRaw);
    return { ok: false, error: msg };
  }

  const carrier = (carrierRaw || "").trim().toLowerCase();
  const gateway = SMS_GATEWAYS[carrier];
  const firstName = (name || "").split(" ")[0] || "Bonjour";
  const roleLabel = ROLE_LABELS[role] ?? role;
  const body = `Cloture Impress CRM: Bonjour ${firstName}, votre compte (${roleLabel}) est pret. Creez votre mot de passe ici: ${inviteUrl}`;

  if (gateway) {
    try {
      const recipient = `${to.replace(/^\+1/, "").replace(/\D/g, "")}@${gateway}`;
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.BREVO_API_KEY || "",
        },
        body: JSON.stringify({
          sender: { name: "Cloture Impress CRM", email: INVITE_GATEWAY_SENDER },
          to: [{ email: recipient }],
          subject: "",
          textContent: body,
        }),
      });
      const payload = (await response.json()) as any;
      if (response.ok && payload?.messageId) {
        console.log("[sms] Invite sent successfully to", recipient, "via email-to-sms gateway messageId:", payload.messageId);
        return { ok: true, sid: String(payload.messageId) };
      }
      const msg = payload?.message || payload?.code || `Gateway email error (${response.status})`;
      console.error("[sms] Gateway email failed for", recipient, ":", msg);
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error("[sms] Gateway email exception for", to, ":", msg);
    }
  }

  // Preferred provider: Twilio (if configured)
  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM) {
    try {
      const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
      const message = await client.messages.create({
        from: TWILIO_FROM,
        to,
        body,
      });
      console.log("[sms] Invite sent successfully to", to, "via twilio sid:", message.sid);
      return { ok: true, sid: message.sid };
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error("[sms] Twilio failed for", to, ":", msg);
      // Continue with fallback provider below.
    }
  }

  // Secondary provider: Brevo transactional SMS API
  if (BREVO_API_KEY) {
    try {
      const response = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": BREVO_API_KEY,
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: BREVO_SMS_SENDER,
          recipient: to,
          content: body,
          type: "transactional",
        }),
      });
      const payload = (await response.json()) as any;
      if (response.ok && payload?.messageId) {
        console.log("[sms] Invite sent successfully to", to, "via brevo id:", payload.messageId);
        return { ok: true, sid: String(payload.messageId) };
      }
      const msg = payload?.message || payload?.code || `Brevo SMS error (${response.status})`;
      console.error("[sms] Brevo failed for", to, ":", msg);
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error("[sms] Brevo exception for", to, ":", msg);
    }
  }

  // Zero-config fallback: Textbelt (free key allows limited sends)
  try {
    const response = await fetch("https://textbelt.com/text", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        phone: to,
        message: body,
        key: TEXTBELT_API_KEY,
      }).toString(),
    });
    const payload = (await response.json()) as any;
    if (payload?.success) {
      const sid = payload?.textId ? String(payload.textId) : undefined;
      console.log("[sms] Invite sent successfully to", to, "via textbelt id:", sid || "n/a");
      return { ok: true, sid };
    }
    const msg = payload?.error || "Unknown textbelt error";
    console.error("[sms] Textbelt failed to send invite to", to, ":", msg);
    return { ok: false, error: msg };
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error("[sms] Failed to send invite to", to, ":", msg);
    return { ok: false, error: msg };
  }
}

export async function sendInstallerProfileReminderSms(
  toRaw: string,
  carrierRaw: string,
  name: string,
  loginUrl: string
): Promise<{ ok: boolean; error?: string; sid?: string }> {
  const to = normalizePhone(toRaw);
  if (!to) return { ok: false, error: "Invalid or missing phone number" };

  const carrier = (carrierRaw || "").trim().toLowerCase();
  const gateway = SMS_GATEWAYS[carrier];
  const firstName = (name || "").split(" ")[0] || "Bonjour";
  const body = `Cloture Impress CRM: ${firstName}, action requise/required: complete ta fiche sous-traitant / complete your subcontractor form: ${loginUrl}`;

  if (gateway) {
    try {
      const recipient = `${to.replace(/^\+1/, "").replace(/\D/g, "")}@${gateway}`;
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.BREVO_API_KEY || "",
        },
        body: JSON.stringify({
          sender: { name: "Cloture Impress CRM", email: INVITE_GATEWAY_SENDER },
          to: [{ email: recipient }],
          subject: "",
          textContent: body,
        }),
      });
      const payload = (await response.json()) as any;
      if (response.ok && payload?.messageId) return { ok: true, sid: String(payload.messageId) };
    } catch {
      // Continue to API fallbacks.
    }
  }

  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM) {
    try {
      const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
      const message = await client.messages.create({ from: TWILIO_FROM, to, body });
      return { ok: true, sid: message.sid };
    } catch {
      // Continue to next fallback.
    }
  }

  if (BREVO_API_KEY) {
    try {
      const response = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": BREVO_API_KEY,
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: BREVO_SMS_SENDER,
          recipient: to,
          content: body,
          type: "transactional",
        }),
      });
      const payload = (await response.json()) as any;
      if (response.ok && payload?.messageId) return { ok: true, sid: String(payload.messageId) };
    } catch {
      // Continue to Textbelt fallback.
    }
  }

  try {
    const response = await fetch("https://textbelt.com/text", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ phone: to, message: body, key: TEXTBELT_API_KEY }).toString(),
    });
    const payload = (await response.json()) as any;
    if (payload?.success) return { ok: true, sid: payload?.textId ? String(payload.textId) : undefined };
    return { ok: false, error: payload?.error || "Unknown textbelt error" };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function sendSatisfactionSms(
  toRaw: string,
  clientName: string,
): Promise<{ ok: boolean; error?: string; sid?: string }> {
  const to = normalizePhone(toRaw);
  if (!to) return { ok: false, error: "Numéro de téléphone invalide ou manquant" };

  const firstName = (clientName || "").split(" ")[0] || "Bonjour";
  const body = `Cloture Impress: Bonjour ${firstName}, votre installation est terminee! Etes-vous satisfait(e) du travail? Repondez OUI ou NON, ou appelez le (514) 000-0000. Merci de votre confiance!`;

  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM) {
    try {
      const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
      const message = await client.messages.create({ from: TWILIO_FROM, to, body });
      console.log("[sms] Satisfaction SMS sent to", to, "via Twilio sid:", message.sid);
      return { ok: true, sid: message.sid };
    } catch (err: any) {
      console.error("[sms] Twilio satisfaction SMS failed:", err?.message);
    }
  }

  if (BREVO_API_KEY) {
    try {
      const response = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": BREVO_API_KEY,
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: BREVO_SMS_SENDER,
          recipient: to,
          content: body,
          type: "transactional",
        }),
      });
      const payload = (await response.json()) as any;
      if (response.ok && payload?.messageId) {
        console.log("[sms] Satisfaction SMS sent to", to, "via Brevo id:", payload.messageId);
        return { ok: true, sid: String(payload.messageId) };
      }
    } catch (err: any) {
      console.error("[sms] Brevo satisfaction SMS failed:", err?.message);
    }
  }

  try {
    const response = await fetch("https://textbelt.com/text", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ phone: to, message: body, key: TEXTBELT_API_KEY }).toString(),
    });
    const payload = (await response.json()) as any;
    if (payload?.success) {
      console.log("[sms] Satisfaction SMS sent to", to, "via Textbelt id:", payload?.textId);
      return { ok: true, sid: payload?.textId ? String(payload.textId) : undefined };
    }
    return { ok: false, error: payload?.error || "Textbelt error" };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}
