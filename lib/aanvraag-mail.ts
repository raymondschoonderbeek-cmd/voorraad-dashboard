import { sendMailgunHtmlEmail } from '@/lib/send-welcome-email'

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'DRG Portal'
const DYNAMO_BLUE = '#2D457C'
const SUPPORT_EMAIL = 'support@dynamoretailgroup.com'

/**
 * Outlook-compatibele e-mailbase.
 * Gebruikt table-layout en volledig inline styles — geen <style> blok, geen CSS klassen.
 * Outlook (2007-2021) gebruikt Word als HTML-renderer en ondersteunt alleen inline CSS + tables.
 */
function emailBase(inhoud: string): string {
  return `<!DOCTYPE html>
<html lang="nl" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <title>${APP_NAME}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f3f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f3f8;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="540" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;width:100%;background-color:#ffffff;border-radius:8px;">
          ${inhoud}
          <tr>
            <td style="padding:16px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;font-family:Arial,sans-serif;">
              ${APP_NAME} &middot; Dit is een automatisch bericht
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function hdr(titel: string): string {
  return `<tr>
    <td style="background-color:${DYNAMO_BLUE};padding:24px 32px;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;font-family:Arial,sans-serif;">${titel}</h1>
      <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.7);font-family:Arial,sans-serif;">${APP_NAME}</p>
    </td>
  </tr>`
}

function veld(label: string, waarde: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
    <tr><td style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#8094bc;font-family:Arial,sans-serif;padding-bottom:2px;">${label}</td></tr>
    <tr><td style="font-size:15px;color:#1e293b;font-family:Arial,sans-serif;">${waarde}</td></tr>
  </table>`
}

function motivatieBlok(tekst: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
    <tr>
      <td style="background-color:#f8fafc;border-left:3px solid ${DYNAMO_BLUE};padding:12px 16px;font-size:14px;color:#334155;font-family:Arial,sans-serif;">
        ${tekst}
      </td>
    </tr>
  </table>`
}

/** Bevestigingsmail aan medewerker: aanvraag ontvangen */
export async function stuurAanvragerBevestigingMail(opts: {
  aanvragerEmail: string
  aanvragerNaam: string
  productNaam: string
  managerNaam: string | null
}): Promise<void> {
  const html = emailBase(`
    ${hdr('Aanvraag ontvangen')}
    <tr>
      <td style="padding:28px 32px;font-family:Arial,sans-serif;color:#1e293b;">
        <p style="margin:0 0 16px;font-size:15px;">Hallo ${opts.aanvragerNaam},</p>
        <p style="margin:0 0 16px;font-size:15px;">Je aanvraag voor <strong>${opts.productNaam}</strong> is ingediend en wacht op goedkeuring${opts.managerNaam ? ` van <strong>${opts.managerNaam}</strong>` : ''}.</p>
        <p style="margin:0 0 16px;font-size:15px;">Je ontvangt een bericht zodra er een beslissing is genomen.</p>
        <p style="margin:24px 0 0;font-size:13px;color:#64748b;">Je kunt je aanvragen bekijken via <strong>Instellingen &rarr; Mijn aanvragen</strong> in het portaal.</p>
      </td>
    </tr>
  `)
  await sendMailgunHtmlEmail({
    to: opts.aanvragerEmail,
    subject: `Aanvraag ingediend: ${opts.productNaam}`,
    html,
  })
}

/** Mail aan manager: goedkeuren / afkeuren */
export async function stuurManagerApprovalMail(opts: {
  managerEmail: string
  managerNaam: string
  aanvragerNaam: string
  aanvragerEmail: string
  productNaam: string
  motivatie: string | null
  goedkeurUrl: string
  afkeurUrl: string
  verlooptOp: Date
}): Promise<void> {
  const verloopdatum = opts.verlooptOp.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
  const html = emailBase(`
    ${hdr('Softwareaanvraag ter goedkeuring')}
    <tr>
      <td style="padding:28px 32px;font-family:Arial,sans-serif;color:#1e293b;">
        <p style="margin:0 0 16px;font-size:15px;">Hallo ${opts.managerNaam},</p>
        <p style="margin:0 0 20px;font-size:15px;"><strong>${opts.aanvragerNaam}</strong> heeft een aanvraag ingediend voor:</p>
        ${veld('Product / Licentie', `<strong>${opts.productNaam}</strong>`)}
        ${veld('Medewerker', `${opts.aanvragerNaam} &lt;${opts.aanvragerEmail}&gt;`)}
        ${opts.motivatie ? `<p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#8094bc;font-family:Arial,sans-serif;">Motivatie</p>${motivatieBlok(opts.motivatie)}` : ''}
        <p style="margin:24px 0 12px;font-size:15px;">Klik op een knop om te beslissen:</p>
        <table cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding-right:8px;">
              <a href="${opts.goedkeurUrl}" style="display:inline-block;padding:13px 28px;background-color:#16a34a;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;font-family:Arial,sans-serif;border-radius:6px;">&#10003; Goedkeuren</a>
            </td>
            <td>
              <a href="${opts.afkeurUrl}" style="display:inline-block;padding:13px 28px;background-color:#dc2626;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;font-family:Arial,sans-serif;border-radius:6px;">&#10007; Afkeuren</a>
            </td>
          </tr>
        </table>
        <p style="margin:20px 0 0;font-size:13px;color:#64748b;">Deze links zijn geldig tot <strong>${verloopdatum}</strong>.<br>Een beslissing kan maar één keer worden gemaakt.</p>
      </td>
    </tr>
  `)
  await sendMailgunHtmlEmail({
    to: opts.managerEmail,
    subject: `Softwareaanvraag van ${opts.aanvragerNaam} — ${opts.productNaam}`,
    html,
  })
}

/** Mail aan support na beslissing */
export async function stuurSupportBeslissingMail(opts: {
  aanvragerNaam: string
  aanvragerEmail: string
  productNaam: string
  beslissing: 'goedgekeurd' | 'afgekeurd'
  managerNaam: string | null
  managerNotitie: string | null
  aanvraagId: string
}): Promise<void> {
  const isOk = opts.beslissing === 'goedgekeurd'
  const badgeStijl = isOk
    ? 'display:inline-block;padding:4px 12px;border-radius:99px;font-size:13px;font-weight:700;background-color:#dcfce7;color:#15803d;'
    : 'display:inline-block;padding:4px 12px;border-radius:99px;font-size:13px;font-weight:700;background-color:#fee2e2;color:#b91c1c;'
  const html = emailBase(`
    ${hdr(`Softwareaanvraag ${isOk ? 'goedgekeurd' : 'afgekeurd'}`)}
    <tr>
      <td style="padding:28px 32px;font-family:Arial,sans-serif;color:#1e293b;">
        <p style="margin:0 0 20px;font-size:15px;">Er is een beslissing genomen over een softwareaanvraag:</p>
        ${veld('Status', `<span style="${badgeStijl}">${isOk ? '&#10003; Goedgekeurd' : '&#10007; Afgekeurd'}</span>`)}
        ${veld('Product / Licentie', `<strong>${opts.productNaam}</strong>`)}
        ${veld('Medewerker', `${opts.aanvragerNaam} &lt;${opts.aanvragerEmail}&gt;`)}
        ${veld('Besloten door', opts.managerNaam ?? 'Onbekend')}
        ${opts.managerNotitie ? `<p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#8094bc;">Notitie manager</p>${motivatieBlok(opts.managerNotitie)}` : ''}
        ${veld('Aanvraag ID', `<span style="font-family:Courier New,monospace;font-size:13px;">${opts.aanvraagId}</span>`)}
        ${isOk ? '<p style="margin:20px 0 0;font-size:15px;">Actie vereist: koppel de licentie aan de medewerker in het portaal.</p>' : ''}
      </td>
    </tr>
  `)
  await sendMailgunHtmlEmail({
    to: SUPPORT_EMAIL,
    subject: `[${isOk ? 'GOEDGEKEURD' : 'AFGEKEURD'}] ${opts.productNaam} voor ${opts.aanvragerNaam}`,
    html,
  })
}

/** Mail aan medewerker na beslissing */
export async function stuurAanvragerBeslissingMail(opts: {
  aanvragerEmail: string
  aanvragerNaam: string
  productNaam: string
  beslissing: 'goedgekeurd' | 'afgekeurd'
  managerNotitie: string | null
}): Promise<void> {
  const isOk = opts.beslissing === 'goedgekeurd'
  const badgeStijl = isOk
    ? 'display:inline-block;padding:4px 12px;border-radius:99px;font-size:13px;font-weight:700;background-color:#dcfce7;color:#15803d;'
    : 'display:inline-block;padding:4px 12px;border-radius:99px;font-size:13px;font-weight:700;background-color:#fee2e2;color:#b91c1c;'
  const html = emailBase(`
    ${hdr(`Aanvraag ${isOk ? 'goedgekeurd' : 'afgekeurd'}`)}
    <tr>
      <td style="padding:28px 32px;font-family:Arial,sans-serif;color:#1e293b;">
        <p style="margin:0 0 16px;font-size:15px;">Hallo ${opts.aanvragerNaam},</p>
        <p style="margin:0 0 16px;font-size:15px;">Je aanvraag voor <strong>${opts.productNaam}</strong> is <span style="${badgeStijl}">${isOk ? '&#10003; goedgekeurd' : '&#10007; afgekeurd'}</span>.</p>
        ${opts.managerNotitie ? `<p style="margin:16px 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#8094bc;">Opmerking van je manager</p>${motivatieBlok(opts.managerNotitie)}` : ''}
        ${isOk
          ? '<p style="margin:16px 0 0;font-size:15px;">Support zal de licentie zo snel mogelijk voor je activeren.</p>'
          : '<p style="margin:16px 0 0;font-size:15px;">Als je vragen hebt, neem contact op met je manager of support.</p>'}
      </td>
    </tr>
  `)
  await sendMailgunHtmlEmail({
    to: opts.aanvragerEmail,
    subject: `Aanvraag ${isOk ? 'goedgekeurd' : 'afgekeurd'}: ${opts.productNaam}`,
    html,
  })
}
