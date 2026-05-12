import twilio from "twilio";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM;

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
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM) {
    const msg = "Twilio not configured";
    console.warn("[sms] Skipped:", msg);
    return { ok: false, error: msg };
  }

  const to = normalizePhone(toRaw);
  if (!to) {
    const msg = "Invalid or missing phone number";
    console.warn("[sms] Skipped:", msg, "input:", toRaw);
    return { ok: false, error: msg };
  }

  const firstName = (name || "").split(" ")[0] || "Bonjour";
  const roleLabel = ROLE_LABELS[role] ?? role;

  try {
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    const message = await client.messages.create({
      from: TWILIO_FROM,
      to,
      body: `Cloture Impress CRM: Bonjour ${firstName}, votre compte (${roleLabel}) est pret. Creez votre mot de passe ici: ${inviteUrl} (valide 7 jours).`,
    });
    console.log("[sms] Invite sent successfully to", to, "sid:", message.sid);
    return { ok: true, sid: message.sid };
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error("[sms] Failed to send invite to", to, ":", msg);
    return { ok: false, error: msg };
  }
}
