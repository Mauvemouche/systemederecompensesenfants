const admin = require("firebase-admin");
const functions = require("firebase-functions/v1");
const nodemailer = require("nodemailer");

admin.initializeApp();
const db = admin.firestore();

/**
 * Configuration du transporteur Email (Gmail)
 */
async function sendEmail(subject, htmlContent) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `"Système Récompenses" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_USER,
    subject: subject,
    html: htmlContent,
  });
}

/**
 * Fonction principale : Reset quotidien, Stats et Nettoyage
 */
exports.dailyResetAndStats = functions
  .region("europe-west1")
  .runWith({ 
    secrets: ["EMAIL_USER", "EMAIL_PASSWORD"],
    timeoutSeconds: 300 
  })
  .pubsub
  .schedule("0 6 * * *")
  .timeZone("Europe/Paris")
  .onRun(async (context) => {
    console.log("🔄 Début du cycle quotidien");

    try {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const currentDayOfWeek = now.getDay(); 
      const isFirstDayOfMonth = (now.getDate() === 1);

      const snapshot = await db.collection("tasks").get();
      
      // --- 1. FILTRAGE DES TÂCHES QUI DOIVENT APPARAÎTRE AUJOURD'HUI ---
      const tasksToday = snapshot.docs.filter(doc => {
        const data = doc.data();
        const category = (data.category || "").toLowerCase().trim();

        if (category === "quotidien") {
            return data.dayOfWeek === currentDayOfWeek || data.dayOfWeek == null;
        }
        if (category === "hebdomadaire" || category === "mensuel") {
            return currentDayOfWeek === 0; // Toujours le dimanche
        }
        if (category === "ponctuel") {
            return data.dayOfWeek === currentDayOfWeek; // Le jour spécifique choisi
        }
        return data.dayOfWeek === currentDayOfWeek;
      });

      // 2. Calcul et sauvegarde des stats basées sur ce qui était affiché
      const stats = await saveDailyStats(todayStr, currentDayOfWeek, tasksToday);

      // --- 3. LOGIQUE DE RESET ET DE SUPPRESSION ---
      const batch = db.batch();
      let resetCount = 0;
      let deleteCount = 0;

      tasksToday.forEach(doc => {
        const data = doc.data();
        const category = (data.category || "").toLowerCase().trim();

        // CAS A : Tâche Ponctuelle -> Suppression définitive
        if (category === "ponctuel") {
          batch.delete(doc.ref);
          deleteCount++;
          return;
        }

        // CAS B : Réinitialisation du statut 'completed'
        if (data.completed === true) {
          let shouldReset = false;

          if (category === "mensuel") {
            if (isFirstDayOfMonth) shouldReset = true;
          } else {
            // Quotidien et Hebdo reset à chaque fois
            shouldReset = true;
          }

          if (shouldReset) {
            batch.update(doc.ref, { 
              completed: false, 
              updatedAt: admin.firestore.FieldValue.serverTimestamp() 
            });
            resetCount++;
          }
        }
      });

      if (resetCount > 0 || deleteCount > 0) {
        await batch.commit();
        console.log(`✅ Nettoyage fini : ${resetCount} reset, ${deleteCount} supprimées.`);
      }

      // 4. Email récapitulatif
      const emailHtml = generateSuccessHtml(stats, resetCount, deleteCount, isFirstDayOfMonth);
      await sendEmail(`✅ Rapport Quotidien - ${stats.dayName} ${todayStr}`, emailHtml);

      return null;
    } catch (error) {
      console.error("❌ Erreur critique :", error);
      try {
        await sendEmail("⚠️ Erreur Reset Automatique", `<p>Le reset a échoué : ${error.message}</p>`);
      } catch (e) {
        console.error("Impossible d'envoyer l'email d'erreur", e);
      }
      return null;
    }
  });

/**
 * Calcule et enregistre les statistiques
 */
async function saveDailyStats(dateStr, dayOfWeek, tasksToday) {
  const dayNames = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  
  const statsByPerson = {
    papa: { completed: 0, total: 0, stars: 0 },
    maman: { completed: 0, total: 0, stars: 0 },
    florent: { completed: 0, total: 0, stars: 0 },
    harry: { completed: 0, total: 0, stars: 0 },
  };

  tasksToday.forEach(doc => {
    const task = doc.data();
    const person = (task.assignedTo || "").toLowerCase().trim();

    if (statsByPerson[person]) {
      statsByPerson[person].total++;
      if (task.completed) {
        statsByPerson[person].completed++;
        statsByPerson[person].stars += (Number(task.stars) || 0);
      }
    }
  });

  const totalTasks = tasksToday.length;
  const totalCompleted = Object.values(statsByPerson).reduce((sum, p) => sum + p.completed, 0);
  const totalStars = Object.values(statsByPerson).reduce((sum, p) => sum + p.stars, 0);

  const statsDoc = {
    date: dateStr,
    dayName: dayNames[dayOfWeek],
    byPerson: statsByPerson,
    totalTasks,
    totalCompleted,
    totalStars,
    familyCompletionRate: totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await db.collection("daily_stats").doc(`stats_${dateStr}`).set(statsDoc);
  return statsDoc;
}

/**
 * Génère le contenu HTML de l'email
 */
function generateSuccessHtml(stats, resetCount, deleteCount, isFirstDayOfMonth) {
  const renderRow = (name, s) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>${name}</strong></td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${s.completed}/${s.total}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${s.stars} ⭐</td>
    </tr>
  `;

  let infoExtra = "";
  if (isFirstDayOfMonth) infoExtra += `<p style="color: #2196F3;">📅 <strong>Mois :</strong> Reset des tâches mensuelles effectué !</p>`;
  if (deleteCount > 0) infoExtra += `<p style="color: #F44336;">🗑️ <strong>One-off :</strong> ${deleteCount} tâche(s) ponctuelle(s) supprimée(s).</p>`;

  return `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; padding: 20px;">
      <h2 style="color: #4CAF50;">✅ Rapport de fin de journée</h2>
      <p>Le système a réinitialisé <strong>${resetCount}</strong> tâches récurrentes.</p>
      ${infoExtra}
      <div style="background: #f9f9f9; padding: 15px; border-radius: 8px;">
        <h3>📊 Stats du ${stats.dayName} ${stats.date}</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="background: #eee;">
            <th style="padding: 8px; text-align: left;">Membre</th>
            <th style="padding: 8px; text-align: left;">Tâches</th>
            <th style="padding: 8px; text-align: left;">Étoiles</th>
          </tr>
          ${renderRow('👨 Papa', stats.byPerson.papa)}
          ${renderRow('👩 Maman', stats.byPerson.maman)}
          ${renderRow('🧒 Florent', stats.byPerson.florent)}
          ${renderRow('👦 Harry', stats.byPerson.harry)}
        </table>
        <p><strong>🏆 Score Global : ${stats.familyCompletionRate}%</strong> (Total : ${stats.totalStars} ⭐)</p>
      </div>
    </div>
  `;
}