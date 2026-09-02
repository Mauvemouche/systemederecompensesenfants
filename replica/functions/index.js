"use strict";

const { setGlobalOptions } = require("firebase-functions/v2");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const family = require("./lib/family");
const families = require("./lib/families");
const { db, serverTimestamp } = require("./lib/adminApp");

setGlobalOptions({ region: "europe-west1" });

const billingFns = require("./billing");
Object.assign(exports, billingFns);

/* =========================================================
   CONFIG
========================================================= */

const DAY_NAMES_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

async function loadFamilyPeople(familyId) {
  const snap = await families.settingsRef(familyId).get();
  const people = snap.exists && Array.isArray(snap.data().people) ? snap.data().people : family.DEFAULT_FAMILY;
  return people.length ? people : family.DEFAULT_FAMILY;
}

/**
 * Date/heure "Paris" fiable (sans lib externe).
 * (Le scheduler est déjà en Europe/Paris, mais ça sécurise les calculs.)
 */
function nowParis() {
  // En Node, la manière la plus simple sans lib est de convertir via locale string TZ
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
}

function ymdLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Reproduit la logique de visibilité de l'app :
 * - ponctuel: visible uniquement si fullDate == YYYY-MM-DD (date exacte)
 * - mensuel: visible uniquement si dayOfMonth == date.getDate()
 * - quotidien/hebdomadaire: visible si dayOfWeek == date.getDay()
 */
function shouldAppearForDate(task, dateObj) {
  const category = String(task.category || "").toLowerCase().trim();
  const dow = dateObj.getDay();
  const ymd = ymdLocal(dateObj);

  if (category === "ponctuel") return task.fullDate === ymd;
  if (category === "mensuel") return Number(task.dayOfMonth) === dateObj.getDate();

  // quotidien + hebdomadaire + fallback
  return Number(task.dayOfWeek) === dow;
}

/* =========================================================
   EMAIL
   (On garde ton modèle EMAIL_USER/EMAIL_PASSWORD)
========================================================= */

function emailConfigured() {
  return !!(String(process.env.EMAIL_USER || "").trim() && String(process.env.EMAIL_PASSWORD || "").trim());
}

async function sendEmail(subject, htmlContent, toAddress) {
  if (!emailConfigured()) {
    console.log("Email skipped (EMAIL_USER / EMAIL_PASSWORD not set). Daily reset still ran.");
    return;
  }

  const nodemailer = require("nodemailer");
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `"Système Récompenses" <${user}>`,
    to: toAddress || process.env.EMAIL_TO || user,
    subject,
    html: htmlContent,
  });
}

/* =========================================================
   ANTI DOUBLE-ENVOI (idempotence)
   - 1 rapport / date (YYYY-MM-DD)
========================================================= */

async function claimRunOrSkip(familyId, reportDateStr) {
  const runRef = families.familyRef(familyId).collection("cron_runs").doc(`daily_${reportDateStr}`);

  const shouldContinue = await db().runTransaction(async (tx) => {
    const snap = await tx.get(runRef);

    if (snap.exists) {
      const data = snap.data() || {};
      if (data.status === "done") return false;

      // Si "started" récent (<30min), on évite doublon parallèle
      if (data.status === "started" && data.startedAt?.toDate) {
        const startedAt = data.startedAt.toDate();
        if (Date.now() - startedAt.getTime() < 30 * 60 * 1000) return false;
      }
    }

    tx.set(
      runRef,
      {
        status: "started",
        startedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  });

  return { shouldContinue, runRef };
}

async function markRunDone(runRef) {
  await runRef.set(
    { status: "done", doneAt: serverTimestamp() },
    { merge: true }
  );
}

async function markRunFailed(familyId, reportDateStr, error) {
  await families.familyRef(familyId).collection("cron_runs").doc(`daily_${reportDateStr}`).set(
    {
      status: "failed",
      failedAt: serverTimestamp(),
      error: String(error?.message || error),
    },
    { merge: true }
  );
}

/* =========================================================
   STATS (alignées avec ton app.js)
   - normalTotal = somme étoiles tâches non-bonus non-penalty
   - normalEarned = idem cochées
   - bonusStars compté seulement si 100% normal atteint
   - penaltyStars soustrait
   - seriousFault => score 0
   - finalStars = (normalEarned + bonusStars - penaltyStars) (sauf seriousFault => 0)
   - percent = finalStars / normalTotal (si normalTotal == 0 => 0)
  ========================================================= */

function computeStatsForTasks(tasksDocs, dateObj, peopleIds) {
  const tasks = tasksDocs.map((d) => ({ id: d.id, ...d.data() }));
  const PEOPLE = peopleIds && peopleIds.length ? peopleIds : family.personIds(family.DEFAULT_FAMILY);

  const stats = {
    date: ymdLocal(dateObj),
    dayName: DAY_NAMES_FR[dateObj.getDay()],
    dayOfWeek: dateObj.getDay(),
    byPerson: {},
    global: { totalStars: 0, maxStars: 0, percent: 0 },
  };

  PEOPLE.forEach((p) => {
    stats.byPerson[p] = {
      tasksDone: 0,
      tasksTotal: 0,

      normalEarned: 0,
      normalTotal: 0,

      bonusStars: 0,
      penaltyStars: 0,

      seriousFault: false,

      finalStars: 0,
      percent: 0,
    };
  });

  // 1) base totals
  tasks.forEach((t) => {
    const person = String(t.assignedTo || "").toLowerCase().trim();
    if (!stats.byPerson[person]) return;

    const s = stats.byPerson[person];
    s.tasksTotal += 1;
    if (t.completed) s.tasksDone += 1;

    const stars = Math.abs(Number(t.stars || 3));

    if (t.isSeriousFault && t.completed) s.seriousFault = true;

    if (t.isPenalty) {
      if (t.completed) s.penaltyStars += stars;
      return;
    }

// normal = ni bonus, ni pénalité, ni faute grave
if (!t.isBonus && !t.isPenalty && !t.isSeriousFault) {
  s.normalTotal += stars;
  if (t.completed) s.normalEarned += stars;
}

  });

  // 2) bonus only if 100% normal
  PEOPLE.forEach((p) => {
    const s = stats.byPerson[p];
    const allowBonus = s.normalTotal === 0 || s.normalEarned === s.normalTotal;

    tasks.forEach((t) => {
      const person = String(t.assignedTo || "").toLowerCase().trim();
      if (person !== p) return;
      if (!t.isBonus || !t.completed) return;
      if (!allowBonus) return;

      s.bonusStars += Math.abs(Number(t.stars || 3));
    });

    const normalMax = s.normalTotal; // peut être 0
let finalStars;

if (s.seriousFault) finalStars = 0;
else finalStars = (s.normalEarned + s.bonusStars) - s.penaltyStars;

s.finalStars = finalStars;
s.percent = normalMax === 0 ? 0 : Math.round((finalStars / normalMax) * 100);

stats.global.totalStars += finalStars;
stats.global.maxStars += normalMax;
  });

  stats.global.percent = stats.global.maxStars
    ? Math.round((stats.global.totalStars / stats.global.maxStars) * 100)
    : 0;

  return stats;
}

async function saveDailyStatsAligned(familyId, stats) {
  const docId = `stats_${stats.date}`;
  await families.familyRef(familyId).collection("daily_stats").doc(docId).set(
    {
      date: stats.date,
      dayName: stats.dayName.toLowerCase(),
      dayOfWeek: stats.dayOfWeek,

      // compat + nouveau format
      byPerson: stats.byPerson,
      global: stats.global,

      // champs "ancien style" si tu en avais besoin ailleurs
      totalStars: stats.global.totalStars,
      maxStars: stats.global.maxStars,
      familyCompletionRate: stats.global.percent,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/* =========================================================
   HTML EMAIL (joli + chiffres alignés)
========================================================= */

function generateEmailHtml(stats, resetCount, deleteCount, isFirstDayOfMonth, people) {
  const P = stats.byPerson;
  const members = people && people.length ? people : family.DEFAULT_FAMILY;

  const row = (label, s) => {
  const denom = s.normalTotal; // total possible (tâches normales uniquement)
  const num = s.finalStars;    // score obtenu (incluant bonus, pénalités; faute grave => 0)

  const detail = `
    <div style="font-size:12px;line-height:1.35;color:#555;margin-top:4px;">
      <div>Normal : <b>${s.normalEarned}</b> / ${s.normalTotal}</div>
      <div>Bonus : <b>+${s.bonusStars}</b></div>
      <div>Pénalités : <b>-${s.penaltyStars}</b></div>
      <div>Faute grave : <b>${s.seriousFault ? "OUI" : "non"}</b></div>
    </div>
  `;

  return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;"><b>${label}</b></td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;">
        <div style="font-weight:700;">${num} / ${denom} ⭐</div>
        <div style="color:#777;font-size:12px;">${s.percent}%</div>
        <div style="color:#999;font-size:12px;">(${s.tasksDone}/${s.tasksTotal} tâches)</div>
        ${detail}
      </td>
    </tr>
  `;
};

  const extra = [
    isFirstDayOfMonth
      ? `<div style="margin:10px 0 0;color:#1e88e5;"><b>📅 Mensuel :</b> reset mensuel effectué (1er jour du mois).</div>`
      : "",
    deleteCount > 0
      ? `<div style="margin:6px 0 0;color:#e53935;"><b>🗑️ Ponctuel :</b> ${deleteCount} tâche(s) supprimée(s).</div>`
      : "",
  ].join("");

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Rapport</title>
</head>
<body style="margin:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:720px;margin:0 auto;padding:22px;">
    <div style="background:#fff;border-radius:14px;padding:18px 18px 10px;box-shadow:0 10px 26px rgba(0,0,0,.08);">
      <h2 style="margin:0 0 6px;font-size:20px;">✅ Rapport — ${stats.dayName} ${stats.date}</h2>
      <p style="margin:0 0 12px;color:#444;">
        Reset : <b>${resetCount}</b> tâche(s) • Suppression : <b>${deleteCount}</b> ponctuelle(s)
      </p>
      ${extra}

      <div style="background:#fafafa;border-radius:12px;padding:12px 14px;margin:14px 0;">
        <b>🏆 Score global :</b> ${stats.global.percent}% —
        <span style="white-space:nowrap;"><b>${stats.global.totalStars} ⭐</b> / ${stats.global.maxStars}</span>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
  <tr>
    <th style="text-align:left;padding:10px 12px;border-bottom:1px solid #eee;">Membre</th>
    <th style="text-align:left;padding:10px 12px;border-bottom:1px solid #eee;">Score & détails</th>
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
        Rapport généré automatiquement — Système de récompenses
      </div>
    </div>
  </div>
</body>
</html>`;
}

/* =========================================================
   DAILY CRON (2nd gen) — 06:00 Europe/Paris
   - Rapport = VEILLE (J-1 Paris)
   - Anti double-envoi
   - Stats alignées UI
   - Reset + cleanup
   - EMAIL_* not bound (optional at runtime)
========================================================= */

exports.dailyResetAndStats = onSchedule(
  {
    region: "europe-west1",
    schedule: "0 6 * * *",
    timeZone: "Europe/Paris",
    timeoutSeconds: 300,
  },
  async () => {
    console.log("🔄 Début du cycle quotidien");

    const execNow = nowParis();
    const reportDate = new Date(execNow);
    reportDate.setDate(reportDate.getDate() - 1);

    const reportDateStr = ymdLocal(reportDate);
    const isFirstDayOfMonth = execNow.getDate() === 1;

    const familyIds = await families.listFamilyIds();
    if (!familyIds.length) {
      console.log("ℹ️ Aucune famille à traiter.");
      return null;
    }

    for (const familyId of familyIds) {
      let runRef = null;
      try {
        const claim = await claimRunOrSkip(familyId, reportDateStr);
        runRef = claim.runRef;

        if (!claim.shouldContinue) {
          console.log(`⏭️ Famille ${familyId} : rapport ${reportDateStr} déjà généré.`);
          continue;
        }

        const snapshot = await families.tasksCol(familyId).get();
        const tasksForReport = snapshot.docs.filter((docSnap) => shouldAppearForDate(docSnap.data(), reportDate));

        const people = await loadFamilyPeople(familyId);
        const peopleIds = family.personIds(people);

        const stats = computeStatsForTasks(tasksForReport, reportDate, peopleIds);
        await saveDailyStatsAligned(familyId, stats);

        const batch = db().batch();
        let resetCount = 0;
        let deleteCount = 0;

        tasksForReport.forEach((docSnap) => {
          const data = docSnap.data();
          const category = String(data.category || "").toLowerCase().trim();

          if (category === "ponctuel") {
            batch.delete(docSnap.ref);
            deleteCount++;
            return;
          }

          if (data.completed === true) {
            let shouldReset = false;

            if (category === "mensuel") {
              if (isFirstDayOfMonth) shouldReset = true;
            } else {
              shouldReset = true;
            }

            if (shouldReset) {
              batch.update(docSnap.ref, {
                completed: false,
                updatedAt: serverTimestamp(),
              });
              resetCount++;
            }
          }
        });

        if (resetCount > 0 || deleteCount > 0) {
          await batch.commit();
          console.log(`✅ Famille ${familyId} : ${resetCount} reset, ${deleteCount} supprimées.`);
        }

        const familySnap = await families.familyRef(familyId).get();
        const ownerEmail = familySnap.exists ? familySnap.data().ownerEmail : "";
        const html = generateEmailHtml(stats, resetCount, deleteCount, isFirstDayOfMonth, people);
        await sendEmail(`✅ Rapport Quotidien - ${stats.dayName} ${stats.date}`, html, ownerEmail);

        await markRunDone(runRef);
      } catch (error) {
        console.error(`❌ Famille ${familyId} :`, error);
        try {
          await markRunFailed(familyId, reportDateStr, error);
        } catch (e2) {
          console.error("Impossible de marquer failed", e2);
        }
        try {
          await sendEmail("⚠️ Erreur Reset Automatique", `<p>Le reset a échoué (${familyId}) : ${String(error?.message || error)}</p>`);
        } catch (e) {
          console.error("Impossible d'envoyer l'email d'erreur", e);
        }
      }
    }

    console.log("✅ Cycle terminé.");
    return null;
  });
