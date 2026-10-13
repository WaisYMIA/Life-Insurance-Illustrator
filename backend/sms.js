/**
 * SMS provider abstraction.
 *
 * Per the project's standing development rule, anything that needs a live
 * external service in production gets a local, inspectable substitute for
 * development — so OTP codes can be built and tested end-to-end without a
 * paid SMS gateway or network access.
 *
 * SMS_PROVIDER env var selects the implementation:
 *   - 'console' (default) — the dev/test substitute. Writes the message to
 *     the sms_outbox table (so the admin panel / standalone dashboard can
 *     show "what would have been sent") and to stdout. This is the ONLY
 *     mode where the OTP code is ever handed back in an API response
 *     (devCode), specifically so tests and local development can read it
 *     without a real phone.
 *   - 'africastalking' — a real provider, for production use in Kenya.
 *     Needs AT_USERNAME and AT_API_KEY set. This makes a real outbound
 *     HTTPS call and will not work in a network-restricted dev sandbox —
 *     that's expected; it's meant to run where real egress is available.
 *
 * Adding another real provider (Twilio, etc.) means adding one more
 * function here and one more branch in sendSms — nothing else changes.
 */
'use strict';
const { db } = require('./db');

async function logOutbox(companyId, phone, message, provider, status, error){
  try{
    await db.prepare('INSERT INTO sms_outbox (company_id, phone, message, provider, status, error) VALUES (?,?,?,?,?,?)')
      .run(companyId || null, phone, message, provider, status, error || null);
  } catch(e){ /* outbox logging must never break the send path */ }
}

async function sendConsole(companyId, phone, message){
  console.log(`[SMS:console] to ${phone}: ${message}`);
  await logOutbox(companyId, phone, message, 'console', 'sent', null);
  return { provider: 'console', delivered: true };
}

async function sendAfricasTalking(companyId, phone, message){
  const username = process.env.AT_USERNAME;
  const apiKey = process.env.AT_API_KEY;
  if(!username || !apiKey){
    const err = 'AT_USERNAME / AT_API_KEY not configured';
    await logOutbox(companyId, phone, message, 'africastalking', 'failed', err);
    throw new Error(`SMS provider "africastalking" is not configured: ${err}`);
  }
  const base = process.env.AT_API_BASE || 'https://api.africastalking.com';
  const res = await fetch(`${base}/version1/messaging`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'apiKey': apiKey
    },
    body: new URLSearchParams({ username, to: phone, message }).toString()
  });
  const body = await res.json().catch(() => ({}));
  if(!res.ok){
    const err = `Africa's Talking responded ${res.status}: ${JSON.stringify(body)}`;
    await logOutbox(companyId, phone, message, 'africastalking', 'failed', err);
    throw new Error(err);
  }
  await logOutbox(companyId, phone, message, 'africastalking', 'sent', null);
  return { provider: 'africastalking', delivered: true, raw: body };
}

async function sendSms(companyId, phone, message){
  const provider = process.env.SMS_PROVIDER || 'console';
  if(provider === 'africastalking') return sendAfricasTalking(companyId, phone, message);
  return sendConsole(companyId, phone, message);
}

function currentProvider(){
  return process.env.SMS_PROVIDER || 'console';
}

module.exports = { sendSms, currentProvider };
