"use strict";

const family = require("./family");
const { t, normalizeLocale } = require("./i18n");

function familyLocale(settings) {
  return normalizeLocale(settings?.locale);
}

function weekdayName(locale, dayIndex) {
  const idx = Number(dayIndex);
  const day = Number.isInteger(idx) && idx >= 0 && idx <= 6 ? idx : 0;
  return t(locale, `email.daily.day.${day}`);
}

function dailySummarySubject(locale, dayName, date) {
  return t(locale, "email.daily.subject", { dayName, date });
}

function generateEmailHtml(stats, resetCount, deleteCount, isFirstDayOfMonth, people, locale) {
  const loc = normalizeLocale(locale);
  const P = stats.byPerson || {};
  const members = people && people.length ? people : family.DEFAULT_FAMILY;
  const dayName = weekdayName(loc, stats.dayOfWeek);

  const row = (label, s) => {
    const denom = s.normalTotal; // total possible (tâches normales uniquement)
    const num = s.finalStars; // score obtenu (incluant bonus, pénalités; faute grave => 0)

    const detail = `
    <div style="font-size:12px;line-height:1.35;color:#555;margin-top:4px;">
      <div>${t(loc, "email.daily.normal")} : <b>${s.normalEarned}</b> / ${s.normalTotal}</div>
      <div>${t(loc, "email.daily.bonus")} : <b>+${s.bonusStars}</b></div>
      <div>${t(loc, "email.daily.penalties")} : <b>-${s.penaltyStars}</b></div>
      <div>${t(loc, "email.daily.seriousFault")} : <b>${s.seriousFault ? t(loc, "email.daily.yes") : t(loc, "email.daily.no")}</b></div>
    </div>
  `;

    return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;"><b>${label}</b></td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;">
        <div style="font-weight:700;">${num} / ${denom} ⭐</div>
        <div style="color:#777;font-size:12px;">${s.percent}%</div>
        <div style="color:#999;font-size:12px;">(${s.tasksDone}/${s.tasksTotal} ${t(loc, "email.daily.tasks")})</div>
        ${detail}
      </td>
    </tr>
  `;
  };

  const extra = [
    isFirstDayOfMonth
      ? `<div style="margin:10px 0 0;color:#1e88e5;"><b>📅 ${t(loc, "email.daily.monthly")} :</b> ${t(loc, "email.daily.monthlyReset")}</div>`
      : "",
    deleteCount > 0
      ? `<div style="margin:6px 0 0;color:#e53935;"><b>🗑️ ${t(loc, "email.daily.oneOff")} :</b> ${t(loc, "email.daily.oneOffDeleted", { count: deleteCount })}</div>`
      : "",
  ].join("");

  return `<!doctype html>
<html lang="${loc}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${t(loc, "email.daily.title")}</title>
</head>
<body style="margin:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:720px;margin:0 auto;padding:22px;">
    <div style="background:#fff;border-radius:14px;padding:18px 18px 10px;box-shadow:0 10px 26px rgba(0,0,0,.08);">
      <h2 style="margin:0 0 6px;font-size:20px;">${t(loc, "email.daily.heading", { dayName, date: stats.date })}</h2>
      <p style="margin:0 0 12px;color:#444;">
        ${t(loc, "email.daily.reset")} : <b>${resetCount}</b> ${t(loc, "email.daily.tasks")} • ${t(loc, "email.daily.deletion")} : <b>${deleteCount}</b>
      </p>
      ${extra}

      <div style="background:#fafafa;border-radius:12px;padding:12px 14px;margin:14px 0;">
        <b>🏆 ${t(loc, "email.daily.globalScore")} :</b> ${stats.global.percent}% —
        <span style="white-space:nowrap;"><b>${stats.global.totalStars} ⭐</b> / ${stats.global.maxStars}</span>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
  <tr>
    <th style="text-align:left;padding:10px 12px;border-bottom:1px solid #eee;">${t(loc, "email.daily.member")}</th>
    <th style="text-align:left;padding:10px 12px;border-bottom:1px solid #eee;">${t(loc, "email.daily.scoreDetails")}</th>
  </tr>
</thead>

        <tbody>
          ${members
            .map((person) => {
              const emoji = person.role === "parent" ? (person.id === "maman" ? "👩" : "👨") : "👦";
              const empty = {
                normalEarned: 0,
                normalTotal: 0,
                bonusStars: 0,
                penaltyStars: 0,
                seriousFault: false,
                finalStars: 0,
                percent: 0,
                tasksDone: 0,
                tasksTotal: 0,
              };
              return row(`${emoji} ${person.name || person.id}`, P[person.id] || empty);
            })
            .join("")}
        </tbody>
      </table>

      <div style="margin-top:14px;color:#777;font-size:12px;text-align:center;">
        ${t(loc, "email.daily.footer")}
      </div>
    </div>
  </div>
</body>
</html>`;
}

function dailySummaryFromSettings(settings, stats, resetCount, deleteCount, isFirstDayOfMonth, people) {
  const locale = familyLocale(settings);
  const dayName = weekdayName(locale, stats.dayOfWeek);
  const localizedStats = { ...stats, dayName };
  return {
    locale,
    dayName,
    subject: dailySummarySubject(locale, dayName, stats.date),
    html: generateEmailHtml(localizedStats, resetCount, deleteCount, isFirstDayOfMonth, people, locale),
  };
}

module.exports = {
  familyLocale,
  weekdayName,
  dailySummarySubject,
  generateEmailHtml,
  dailySummaryFromSettings,
};
