import { Resend } from 'resend';
import { config } from '../config.js';

const resend = new Resend(config.RESEND_API_KEY);

/**
 * Envoie le lien magique de connexion au portail Snapshot Media.
 * Même fournisseur (Resend) et même logique que snapshot-offres.
 */
export async function sendMagicLink(email: string, url: string): Promise<void> {
  const html = `<!DOCTYPE html>
<html lang="fr">
  <body style="margin:0;background:#ECECEC;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0B0B0B;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#ECECEC;padding:32px 0;">
      <tr><td align="center">
        <table width="440" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid #EAEAEA;border-radius:20px;padding:34px 32px;">
          <tr><td>
            <div style="font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#ED5847;">Snapshot Media</div>
            <h1 style="font-size:22px;margin:14px 0 6px;letter-spacing:-.02em;">Votre lien de connexion</h1>
            <p style="font-size:14px;line-height:1.6;color:#4A4D54;margin:0 0 24px;">
              Cliquez sur le bouton ci-dessous pour accéder au tableau de bord.
              Ce lien expire dans ${config.MAGIC_LINK_TTL_MINUTES} minutes et ne fonctionne qu'une seule fois.
            </p>
            <a href="${url}" style="display:inline-block;background:#ED5847;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:14px;padding:13px 22px;border-radius:10px;">Se connecter</a>
            <p style="font-size:12px;line-height:1.6;color:#8A8A8A;margin:24px 0 0;">
              Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  await resend.emails.send({
    from: `${config.EMAIL_FROM_NAME} <${config.EMAIL_FROM}>`,
    to: email,
    subject: 'Votre lien de connexion — Snapshot Media',
    html,
  });
}
