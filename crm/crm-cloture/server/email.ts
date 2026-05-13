import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || "mail.privateemail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || "noreply@clotureimpress.com";
const SMTP_PASS = process.env.SMTP_PASS;
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "noreply@clotureimpress.com";
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "Cloture Impress CRM";
const BREVO_REPLY_TO = process.env.BREVO_REPLY_TO || BREVO_SENDER_EMAIL;
const FROM = `Clôture Impress CRM <${SMTP_USER}>`;

async function getBrevoBlockReason(email: string): Promise<string | null> {
  if (!BREVO_API_KEY) return null;
  try {
    const response = await fetch(
      `https://api.brevo.com/v3/smtp/blockedContacts/${encodeURIComponent(email)}`,
      {
        method: "GET",
        headers: {
          "api-key": BREVO_API_KEY,
          accept: "application/json",
        },
      }
    );

    // 404 means this recipient is not blocked.
    if (response.status === 404) return null;

    const payload = (await response.json().catch(() => ({}))) as any;
    if (response.ok) {
      return payload?.reason || "blacklist user";
    }

    console.warn("[email] Brevo blocked-contacts lookup failed:", response.status, JSON.stringify(payload));
    return null;
  } catch (err: any) {
    console.warn("[email] Brevo blocked-contacts lookup exception:", err?.message || String(err));
    return null;
  }
}

if (!SMTP_PASS) {
  console.warn("[email] WARNING: SMTP_PASS is not set — SMTP fallback DISABLED.");
}
if (!BREVO_API_KEY) {
  console.warn("[email] WARNING: BREVO_API_KEY is not set — Brevo email will be skipped.");
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465, // true for 465 (SSL), false for 587 (STARTTLS)
  requireTLS: SMTP_PORT === 587,
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000,
  auth: SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
});

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  sales_director: "Directeur/trice des ventes",
  install_director: "Directeur des installations",
  sales_rep: "Vendeur / Représentant",
  installer: "Installateur / Sous-traitant",
};

export async function sendInviteEmail(
  to: string,
  name: string,
  role: string,
  inviteUrl: string
): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const roleLabel = ROLE_LABELS[role] ?? role;
  const firstName = name.split(" ")[0];
  const subject = "Finalise la création de ton compte — Clôture Impress CRM";
  const textContent = [
    `Bonjour ${firstName},`,
    "",
    `Un administrateur t'a cree un compte sur le CRM CloturePro avec le role ${roleLabel}.`,
    "",
    "Finalise ton compte ici:",
    inviteUrl,
    "",
    "Ce lien est valide pendant 7 jours.",
    "Si tu n'as pas demande ce compte, ignore cet email.",
  ].join("\n");
  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invitation ClôturePro CRM</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

          <!-- Header -->
          <tr>
            <td style="background:#0f766e;padding:28px 40px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">ClôturePro <span style="font-weight:400;opacity:.8;">CRM</span></p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 12px;font-size:18px;font-weight:600;color:#111827;">Bonjour ${firstName} 👋</p>
              <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.6;">
                Un administrateur t'a créé un compte sur le <strong>CRM ClôturePro</strong> avec le rôle <strong>${roleLabel}</strong>.
              </p>
              <p style="margin:0 0 28px;font-size:15px;color:#4b5563;line-height:1.6;">
                Clique sur le bouton ci-dessous pour choisir ton mot de passe et accéder à ton espace.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#0f766e;border-radius:8px;">
                    <a href="${inviteUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Créer mon mot de passe →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Info box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#15803d;">Informations du compte</p>
                    <p style="margin:0;font-size:13px;color:#374151;">Nom : <strong>${name}</strong></p>
                    <p style="margin:4px 0 0;font-size:13px;color:#374151;">Rôle : <strong>${roleLabel}</strong></p>
                    <p style="margin:4px 0 0;font-size:13px;color:#374151;">Courriel : <strong>${to}</strong></p>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;">
                Ce lien est valide pendant <strong>7 jours</strong>. Si tu n'as pas demandé ce compte, tu peux ignorer cet email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top:1px solid #f3f4f6;padding:20px 40px;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                ClôturePro CRM · clotureimpress.com
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // Preferred provider on Render: Brevo API (HTTPS, no SMTP port dependency)
  if (BREVO_API_KEY) {
    try {
      const blockReason = await getBrevoBlockReason(to);
      if (blockReason) {
        const msg = `Destinataire bloque dans Brevo (${blockReason})`;
        console.error("[email] Invite blocked before send for", to, ":", msg);
        return { ok: false, error: msg };
      }

      const senderDomain = BREVO_SENDER_EMAIL.split("@")[1] || "clotureimpress.com";
      const messageId = `<invite.${Date.now()}.${Math.random().toString(36).slice(2)}@${senderDomain}>`;
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": BREVO_API_KEY,
        },
        body: JSON.stringify({
          sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
          replyTo: { email: BREVO_REPLY_TO, name: BREVO_SENDER_NAME },
          to: [{ email: to, name }],
          subject,
          textContent,
          htmlContent: html,
          headers: {
            "X-Mailin-custom": `source:crm-invite|type:account-invite|role:${role}`,
            "Message-ID": messageId,
          },
        }),
      });
      const payload = (await response.json()) as any;
      console.log("[email] Brevo response:", response.status, JSON.stringify(payload));
      if (response.ok && payload?.messageId) {
        console.log("[email] Invite sent successfully to", to, "via brevo messageId:", payload.messageId);
        return { ok: true, messageId: String(payload.messageId) };
      }
      const msg = payload?.message || payload?.code || `Brevo error (${response.status})`;
      console.error("[email] Brevo failed to send invite to", to, ":", msg, "\nPayload:", JSON.stringify(payload));
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error("[email] Brevo exception for", to, ":", msg);
    }
  }

  if (!SMTP_PASS) {
    const msg = BREVO_API_KEY ? "SMTP_PASS not configured (Brevo fallback failed)" : "SMTP_PASS not configured";
    console.error("[email] Cannot send to", to, "—", msg);
    return { ok: false, error: msg };
  }

  console.log("[email] Attempting to send invite to", to, "via", SMTP_HOST + ":" + SMTP_PORT, "as", SMTP_USER);

  try {
    const info = await transporter.sendMail({
      from: FROM,
      to,
      subject,
      html,
    });
    console.log("[email] Invite sent successfully to", to, "messageId:", info.messageId);
    return { ok: true, messageId: info.messageId };
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error("[email] Failed to send invite to", to, ":", msg);
    return { ok: false, error: msg };
  }
}

export async function sendInstallerProfileReminderEmail(
  to: string,
  name: string,
  loginUrl: string
): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const firstName = name.split(" ")[0] || "Bonjour";
  const subject = "Action requise | Required: Complete subcontractor form";
  const textContent = [
    `Bonjour ${firstName},`,
    "",
    "Action requise: complete ta fiche sous-traitant pour rester actif sur les dossiers.",
    "Required: complete your subcontractor form to stay active on assignments.",
    "",
    "Connexion / Login:",
    loginUrl,
    "",
    "Merci | Thank you.",
  ].join("\n");
  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Rappel fiche sous-traitant</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
          <tr>
            <td style="background:#0f766e;padding:24px 36px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Cloture Impress CRM</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 36px;">
              <p style="margin:0 0 12px;font-size:18px;font-weight:600;color:#111827;">Bonjour ${firstName}</p>
              <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.6;">
                <strong>Action requise:</strong> complete ta fiche sous-traitant pour rester actif sur les dossiers.<br/>
                <strong>Required:</strong> complete your subcontractor form to stay active on assignments.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
                <tr>
                  <td style="background:#0f766e;border-radius:8px;">
                    <a href="${loginUrl}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Ouvrir le CRM / Open CRM
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;color:#9ca3af;">Merci | Thank you.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  if (BREVO_API_KEY) {
    try {
      const blockReason = await getBrevoBlockReason(to);
      if (blockReason) {
        const msg = `Destinataire bloque dans Brevo (${blockReason})`;
        return { ok: false, error: msg };
      }
      const senderDomain = BREVO_SENDER_EMAIL.split("@")[1] || "clotureimpress.com";
      const messageId = `<reminder.${Date.now()}.${Math.random().toString(36).slice(2)}@${senderDomain}>`;
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": BREVO_API_KEY,
        },
        body: JSON.stringify({
          sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
          replyTo: { email: BREVO_REPLY_TO, name: BREVO_SENDER_NAME },
          to: [{ email: to, name }],
          subject,
          textContent,
          htmlContent: html,
          headers: {
            "X-Mailin-custom": "source:crm-installer-reminder|type:installer-profile",
            "Message-ID": messageId,
          },
        }),
      });
      const payload = (await response.json()) as any;
      if (response.ok && payload?.messageId) return { ok: true, messageId: String(payload.messageId) };
    } catch {
      // Fall through to SMTP fallback
    }
  }

  if (!SMTP_PASS) return { ok: false, error: "SMTP_PASS not configured" };

  try {
    const info = await transporter.sendMail({
      from: FROM,
      to,
      subject,
      html,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function sendLeadAssignedEmail(params: {
  to: string;
  salesRepName: string;
  leadClientName: string;
  city?: string | null;
  province?: string | null;
  fenceType?: string | null;
  appUrl?: string;
}): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const {
    to,
    salesRepName,
    leadClientName,
    city,
    province,
    fenceType,
    appUrl = process.env.APP_URL || "https://cloture-crm.onrender.com/#/leads?status=assigne",
  } = params;

  const firstName = (salesRepName || "").split(" ")[0] || "Bonjour";
  const cityLine = [city, province].filter(Boolean).join(", ");
  const subject = "Nouveau lead assigné — Clôture Impress CRM";
  const textContent = [
    `Bonjour ${firstName},`,
    "",
    "Un nouveau lead vient de t'etre assigne dans le CRM.",
    `Client: ${leadClientName}`,
    cityLine ? `Ville: ${cityLine}` : null,
    fenceType ? `Type de cloture: ${fenceType}` : null,
    "",
    "Ouvre le CRM:",
    appUrl,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nouveau lead assigné</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
          <tr>
            <td style="background:#0f766e;padding:24px 32px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Clôture Impress CRM</p>
            </td>
          </tr>
          <tr>
            <td style="padding:30px 32px;">
              <p style="margin:0 0 12px;font-size:18px;font-weight:600;color:#111827;">Bonjour ${firstName}</p>
              <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">Un nouveau lead vient de t'être assigné.</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0 0 6px;font-size:13px;color:#111827;"><strong>Client:</strong> ${leadClientName}</p>
                    ${cityLine ? `<p style="margin:0 0 6px;font-size:13px;color:#111827;"><strong>Ville:</strong> ${cityLine}</p>` : ""}
                    ${fenceType ? `<p style="margin:0;font-size:13px;color:#111827;"><strong>Type:</strong> ${fenceType}</p>` : ""}
                  </td>
                </tr>
              </table>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
                <tr>
                  <td style="background:#0f766e;border-radius:8px;">
                    <a href="${appUrl}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Ouvrir mes leads</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  if (BREVO_API_KEY) {
    try {
      const blockReason = await getBrevoBlockReason(to);
      if (blockReason) return { ok: false, error: `Destinataire bloque dans Brevo (${blockReason})` };

      const senderDomain = BREVO_SENDER_EMAIL.split("@")[1] || "clotureimpress.com";
      const messageId = `<lead-assigned.${Date.now()}.${Math.random().toString(36).slice(2)}@${senderDomain}>`;
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": BREVO_API_KEY,
        },
        body: JSON.stringify({
          sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
          replyTo: { email: BREVO_REPLY_TO, name: BREVO_SENDER_NAME },
          to: [{ email: to, name: salesRepName }],
          subject,
          textContent,
          htmlContent: html,
          headers: {
            "X-Mailin-custom": "source:crm-lead-assignment|type:lead-assigned",
            "Message-ID": messageId,
          },
        }),
      });
      const payload = (await response.json()) as any;
      if (response.ok && payload?.messageId) return { ok: true, messageId: String(payload.messageId) };
    } catch {
      // Continue to SMTP fallback.
    }
  }

  if (!SMTP_PASS) return { ok: false, error: "SMTP_PASS not configured" };

  try {
    const info = await transporter.sendMail({ from: FROM, to, subject, html });
    return { ok: true, messageId: info.messageId };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function sendInstallerAssignedEmail(params: {
  to: string;
  installerName: string;
  clientName: string;
  city?: string | null;
  province?: string | null;
  fenceType?: string | null;
  appUrl?: string;
}): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const {
    to,
    installerName,
    clientName,
    city,
    province,
    fenceType,
    appUrl = process.env.APP_URL || "https://cloture-crm.onrender.com/#/dispatch-installation",
  } = params;

  const firstName = (installerName || "").split(" ")[0] || "Bonjour";
  const location = [city, province].filter(Boolean).join(", ");
  const subject = "Nouveau dossier d'installation assigné — Clôture Impress CRM";
  const textContent = [
    `Bonjour ${firstName},`,
    "",
    "Un nouveau dossier d'installation vient de t'etre assigne.",
    `Client: ${clientName}`,
    location ? `Ville: ${location}` : null,
    fenceType ? `Type de cloture: ${fenceType}` : null,
    "",
    "Ouvre le CRM:",
    appUrl,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nouveau dossier assigné</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr><td style="background:#0f766e;padding:24px 32px;"><p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Clôture Impress CRM</p></td></tr>
        <tr><td style="padding:30px 32px;">
          <p style="margin:0 0 12px;font-size:18px;font-weight:600;color:#111827;">Bonjour ${firstName}</p>
          <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">Un nouveau dossier d'installation vient de t'être assigné.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;"><tr><td style="padding:14px 16px;">
            <p style="margin:0 0 6px;font-size:13px;color:#111827;"><strong>Client:</strong> ${clientName}</p>
            ${location ? `<p style="margin:0 0 6px;font-size:13px;color:#111827;"><strong>Ville:</strong> ${location}</p>` : ""}
            ${fenceType ? `<p style="margin:0;font-size:13px;color:#111827;"><strong>Type:</strong> ${fenceType}</p>` : ""}
          </td></tr></table>
          <table cellpadding="0" cellspacing="0"><tr><td style="background:#0f766e;border-radius:8px;">
            <a href="${appUrl}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Ouvrir dispatch installation</a>
          </td></tr></table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  if (BREVO_API_KEY) {
    try {
      const blockReason = await getBrevoBlockReason(to);
      if (blockReason) return { ok: false, error: `Destinataire bloque dans Brevo (${blockReason})` };
      const senderDomain = BREVO_SENDER_EMAIL.split("@")[1] || "clotureimpress.com";
      const messageId = `<installer-assigned.${Date.now()}.${Math.random().toString(36).slice(2)}@${senderDomain}>`;
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": BREVO_API_KEY },
        body: JSON.stringify({
          sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
          replyTo: { email: BREVO_REPLY_TO, name: BREVO_SENDER_NAME },
          to: [{ email: to, name: installerName }],
          subject,
          textContent,
          htmlContent: html,
          headers: {
            "X-Mailin-custom": "source:crm-installer-assignment|type:installer-assigned",
            "Message-ID": messageId,
          },
        }),
      });
      const payload = (await response.json()) as any;
      if (response.ok && payload?.messageId) return { ok: true, messageId: String(payload.messageId) };
    } catch {
      // Continue to SMTP fallback.
    }
  }

  if (!SMTP_PASS) return { ok: false, error: "SMTP_PASS not configured" };
  try {
    const info = await transporter.sendMail({ from: FROM, to, subject, html });
    return { ok: true, messageId: info.messageId };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}
