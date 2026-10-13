/**
 * Email provider abstraction — same pattern as backend/sms.js.
 *
 * EMAIL_PROVIDER env var selects the implementation:
 *   - 'console' (default) — the dev/test substitute. Writes the email to
 *     the email_outbox table (visible nowhere in the UI yet, but queryable
 *     for debugging/tests) and to stdout. This is the ONLY mode where a
 *     password-reset token is ever handed back in an API response
 *     (devResetToken), specifically so tests and local development can
 *     complete the reset flow without a real mailbox.
 *   - 'smtp' (a real provider) — sends through any SMTP server (Gmail,
 *     SendGrid's SMTP relay, Mailgun, your own mail server, etc.) via
 *     nodemailer. Needs SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and
 *     EMAIL_FROM set. Makes a real network connection and will not work
 *     from a network-restricted dev sandbox — expected, it's meant for a
 *     real production host.
 */
'use strict';
const { db } = require('./db');

async function logOutbox(companyId, toEmail, subject, body, provider, status, error){
  try{
    await db.prepare('INSERT INTO email_outbox (company_id, to_email, subject, body, provider, status, error) VALUES (?,?,?,?,?,?,?)')
      .run(companyId || null, toEmail, subject, body, provider, status, error || null);
  } catch(e){ /* outbox logging must never break the send path */ }
}

async function sendConsole(companyId, toEmail, subject, body){
  console.log(`[EMAIL:console] to ${toEmail} — ${subject}\n${body}`);
  await logOutbox(companyId, toEmail, subject, body, 'console', 'sent', null);
  return { provider: 'console', delivered: true };
}

async function sendSmtp(companyId, toEmail, subject, body){
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;
  if(!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM){
    const err = 'SMTP_HOST/SMTP_USER/SMTP_PASS/EMAIL_FROM not fully configured';
    await logOutbox(companyId, toEmail, subject, body, 'smtp', 'failed', err);
    throw new Error(`Email provider "smtp" is not configured: ${err}`);
  }
  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  try {
    await transport.sendMail({ from: EMAIL_FROM, to: toEmail, subject, text: body });
    await logOutbox(companyId, toEmail, subject, body, 'smtp', 'sent', null);
    return { provider: 'smtp', delivered: true };
  } catch(e){
    await logOutbox(companyId, toEmail, subject, body, 'smtp', 'failed', e.message);
    throw e;
  }
}

async function sendEmail(companyId, toEmail, subject, body){
  const provider = process.env.EMAIL_PROVIDER || 'console';
  if(provider === 'smtp') return sendSmtp(companyId, toEmail, subject, body);
  return sendConsole(companyId, toEmail, subject, body);
}

function currentProvider(){
  return process.env.EMAIL_PROVIDER || 'console';
}

module.exports = { sendEmail, currentProvider };
