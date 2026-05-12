import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "ClôturePro CRM <noreply@clotureimpress.com>";

if (!process.env.RESEND_API_KEY) {
  console.warn("[email] WARNING: RESEND_API_KEY is not set — invite emails will NOT be sent.");
}

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
) {
  const roleLabel = ROLE_LABELS[role] ?? role;
  const firstName = name.split(" ")[0];

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: "Finalise la création de ton compte — ClôturePro CRM",
    html: `
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
</html>`,
  });

  if (error) {
    // Log but don't throw — user creation should not fail if email fails
    console.error("[email] Failed to send invite to", to, ":", JSON.stringify(error));
  } else {
    console.log("[email] Invite sent successfully to", to);
  }
}
