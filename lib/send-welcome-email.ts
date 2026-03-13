import FormData from 'form-data'
import Mailgun from 'mailgun.js'

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Voorraad Dashboard'

function getMailgunClient() {
  const key = process.env.MAILGUN_API_KEY
  const domain = process.env.MAILGUN_DOMAIN
  if (!key || !domain) return null
  const mailgun = new Mailgun(FormData)
  const isEu = process.env.MAILGUN_EU === 'true' || process.env.MAILGUN_EU === '1'
  return {
    client: mailgun.client({
      username: 'api',
      key,
      url: isEu ? 'https://api.eu.mailgun.net' : undefined,
    }),
    domain,
  }
}

const FROM = process.env.MAILGUN_FROM_EMAIL ?? 'Voorraad Dashboard <noreply@mailgun.org>'

export async function sendWelcomeEmail(params: {
  to: string
  naam: string
  wachtwoord: string
  loginUrl: string
  rol?: string
}): Promise<{ ok: boolean; error?: string }> {
  const mg = getMailgunClient()
  if (!mg) {
    return { ok: false, error: 'MAILGUN_API_KEY of MAILGUN_DOMAIN niet geconfigureerd' }
  }
  const isLunch = params.rol === 'lunch'
  const subject = isLunch ? `Welkom bij ${APP_NAME} – lunch bestellen` : `Welkom bij ${APP_NAME} – je inloggegevens`
  const intro = isLunch
    ? 'Er is een account voor je aangemaakt om broodjes te bestellen voor op kantoor. Je kunt inloggen met onderstaande gegevens:'
    : 'Er is een account voor je aangemaakt. Je kunt inloggen met onderstaande gegevens:'
  try {
    await mg.client.messages.create(mg.domain, {
      from: FROM,
      to: [params.to],
      subject,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.6;color:#1a1a1a;max-width:520px;margin:0 auto;padding:24px;">
  <h1 style="font-size:1.5rem;margin-bottom:16px;">Welkom bij ${APP_NAME}</h1>
  <p>Hallo ${params.naam || params.to},</p>
  <p>${intro}</p>
  <p style="background:#f5f5f5;padding:16px;border-radius:8px;margin:20px 0;">
    <strong>E-mail:</strong> ${params.to}<br>
    <strong>Wachtwoord:</strong> <code style="background:#e5e5e5;padding:2px 6px;border-radius:4px;">${params.wachtwoord}</code>
  </p>
  <p><strong>Let op:</strong> Na je eerste inlog moet je je wachtwoord wijzigen.</p>
  <p><a href="${params.loginUrl}" style="display:inline-block;background:#2D457C;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;margin-top:8px;">Inloggen</a></p>
  <p style="margin-top:24px;font-size:0.875rem;color:#666;">Als je dit niet verwachtte, neem contact op met je beheerder.</p>
</body>
</html>
      `.trim(),
    })
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'E-mail versturen mislukt'
    return { ok: false, error: msg }
  }
}
