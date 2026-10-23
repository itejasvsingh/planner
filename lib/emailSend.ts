import nodemailer from 'nodemailer';

/**
 * Sends a plain email over SMTP (Gmail with an app password, Brevo, Resend's SMTP, any provider). Configured by
 * SMTP_HOST, SMTP_PORT (465 or 587), SMTP_USER, SMTP_PASS and EMAIL_FROM in Vercel; without them nothing is sent and
 * email sign-in says it isn't set up. Used for sign-in codes only.
 */
export const emailConfigured = () => !!(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (!emailConfigured()) return false;
  const port = Number(process.env.SMTP_PORT) || 465;
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST!.trim(),
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER!.trim(), pass: process.env.SMTP_PASS!.trim() },
    });
    await transport.sendMail({ from: (process.env.EMAIL_FROM || process.env.SMTP_USER)!.trim(), to, subject, text });
    return true;
  } catch (e) {
    console.warn('Email not sent:', (e as Error).message);
    return false;
  }
}
