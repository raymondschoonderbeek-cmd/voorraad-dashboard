import { sendMailgunHtmlEmail } from '@/lib/send-welcome-email'

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'DRG Portal'
const DYNAMO_BLUE = '#2D457C'
const SUPPORT_EMAIL = 'support@dynamoretailgroup.com'

function emailBase(inhoud: string): string {
  return `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:system-ui,-apple-system,Arial,sans-serif;line-height:1.6;color:#1e293b;background:#f0f3f8;margin:0;padding:0}
  .wrap{max-width:540px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(45,69,124,.10)}
  .hdr{background:${DYNAMO_BLUE};padding:24px 32px;color:#fff}
  .hdr h1{margin:0;font-size:20px;font-weight:700;letter-spacing:-.01em}
  .hdr p{margin:4px 0 0;font-size:13px;opacity:.7}
  .body{padding:28px 32px}
  .field{margin-bottom:14px}
  .label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(45,69,124,.5);margin-bottom:2px}
  .value{font-size:15px;color:#1e293b}
  .motivatie{background:#f8fafc;border-left:3px solid ${DYNAMO_BLUE};padding:12px 16px;border-radius:0 8px 8px 0;font-size:14px;color:#334155;margin:16px 0}
  .btn{display:inline-block;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;margin:6px 8px 6px 0}
  .btn-groen{background:#16a34a;color:#fff}
  .btn-rood{background:#dc2626;color:#fff}
  .btn-blauw{background:${DYNAMO_BLUE};color:#fff}
  .status-badge{display:inline-block;padding:4px 12px;border-radius:99px;font-size:13px;font-weight:700}
  .badge-ok{background:#dcfce7;color:#15803d}
  .badge-nok{background:#fee2e2;color:#b91c1c}
  .footer{background:#f8fafc;padding:16px 32px;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0}
</style>
</head>
<body><div class="wrap">${inhoud}<div class="footer">${APP_NAME} · Dit is een automatisch bericht</div></div></body>
</html>`
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
    <div class="hdr">
      <h1>Softwareaanvraag ter goedkeuring</h1>
      <p>${APP_NAME}</p>
    </div>
    <div class="body">
      <p>Hallo ${opts.managerNaam},</p>
      <p><strong>${opts.aanvragerNaam}</strong> heeft een aanvraag ingediend voor:</p>

      <div class="field"><div class="label">Product / Licentie</div><div class="value"><strong>${opts.productNaam}</strong></div></div>
      <div class="field"><div class="label">Medewerker</div><div class="value">${opts.aanvragerNaam} &lt;${opts.aanvragerEmail}&gt;</div></div>
      ${opts.motivatie ? `<div class="label" style="margin-bottom:4px">Motivatie</div><div class="motivatie">${opts.motivatie}</div>` : ''}

      <p style="margin-top:24px">Klik op een knop om te beslissen:</p>
      <div>
        <a href="${opts.goedkeurUrl}" class="btn btn-groen">✓ Goedkeuren</a>
        <a href="${opts.afkeurUrl}" class="btn btn-rood">✗ Afkeuren</a>
      </div>
      <p style="margin-top:20px;font-size:13px;color:#64748b">
        Deze links zijn geldig tot <strong>${verloopdatum}</strong>.<br>
        Een beslissing kan maar één keer worden gemaakt.
      </p>
    </div>
  `)
  await sendMailgunHtmlEmail({
    to: opts.managerEmail,
    subject: `Softwareaanvraag van ${opts.aanvragerNaam} — ${opts.productNaam}`,
    html,
  })
}

/** Bevestigingsmail aan medewerker: aanvraag ontvangen */
export async function stuurAanvragerBevestigingMail(opts: {
  aanvragerEmail: string
  aanvragerNaam: string
  productNaam: string
  managerNaam: string | null
}): Promise<void> {
  const html = emailBase(`
    <div class="hdr">
      <h1>Aanvraag ontvangen</h1>
      <p>${APP_NAME}</p>
    </div>
    <div class="body">
      <p>Hallo ${opts.aanvragerNaam},</p>
      <p>Je aanvraag voor <strong>${opts.productNaam}</strong> is ingediend en wacht op goedkeuring${opts.managerNaam ? ` van <strong>${opts.managerNaam}</strong>` : ''}.</p>
      <p>Je ontvangt een bericht zodra er een beslissing is genomen.</p>
      <p style="margin-top:24px;font-size:13px;color:#64748b">Je kunt je aanvragen bekijken via <strong>Instellingen → Mijn aanvragen</strong> in het portaal.</p>
    </div>
  `)
  await sendMailgunHtmlEmail({
    to: opts.aanvragerEmail,
    subject: `Aanvraag ingediend: ${opts.productNaam}`,
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
  const html = emailBase(`
    <div class="hdr">
      <h1>Softwareaanvraag ${isOk ? 'goedgekeurd' : 'afgekeurd'}</h1>
      <p>${APP_NAME}</p>
    </div>
    <div class="body">
      <p>Er is een beslissing genomen over een softwareaanvraag:</p>

      <div class="field"><div class="label">Status</div>
        <div class="value"><span class="status-badge ${isOk ? 'badge-ok' : 'badge-nok'}">${isOk ? '✓ Goedgekeurd' : '✗ Afgekeurd'}</span></div>
      </div>
      <div class="field"><div class="label">Product / Licentie</div><div class="value"><strong>${opts.productNaam}</strong></div></div>
      <div class="field"><div class="label">Medewerker</div><div class="value">${opts.aanvragerNaam} &lt;${opts.aanvragerEmail}&gt;</div></div>
      <div class="field"><div class="label">Besloten door</div><div class="value">${opts.managerNaam ?? 'Onbekend'}</div></div>
      ${opts.managerNotitie ? `<div class="label" style="margin-bottom:4px">Notitie manager</div><div class="motivatie">${opts.managerNotitie}</div>` : ''}
      <div class="field" style="margin-top:16px"><div class="label">Aanvraag ID</div><div class="value" style="font-family:monospace;font-size:13px">${opts.aanvraagId}</div></div>

      ${isOk ? `<p style="margin-top:20px">Actie vereist: koppel de licentie aan de medewerker in het portaal.</p>` : ''}
    </div>
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
  const html = emailBase(`
    <div class="hdr">
      <h1>Aanvraag ${isOk ? 'goedgekeurd' : 'afgekeurd'}</h1>
      <p>${APP_NAME}</p>
    </div>
    <div class="body">
      <p>Hallo ${opts.aanvragerNaam},</p>
      <p>Je aanvraag voor <strong>${opts.productNaam}</strong> is <span class="status-badge ${isOk ? 'badge-ok' : 'badge-nok'}">${isOk ? '✓ goedgekeurd' : '✗ afgekeurd'}</span>.</p>
      ${opts.managerNotitie ? `<div class="label" style="margin-bottom:4px;margin-top:16px">Opmerking van je manager</div><div class="motivatie">${opts.managerNotitie}</div>` : ''}
      ${isOk ? '<p style="margin-top:16px">Support zal de licentie zo snel mogelijk voor je activeren.</p>' : '<p style="margin-top:16px">Als je vragen hebt, neem contact op met je manager of support.</p>'}
    </div>
  `)
  await sendMailgunHtmlEmail({
    to: opts.aanvragerEmail,
    subject: `Aanvraag ${isOk ? 'goedgekeurd' : 'afgekeurd'}: ${opts.productNaam}`,
    html,
  })
}
