// preview-email-v2.js
const fs = require("fs");

/* ===== Copie COLLE ici la fonction generateSuccessHtmlV2(stats, resetCount, deleteCount, isFirstDayOfMonth) =====
   (exactement la même que dans ton fichier functions)
*/
function generateSuccessHtmlV2(stats, resetCount, deleteCount, isFirstDayOfMonth) {
  const P = stats.byPerson;

  const pill = (text, bg, fg = "#111") =>
    `<span style="display:inline-block;padding:6px 10px;border-radius:999px;background:${bg};color:${fg};font-weight:800;font-size:12px;white-space:nowrap;">${text}</span>`;

  const bar = (pct) => {
    const safe = Math.max(0, Math.min(160, Number(pct) || 0)); // allow >100
    return `
      <div style="height:14px;border-radius:999px;background:#e9e9ee;overflow:hidden;box-shadow:inset 0 2px 6px rgba(0,0,0,.08);">
        <div style="height:100%;width:${safe}%;background:linear-gradient(90deg,#4CAF50 0%,#8BC34A 55%,#FFC107 80%,#FF9800 100%);border-radius:999px;"></div>
      </div>
    `;
  };

  const card = (title, accent, s, isChild) => {
    const max = s.normalTotalStars || 1;

    const leftMeta = `
      <div style="font-size:13px;opacity:.85;font-weight:700;margin-top:6px;">
        ${s.tasksCompleted}/${s.tasksTotal} tâche(s) cochée(s)
      </div>
      <div style="margin-top:12px;">${bar(s.percent)}</div>
    `;

    const rightMeta = `
      <div style="text-align:right;">
        <div style="font-size:28px;font-weight:900;color:${accent};line-height:1;">
          ${s.earnedStarsFinal} <span style="opacity:.5;">/ ${max}</span>
        </div>
        <div style="margin-top:8px;">
          ${pill(`${s.percent}%`, "#111", "#fff")}
          ${s.seriousFault ? pill("💀 faute grave", "#d32f2f", "#fff") : ""}
        </div>

        <div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
          ${s.bonusStarsEarned ? pill(`🎁 +${s.bonusStarsEarned}⭐`, "#ffeb3b") : ""}
          ${s.penaltyStarsApplied ? pill(`⛔ -${s.penaltyStarsApplied}⭐`, "#f44336", "#fff") : ""}
        </div>

        ${
          isChild
            ? `
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
            ${pill(`⏱ Base: ${s.screenBaseMinutes ?? 0} min`, "rgba(46,204,113,.18)", "#0f5132")}
            ${pill(
              `📱 Total: ${s.screenTotalMinutes ?? 0} min${
                (s.screenBonusMinutes ?? 0) > 0 ? ` (+${s.screenBonusMinutes})` : ""
              }`,
              "rgba(46,204,113,.18)",
              "#0f5132"
            )}
          </div>
        `
            : ""
        }
      </div>
    `;

    return `
      <div style="background:#fff;border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,.10);padding:18px 18px 16px;border-left:6px solid ${accent};">
        <div style="display:flex;justify-content:space-between;gap:18px;align-items:flex-start;">
          <div>
            <div style="font-size:26px;font-weight:900;color:${accent};">${title}</div>
            ${leftMeta}
          </div>
          ${rightMeta}
        </div>
      </div>
    `;
  };

  const topInfo = `
    ${isFirstDayOfMonth ? `<div style="margin-top:10px;">${pill("🗓️ 1er jour du mois : reset mensuel effectué", "#e3f2fd", "#0b5394")}</div>` : ""}
    ${
      deleteCount > 0
        ? `<div style="margin-top:10px;">${pill(`🧹 ${deleteCount} tâche(s) ponctuelle(s) supprimée(s)`, "#fff3e0", "#8a4b00")}</div>`
        : ""
    }
    ${
      resetCount > 0
        ? `<div style="margin-top:10px;">${pill(`🔁 ${resetCount} tâche(s) réinitialisée(s)`, "#ede7f6", "#4a148c")}</div>`
        : ""
    }
  `;

  return `
  <!DOCTYPE html>
  <html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Rapport quotidien</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f6fb;font-family:Segoe UI,Roboto,Arial,sans-serif;">
    <div style="max-width:860px;margin:0 auto;padding:24px;">
      <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:20px;padding:20px 22px;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.12);">
        <div style="font-size:26px;font-weight:900;">✅ Rapport de fin de journée</div>
        <div style="opacity:.95;margin-top:6px;font-weight:700;">
          Jour : <span style="text-transform:capitalize;">${stats.dayName}</span> — ${stats.date}
        </div>
        <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          ${pill(`🏆 Score famille : ${stats.familyCompletionRate}%`, "#111", "#fff")}
          ${pill(`⭐ Total : ${stats.totalStars}`, "rgba(255,255,255,.18)", "#fff")}
        </div>
      </div>

      <div style="margin-top:14px;">
        ${topInfo}
      </div>

      <div style="margin-top:18px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;">
        ${card("👨 Papa", "#2196F3", P.papa, false)}
        ${card("👩 Maman", "#E91E63", P.maman, false)}
        ${card("🧒 Florent", "#FF9800", P.florent, true)}
        ${card("👦 Harry", "#7e57c2", P.harry, true)}
      </div>

      <div style="margin-top:18px;color:#666;font-size:12px;text-align:center;">
        Rapport généré automatiquement — Système de récompenses
      </div>
    </div>
  </body>
  </html>
  `;
}

/* ===== Données de test (tu peux modifier pour simuler d'autres cas) ===== */
const statsMock = {
  version: 2,
  date: "2026-01-03",
  dayName: "samedi",
  familyCompletionRate: 86,
  totalStars: 41,
  byPerson: {
    papa: {
      tasksTotal: 3, tasksCompleted: 3,
      normalTotalStars: 3, normalEarnedStars: 3,
      bonusStarsEarned: 0, penaltyStarsApplied: 0,
      seriousFault: false,
      earnedStarsFinal: 3, percent: 100,
      screenBaseMinutes: null, screenBonusMinutes: null, screenTotalMinutes: null,
    },
    maman: {
      tasksTotal: 2, tasksCompleted: 1,
      normalTotalStars: 5, normalEarnedStars: 3,
      bonusStarsEarned: 0, penaltyStarsApplied: 0,
      seriousFault: false,
      earnedStarsFinal: 3, percent: 60,
      screenBaseMinutes: null, screenBonusMinutes: null, screenTotalMinutes: null,
    },
    florent: {
      tasksTotal: 16, tasksCompleted: 14,
      normalTotalStars: 20, normalEarnedStars: 20,
      bonusStarsEarned: 4, penaltyStarsApplied: 2,
      seriousFault: false,
      earnedStarsFinal: 22, percent: 110,
      screenBaseMinutes: 20, screenBonusMinutes: 4, screenTotalMinutes: 24,
    },
    harry: {
      tasksTotal: 15, tasksCompleted: 15,
      normalTotalStars: 19, normalEarnedStars: 19,
      bonusStarsEarned: 3, penaltyStarsApplied: 0,
      seriousFault: false,
      earnedStarsFinal: 22, percent: 116,
      screenBaseMinutes: 20, screenBonusMinutes: 3, screenTotalMinutes: 23,
    },
  },
};

const html = generateSuccessHtmlV2(
  statsMock,
  /* resetCount */ 12,
  /* deleteCount */ 2,
  /* isFirstDayOfMonth */ false
);

fs.writeFileSync("preview-rapport-v2.html", html, "utf8");
console.log("✅ Preview générée : preview-rapport-v2.html (ouvre-la dans ton navigateur)");
