"use strict";

const EMAIL_NOT_CONFIGURED_FR =
  "L’envoi d’email n’est pas encore configuré. Réessaie plus tard, ou écris à kidsrewardsystem@proton.me.";

function emailConfigured() {
  return !!(String(process.env.EMAIL_USER || "").trim() && String(process.env.EMAIL_PASSWORD || "").trim());
}

function requireEmailConfigured() {
  if (!emailConfigured()) {
    const err = new Error(EMAIL_NOT_CONFIGURED_FR);
    err.code = "EMAIL_NOT_CONFIGURED";
    throw err;
  }
}

async function sendMail({ to, subject, html, text }) {
  requireEmailConfigured();
  const nodemailer = require("nodemailer");
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  await transporter.sendMail({
    from: `"Système de récompenses" <${user}>`,
    to,
    subject,
    html,
    text,
  });
}

function wrapEmail(title, inner) {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;background:#f6f7fb;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:640px;margin:0 auto;padding:22px;">
    <div style="background:#fff;border-radius:16px;padding:22px 22px 16px;box-shadow:0 10px 26px rgba(0,0,0,.08);">
      ${inner}
      <p style="margin:22px 0 0;color:#888;font-size:13px;">À très vite,<br/>Un papa belge</p>
    </div>
  </div>
</body>
</html>`;
}

function welcomeVerifyEmailHtml(code) {
  const digits = String(code);
  return wrapEmail(
    "Bienvenue",
    `
    <h2 style="margin:0 0 10px;font-size:22px;">Bienvenue 👋</h2>
    <p style="margin:0 0 12px;color:#333;line-height:1.5;">
      Salut, et merci de nous rejoindre. Je suis un papa belge : j’ai construit cette appli
      pour que les familles puissent suivre les <b>tâches des enfants</b>, gagner des
      <b>étoiles</b>, et transformer ça en <b>temps d’écran</b> — sans se battre tous les soirs.
    </p>
    <p style="margin:0 0 8px;color:#333;font-weight:700;">Voici ton code de vérification (valable 15 minutes) :</p>
    <div style="font-size:32px;letter-spacing:8px;font-weight:800;text-align:center;padding:14px 0 18px;font-family:Arial,Helvetica,sans-serif;">
      ${digits}
    </div>
    <p style="margin:0 0 14px;color:#333;line-height:1.5;">
      Entre-le dans l’appli <b>avant</b> de te connecter. Tant que ce n’est pas validé, le compte reste fermé.
    </p>
    <h3 style="margin:16px 0 8px;font-size:16px;">Le mode Admin, en deux mots</h3>
    <ul style="margin:0 0 14px;padding-left:18px;color:#333;line-height:1.55;">
      <li>Au <b>premier accès</b>, tu choisis un code Admin à <b>4 chiffres</b>. Garde-le précieusement : on ne te l’envoie pas maintenant.</li>
      <li>En mode Admin, tu peux le changer (« <b>Changer le code Admin</b> »).</li>
      <li>Si tu n’es pas en mode Admin et que tu as oublié le code, utilise « <b>Récupérer le code Admin</b> ». On t’envoie un <b>nouveau</b> code à 4 chiffres par email, et l’ancien ne fonctionne plus.</li>
    </ul>
    <h3 style="margin:16px 0 8px;font-size:16px;">Les prix</h3>
    <p style="margin:0 0 12px;color:#333;line-height:1.5;">
      <b>2,50 €/mois</b> (ça ferait 30 €/an si tu restes au mois) ou <b>25 €/an</b>.
      Premier mois d’essai, avec carte. J’ai mis le prix autour d’une bière (ou d’un café) par mois,
      parce que c’est un père belge qui l’a construite — pas pour s’acheter une Ferrari, juste pour payer le serveur.
    </p>
    <p style="margin:0;color:#333;line-height:1.5;">
      Une idée, une plainte, un « ça bug » ? Écris à
      <a href="mailto:kidsrewardsystem@proton.me">kidsrewardsystem@proton.me</a>.
    </p>
    `
  );
}

function welcomeVerifyEmailText(code) {
  return `Bienvenue

Salut, et merci de nous rejoindre. Je suis un papa belge : j’ai construit cette appli pour que les familles puissent suivre les tâches des enfants, gagner des étoiles, et transformer ça en temps d’écran.

Ton code de vérification (valable 15 minutes) : ${code}

Entre-le dans l’appli avant de te connecter.

Mode Admin :
- Au premier accès, tu choisis un code Admin à 4 chiffres. Garde-le précieusement : on ne te l’envoie pas maintenant.
- En mode Admin, tu peux le changer (« Changer le code Admin »).
- Si tu n’es pas en mode Admin et que tu as oublié le code, utilise « Récupérer le code Admin ». On t’envoie un nouveau code à 4 chiffres par email, et l’ancien ne fonctionne plus.

Prix : 2,50 €/mois (30 €/an si payé mois par mois) ou 25 €/an. Premier mois d’essai, avec carte. Prix autour d’une bière (ou d’un café) par mois, parce qu’un père belge l’a construite.

Suggestions / plaintes : kidsrewardsystem@proton.me

À très vite,
Un papa belge`;
}

function recoverPinEmailHtml(pin) {
  const digits = String(pin);
  return wrapEmail(
    "Nouveau code Admin",
    `
    <h2 style="margin:0 0 10px;font-size:22px;">Nouveau code Admin</h2>
    <p style="margin:0 0 12px;color:#333;line-height:1.5;">
      Quelqu’un a demandé à récupérer le code Admin de ta famille. L’ancien code ne fonctionne plus.
      Voici le nouveau (4 chiffres) :
    </p>
    <div style="font-size:32px;letter-spacing:8px;font-weight:800;text-align:center;padding:14px 0 18px;font-family:Arial,Helvetica,sans-serif;">
      ${digits}
    </div>
    <p style="margin:0 0 12px;color:#333;line-height:1.5;">
      En mode Admin, tu pourras le changer. Si tu n’as pas fait cette demande, change le code dès que tu peux,
      et écris-nous à <a href="mailto:kidsrewardsystem@proton.me">kidsrewardsystem@proton.me</a>.
    </p>
    `
  );
}

function recoverPinEmailText(pin) {
  return `Nouveau code Admin

L’ancien code ne fonctionne plus. Voici le nouveau : ${pin}

En mode Admin, tu pourras le changer. Si tu n’as pas fait cette demande, écris à kidsrewardsystem@proton.me.

Un papa belge`;
}

module.exports = {
  EMAIL_NOT_CONFIGURED_FR,
  emailConfigured,
  requireEmailConfigured,
  sendMail,
  welcomeVerifyEmailHtml,
  welcomeVerifyEmailText,
  recoverPinEmailHtml,
  recoverPinEmailText,
};
