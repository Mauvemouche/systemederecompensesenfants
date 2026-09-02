"use strict";

const { t, normalizeLocale, bcp47 } = require("./i18n");

const DEFAULT_REPLY_TO = "contact@kidsrewardsystem.com";

function emailConfigured() {
  return !!(String(process.env.EMAIL_USER || "").trim() && String(process.env.EMAIL_PASSWORD || "").trim());
}

function mailFromAddress() {
  return String(process.env.EMAIL_FROM || "").trim() || String(process.env.EMAIL_USER || "").trim();
}

function mailReplyTo() {
  return (
    String(process.env.EMAIL_REPLY_TO || "").trim() ||
    String(process.env.EMAIL_FROM || "").trim() ||
    DEFAULT_REPLY_TO
  );
}

function customSmtpHost() {
  return String(process.env.EMAIL_SMTP_HOST || "").trim();
}

function mailTransportOptions() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;
  const host = customSmtpHost();
  if (host) {
    // Proton SMTP tokens require a paid plan + custom domain address, not @proton.me.
    const portNum = Number(process.env.EMAIL_SMTP_PORT);
    const port = Number.isFinite(portNum) && portNum > 0 ? portNum : 587;
    return {
      host,
      port,
      secure: false,
      requireTLS: true,
      auth: { user, pass },
    };
  }
  return {
    service: "gmail",
    auth: { user, pass },
  };
}

/** Proton rejects a non-ASCII display-name From. Gmail fallback keeps "Name" <addr>. */
function mailFromHeader(locale) {
  const fromAddr = mailFromAddress();
  if (customSmtpHost()) return fromAddr;
  const fromName = t(locale, "email.fromName");
  return `"${fromName}" <${fromAddr}>`;
}

function mailSendOptions({ to, subject, html, text, locale }) {
  const fromAddr = mailFromAddress();
  const options = {
    from: mailFromHeader(locale),
    replyTo: mailReplyTo(),
    to,
    subject,
    html,
    text,
  };
  if (customSmtpHost()) {
    options.envelope = { from: fromAddr, to };
  }
  return options;
}

function scrubMailLogValue(value) {
  if (value == null || value === "") return undefined;
  let s = typeof value === "string" ? value : String(value);
  const secrets = [process.env.EMAIL_PASSWORD].filter((part) => String(part || "").trim());
  for (const secret of secrets) {
    if (secret && s.includes(secret)) s = s.split(secret).join("[redacted]");
  }
  return s;
}

function safeMailErrorSummary(err) {
  const src = err && typeof err === "object" ? err : { message: err };
  const summary = {};
  for (const field of ["code", "command", "response", "responseCode", "message"]) {
    if (src[field] == null || src[field] === "") continue;
    summary[field] = typeof src[field] === "number" ? src[field] : scrubMailLogValue(src[field]);
  }
  return summary;
}

function logMailFailure(label, err) {
  console.error(label, safeMailErrorSummary(err));
}

function missingEmailMessage(locale) {
  return t(locale, "err.emailNotConfigured");
}

function requireEmailConfigured(locale) {
  if (!emailConfigured()) {
    const err = new Error(missingEmailMessage(locale));
    err.code = "EMAIL_NOT_CONFIGURED";
    throw err;
  }
}

async function sendMail({ to, subject, html, text, locale }) {
  requireEmailConfigured(locale);
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport(mailTransportOptions());
  // Gmail “Send mail as” must verify the proton alias or Gmail will rewrite From to the gmail address.
  await transporter.sendMail(mailSendOptions({ to, subject, html, text, locale }));
}

function publicOrigin() {
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "recompenses-test";
  return `https://${project}.web.app`;
}

function wrapEmail(locale, title, inner, opts = {}) {
  const lang = normalizeLocale(locale);
  const origin = publicOrigin();
  const legalHtml = t(locale, "email.legalHtml", { origin });
  const dadLine = opts.includeDad === false ? "" : `<br/>${t(locale, "email.dad")}`;
  const signoffBlock =
    opts.hideSignoff === true
      ? ""
      : `<p style="margin:22px 0 0;color:#888;font-size:13px;">${t(locale, "email.signoff")}${dadLine}</p>`;
  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;background:#f6f7fb;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:640px;margin:0 auto;padding:22px;">
    <div style="background:#fff;border-radius:16px;padding:22px 22px 16px;box-shadow:0 10px 26px rgba(0,0,0,.08);">
      ${inner}
      ${signoffBlock}
      <p style="margin:16px 0 0;color:#888;font-size:12px;">${legalHtml}</p>
    </div>
  </div>
</body>
</html>`;
}

function legalEmailText(locale) {
  return t(locale, "email.legalText", { origin: publicOrigin() });
}

function welcomeVerifyEmailHtml(code, locale) {
  const digits = String(code);
  const loc = normalizeLocale(locale);
  return wrapEmail(
    loc,
    t(loc, "email.welcome.title"),
    `
    <h2 style="margin:0 0 10px;font-size:22px;">${t(loc, "email.welcome.title")}</h2>
    <p style="margin:0 0 12px;color:#333;line-height:1.5;">${t(loc, "email.welcome.body")}</p>
    <p style="margin:0 0 12px;color:#555;line-height:1.5;font-size:14px;">${t(loc, "email.welcome.identityNote")}</p>
    <p style="margin:0 0 8px;color:#333;font-weight:700;">${t(loc, "email.welcome.codeIntro")}</p>
    <div style="font-size:32px;letter-spacing:8px;font-weight:800;text-align:center;padding:14px 0 8px;font-family:Arial,Helvetica,sans-serif;">
      ${digits}
    </div>
    <p style="margin:0 0 14px;color:#333;line-height:1.5;font-weight:700;text-align:center;">${t(loc, "email.welcome.codeExpiry")}</p>
    <p style="margin:0 0 14px;color:#333;line-height:1.5;">${t(loc, "email.welcome.afterCode")}</p>
    <h3 style="margin:16px 0 8px;font-size:16px;">${t(loc, "email.welcome.adminTitle")}</h3>
    <ul style="margin:0 0 14px;padding-left:18px;color:#333;line-height:1.55;">
      <li>${t(loc, "email.welcome.admin1")}</li>
      <li>${t(loc, "email.welcome.admin2")}</li>
      <li>${t(loc, "email.welcome.admin3")}</li>
    </ul>
    <h3 style="margin:16px 0 8px;font-size:16px;">${t(loc, "email.welcome.pricesTitle")}</h3>
    <p style="margin:0 0 12px;color:#333;line-height:1.5;">${t(loc, "email.welcome.prices")}</p>
    <p style="margin:0 0 12px;color:#333;line-height:1.5;">${t(loc, "email.welcome.dailyEmail")}</p>
    <p style="margin:0;color:#333;line-height:1.5;">${t(loc, "email.welcome.contact")}</p>
    <h2 style="margin:22px 0 10px;font-size:22px;">${t(loc, "email.welcome.signoff")}</h2>
    `,
    { includeDad: false, hideSignoff: true }
  );
}

function welcomeVerifyEmailText(code, locale) {
  const loc = normalizeLocale(locale);
  return `${t(loc, "email.welcome.title")}

${t(loc, "email.welcome.bodyText")}

${t(loc, "email.welcome.identityNote")}

${t(loc, "email.welcome.codeIntro")} ${code}

${t(loc, "email.welcome.codeExpiry")}

${t(loc, "email.welcome.afterCodeText")}

${t(loc, "email.welcome.adminText")}

${t(loc, "email.welcome.pricesText")}

${t(loc, "email.welcome.dailyEmailText")}

${t(loc, "email.welcome.contactText")}

${t(loc, "email.welcome.signoff")}

${legalEmailText(loc)}`;
}

function recoverPinEmailHtml(pin, locale) {
  const loc = normalizeLocale(locale);
  const digits = String(pin);
  return wrapEmail(
    loc,
    t(loc, "email.recover.title"),
    `
    <h2 style="margin:0 0 10px;font-size:22px;">${t(loc, "email.recover.title")}</h2>
    <p style="margin:0 0 12px;color:#333;line-height:1.5;">${t(loc, "email.recover.body")}</p>
    <div style="font-size:32px;letter-spacing:8px;font-weight:800;text-align:center;padding:14px 0 18px;font-family:Arial,Helvetica,sans-serif;">
      ${digits}
    </div>
    <p style="margin:0 0 12px;color:#333;line-height:1.5;">${t(loc, "email.recover.after")}</p>
    `
  );
}

function recoverPinEmailText(pin, locale) {
  const loc = normalizeLocale(locale);
  return `${t(loc, "email.recover.title")}

${t(loc, "email.recover.body")} ${pin}

${t(loc, "email.recover.afterText")}

${t(loc, "email.dad")}

${legalEmailText(loc)}`;
}

function resetPasswordEmailHtml(code, locale) {
  const loc = normalizeLocale(locale);
  const digits = String(code);
  return wrapEmail(
    loc,
    t(loc, "email.reset.title"),
    `
    <h2 style="margin:0 0 10px;font-size:22px;">${t(loc, "email.reset.title")}</h2>
    <p style="margin:0 0 12px;color:#333;line-height:1.5;">${t(loc, "email.reset.body")}</p>
    <div style="font-size:32px;letter-spacing:8px;font-weight:800;text-align:center;padding:14px 0 18px;font-family:Arial,Helvetica,sans-serif;">
      ${digits}
    </div>
    <p style="margin:0 0 12px;color:#333;line-height:1.5;">${t(loc, "email.reset.after")}</p>
    `
  );
}

function resetPasswordEmailText(code, locale) {
  const loc = normalizeLocale(locale);
  return `${t(loc, "email.reset.title")}

${t(loc, "email.reset.body")} ${code}

${t(loc, "email.reset.afterText")}

${t(loc, "email.dad")}

${legalEmailText(loc)}`;
}

module.exports = {
  DEFAULT_REPLY_TO,
  emailConfigured,
  missingEmailMessage,
  requireEmailConfigured,
  mailFromAddress,
  mailFromHeader,
  mailSendOptions,
  mailReplyTo,
  mailTransportOptions,
  safeMailErrorSummary,
  logMailFailure,
  sendMail,
  welcomeVerifyEmailHtml,
  welcomeVerifyEmailText,
  recoverPinEmailHtml,
  recoverPinEmailText,
  resetPasswordEmailHtml,
  resetPasswordEmailText,
  publicOrigin,
  bcp47,
};
