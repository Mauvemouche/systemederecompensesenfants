"use strict";

const { t, normalizeLocale, bcp47 } = require("./i18n");

function emailConfigured() {
  return !!(String(process.env.EMAIL_USER || "").trim() && String(process.env.EMAIL_PASSWORD || "").trim());
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
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;
  const fromName = t(locale, "email.fromName");
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  await transporter.sendMail({
    from: `"${fromName}" <${user}>`,
    to,
    subject,
    html,
    text,
  });
}

function wrapEmail(locale, title, inner) {
  const lang = normalizeLocale(locale);
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
      <p style="margin:22px 0 0;color:#888;font-size:13px;">${t(locale, "email.signoff")}<br/>${t(locale, "email.dad")}</p>
    </div>
  </div>
</body>
</html>`;
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
    <p style="margin:0 0 8px;color:#333;font-weight:700;">${t(loc, "email.welcome.codeIntro")}</p>
    <div style="font-size:32px;letter-spacing:8px;font-weight:800;text-align:center;padding:14px 0 18px;font-family:Arial,Helvetica,sans-serif;">
      ${digits}
    </div>
    <p style="margin:0 0 14px;color:#333;line-height:1.5;">${t(loc, "email.welcome.afterCode")}</p>
    <h3 style="margin:16px 0 8px;font-size:16px;">${t(loc, "email.welcome.adminTitle")}</h3>
    <ul style="margin:0 0 14px;padding-left:18px;color:#333;line-height:1.55;">
      <li>${t(loc, "email.welcome.admin1")}</li>
      <li>${t(loc, "email.welcome.admin2")}</li>
      <li>${t(loc, "email.welcome.admin3")}</li>
    </ul>
    <h3 style="margin:16px 0 8px;font-size:16px;">${t(loc, "email.welcome.pricesTitle")}</h3>
    <p style="margin:0 0 12px;color:#333;line-height:1.5;">${t(loc, "email.welcome.prices")}</p>
    <p style="margin:0;color:#333;line-height:1.5;">${t(loc, "email.welcome.contact")}</p>
    `
  );
}

function welcomeVerifyEmailText(code, locale) {
  const loc = normalizeLocale(locale);
  return `${t(loc, "email.welcome.title")}

${t(loc, "email.welcome.bodyText")}

${t(loc, "email.welcome.codeIntro")} ${code}

${t(loc, "email.welcome.afterCodeText")}

${t(loc, "email.welcome.adminText")}

${t(loc, "email.welcome.pricesText")}

${t(loc, "email.welcome.contactText")}

${t(loc, "email.signoff")}
${t(loc, "email.dad")}`;
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

${t(loc, "email.dad")}`;
}

module.exports = {
  emailConfigured,
  missingEmailMessage,
  requireEmailConfigured,
  sendMail,
  welcomeVerifyEmailHtml,
  welcomeVerifyEmailText,
  recoverPinEmailHtml,
  recoverPinEmailText,
  bcp47,
};
