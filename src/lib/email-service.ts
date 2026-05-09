// Email notifications for Hpersona.
//
// We don't talk to Brevo directly. We share the Firebase project (ikamba-1c669)
// with IkambaVPN, which has a Cloud Function (`sendMailOnCreate`) watching the
// `mail` collection. It does Brevo API → MailerSend SMTP → Brevo SMTP failover
// for free, so we just write a doc to that collection and the email is sent.
//
// Doc shape expected by the Cloud Function:
//   { to: ["addr@example.com"], message: { subject, html, text },
//     createdAt: ISO string, source: "hpersona", tag: "..." }

import { adminDb } from './firebase-admin';

const FROM_NAME = 'Hpersona';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://ikambaai.com';

interface SendMailOpts {
  to: string[];
  subject: string;
  html: string;
  text: string;
  tag?: string;
}

async function writeMail(opts: SendMailOpts): Promise<void> {
  const valid = opts.to.filter((a) => a && a.includes('@'));
  if (!valid.length) return;
  const db = adminDb();
  await Promise.all(
    valid.map((address) =>
      db.collection('mail').add({
        to: [address],
        message: {
          subject: opts.subject,
          html: opts.html,
          text: opts.text,
        },
        createdAt: new Date().toISOString(),
        source: 'hpersona',
        tag: opts.tag || 'hpersona',
      })
    )
  );
}

// ── Template helpers ──────────────────────────────────────────────────────────

function baseTemplate(title: string, body: string): string {
  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
  <div style="background:#000000;padding:20px 24px;text-align:center;">
    <h2 style="color:#ffffff;margin:0;font-size:18px;font-weight:700;">${FROM_NAME}</h2>
    <p style="color:#999999;margin:4px 0 0;font-size:13px;">${title}</p>
  </div>
  <div style="padding:28px 24px;">${body}</div>
  <div style="background:#f8f8f8;padding:16px 24px;text-align:center;">
    <p style="color:#999999;font-size:12px;margin:0;">&copy; ${new Date().getFullYear()} ${FROM_NAME} &mdash; All rights reserved.</p>
  </div>
</div>`.trim();
}

function tableRow(label: string, value: string): string {
  return `
  <tr>
    <td style="padding:8px 0;color:#666666;font-size:13px;width:40%;">${label}</td>
    <td style="padding:8px 0;font-size:13px;font-weight:600;color:#000000;">${value}</td>
  </tr>`;
}

function ctaButton(label: string, url: string): string {
  return `
  <div style="margin-top:24px;text-align:center;">
    <a href="${url}" style="background:#10b981;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;display:inline-block;">${label}</a>
  </div>`;
}

// ── Admin recipient resolution ────────────────────────────────────────────────

async function getAdminEmails(): Promise<string[]> {
  const emails = new Set<string>();
  const db = adminDb();

  // 1. appdata/roleCache (maintained by Blink-1 / shared admin tooling)
  try {
    const snap = await db.collection('appdata').doc('roleCache').get();
    if (snap.exists) {
      const d = snap.data() || {};
      const all = ([] as Array<{ email?: string; notificationsDisabled?: boolean }>)
        .concat(d.admins || [])
        .concat(d.agents || []);
      for (const e of all) {
        if (e?.email && !e.notificationsDisabled) emails.add(e.email.toLowerCase().trim());
      }
    }
  } catch {
    /* ignore */
  }

  // 2. notification_recipients collection (shared)
  try {
    const snap = await db
      .collection('notification_recipients')
      .where('enabled', '==', true)
      .get();
    snap.docs.forEach((doc) => {
      const e = doc.get('email') as string | undefined;
      if (e) emails.add(e.toLowerCase().trim());
    });
  } catch {
    /* ignore */
  }

  // 3. users with role admin (Hpersona's own collection from src/lib/admin.ts)
  try {
    const snap = await db.collection('users').where('role', '==', 'admin').limit(20).get();
    snap.docs.forEach((doc) => {
      const e = doc.get('email') as string | undefined;
      if (e) emails.add(e.toLowerCase().trim());
    });
  } catch {
    /* ignore */
  }

  return Array.from(emails).filter((e) => e.includes('@'));
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function notifyUserProActivated(opts: {
  email: string;
  displayName?: string;
  proUntil: number;
  amount: number;
  currency: string;
  orderId: string;
}): Promise<void> {
  if (!opts.email) return;
  const expires = new Date(opts.proUntil).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const body = `
    <h3 style="color:#000000;margin-top:0;">Welcome to Hpersona Pro 🎉</h3>
    <p style="color:#666666;font-size:13px;">
      Hi ${opts.displayName || 'there'}, your payment was received and your Pro subscription is now active.
      You can humanize unlimited words for the next 30 days.
    </p>
    <table style="width:100%;border-collapse:collapse;">
      ${tableRow('Plan', 'Hpersona Pro — Monthly')}
      ${tableRow('Amount', `${opts.currency} ${opts.amount.toFixed(2)}`)}
      ${tableRow('Active until', expires)}
      ${tableRow('Order ID', opts.orderId)}
    </table>
    ${ctaButton('Open Humanizer', `${APP_URL}/humanizer`)}
  `;
  try {
    await writeMail({
      to: [opts.email],
      subject: '✅ Hpersona Pro is now active',
      html: baseTemplate('Pro Activated', body),
      text: `Welcome to Hpersona Pro!\nAmount: ${opts.currency} ${opts.amount}\nActive until: ${expires}\nOrder: ${opts.orderId}\n\nOpen the humanizer: ${APP_URL}/humanizer`,
      tag: 'hpersona-pro-activated',
    });
  } catch (err) {
    console.error('[email] notifyUserProActivated failed:', err);
  }
}

export async function notifyAdminsCreditRequest(opts: {
  uid: string;
  email: string;
  displayName?: string;
  message: string;
  requestedLimit: number | null; // null = unlimited
}): Promise<void> {
  try {
    const admins = await getAdminEmails();
    if (!admins.length) return;
    const want =
      opts.requestedLimit === null
        ? 'Unlimited words'
        : `${opts.requestedLimit.toLocaleString()} words`;
    const body = `
      <h3 style="color:#000000;margin-top:0;">New humanizer credit request</h3>
      <table style="width:100%;border-collapse:collapse;">
        ${tableRow('User', opts.displayName || opts.email)}
        ${tableRow('Email', opts.email)}
        ${tableRow('UID', opts.uid)}
        ${tableRow('Requested', want)}
      </table>
      <p style="color:#666666;font-size:13px;margin-top:16px;"><strong>Message:</strong></p>
      <p style="color:#000000;font-size:13px;background:#f8f8f8;padding:12px;border-radius:8px;white-space:pre-wrap;">${
        opts.message ? escapeHtml(opts.message) : '(no message)'
      }</p>
      ${ctaButton('Open Admin Dashboard', `${APP_URL}/admin`)}
    `;
    await writeMail({
      to: admins,
      subject: `🔔 Hpersona — credit request from ${opts.email}`,
      html: baseTemplate('Credit Request', body),
      text: `New credit request from ${opts.email} (${opts.uid}). Requested: ${want}. Message: ${opts.message || '(none)'}\n\nOpen: ${APP_URL}/admin`,
      tag: 'hpersona-credit-request',
    });
  } catch (err) {
    console.error('[email] notifyAdminsCreditRequest failed:', err);
  }
}

export async function notifyUserRequestDecision(opts: {
  email: string;
  displayName?: string;
  decision: 'approved' | 'denied';
  newLimit?: number;
  unlimited?: boolean;
}): Promise<void> {
  if (!opts.email) return;
  const approved = opts.decision === 'approved';
  const subject = approved
    ? '✅ Hpersona — your credit request was approved'
    : 'Hpersona — your credit request was reviewed';
  const detail = approved
    ? opts.unlimited
      ? 'You now have <strong>unlimited</strong> humanizer words.'
      : `Your new word budget is <strong>${(opts.newLimit ?? 0).toLocaleString()} words</strong>.`
    : 'Unfortunately we could not approve your request at this time. You can keep using the free word budget or upgrade to Pro for unlimited usage.';
  const body = `
    <h3 style="color:#000000;margin-top:0;">${approved ? 'Request approved' : 'Request reviewed'}</h3>
    <p style="color:#666666;font-size:13px;">Hi ${opts.displayName || 'there'},</p>
    <p style="color:#000000;font-size:13px;">${detail}</p>
    ${ctaButton('Open Humanizer', `${APP_URL}/humanizer`)}
  `;
  try {
    await writeMail({
      to: [opts.email],
      subject,
      html: baseTemplate(approved ? 'Request Approved' : 'Request Reviewed', body),
      text: approved
        ? `Your credit request was approved.${opts.unlimited ? ' Unlimited words.' : ` New limit: ${opts.newLimit}.`}\n\n${APP_URL}/humanizer`
        : `Your credit request was not approved at this time. Visit ${APP_URL}/humanizer to upgrade to Pro.`,
      tag: 'hpersona-request-decision',
    });
  } catch (err) {
    console.error('[email] notifyUserRequestDecision failed:', err);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
