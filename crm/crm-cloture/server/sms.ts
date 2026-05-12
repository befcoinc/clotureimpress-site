import twilio from "twilio";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM;
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SMS_SENDER = process.env.BREVO_SMS_SENDER || "Cloture";
const TEXTBELT_API_KEY = process.env.TEXTBELT_API_KEY || "textbelt";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  sales_director: "Directeur/trice des ventes",
  install_director: "Directeur des installations",
  sales_rep: "Vendeur / Représentant",
  installer: "Installateur / Sous-traitant",
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

  const firstName = (name || "").split(" ")[0] || "Bonjour";
  const roleLabel = ROLE_LABELS[role] ?? role;
  const body = `Cloture Impress CRM: Bonjour ${firstName}, votre compte (${roleLabel}) est pret. Creez votre mot de passe ici: ${inviteUrl} (valide 7 jours).`;

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
