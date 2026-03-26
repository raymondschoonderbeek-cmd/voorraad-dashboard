import formData from 'form-data'
import Mailgun from 'mailgun.js'

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function sendMailgunEmail(opts: {
  to: string
  subject: string
  html: string
  text?: string
}): Promise<void> {
  const key = process.env.MAILGUN_API_KEY?.trim()
  const domain = process.env.MAILGUN_DOMAIN?.trim()
  const from = process.env.MAILGUN_FROM?.trim()
  if (!key || !domain || !from) {
    throw new Error('Mailgun niet geconfigureerd: zet MAILGUN_API_KEY, MAILGUN_DOMAIN en MAILGUN_FROM in .env')
  }

  const mailgun = new Mailgun(formData)
  const isEu = process.env.MAILGUN_REGION?.toLowerCase() === 'eu'
  const mg = mailgun.client({
    username: 'api',
    key,
    ...(isEu ? { url: 'https://api.eu.mailgun.net' } : {}),
  })

  await mg.messages.create(domain, {
    from,
    to: [opts.to],
    subject: opts.subject,
    html: opts.html,
    text: opts.text ?? stripTags(opts.html),
  })
}
