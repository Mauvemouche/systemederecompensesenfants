/**
 * Cloud Functions for Activity Day to Day
 * Reset automatique quotidien des tâches
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { sendSuccessEmail, sendErrorEmail } = require('./email');

// Initialiser Firebase Admin
admin.initializeApp();
const db = admin.firestore();

/**
 * Cloud Function - Reset Quotidien des Tâches
 * S'exécute toutes les heures et vérifie si c'est le moment de faire le reset
 * Timezone: Europe/Paris
 */
exports.dailyTaskReset = onSchedule({
  schedule: '0 * * * *', // Toutes les heures à minute 0
  timeZone: 'Europe/Paris',
  region: 'europe-west1',
  secrets: ['RESEND_API_KEY']
}, async (context) => {
  console.log('🔄 Vérification scheduler - Reset automatique');
  
  try {
    // 1. Vérifier la configuration
    const config = await getResetConfig();
    if (!config.enabled) {
      console.log('⏸️ Reset désactivé dans la configuration');
      return null;
    }
    
    // 2. Vérifier si c'est l'heure configurée
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDay = now.toLocaleDateString('fr-FR', { weekday: 'long' }).toLowerCase();
    const currentDayNumber = now.getDay(); // 0=Dimanche, 1=Lundi, ..., 6=Samedi
    
    // Parser l'heure de reset depuis la config (format "HH:MM")
    const [resetHour, resetMinute] = config.resetTime.split(':').map(Number);
    
    console.log(`⏰ Heure actuelle: ${currentHour}:${currentMinute}, Heure configurée: ${resetHour}:${resetMinute}`);
    console.log(`📅 Jour actuel: ${currentDay} (${currentDayNumber}), Jours actifs: ${JSON.stringify(config.activeDays)}`);
    
    // Vérifier si c'est le bon jour
    // Gérer les deux formats : tableau [0,1,2,...] ou objet {lundi: true, ...}
    let isDayActive = false;
    if (Array.isArray(config.activeDays)) {
      // Format tableau : [0,1,2,3,4,5,6]
      isDayActive = config.activeDays.includes(currentDayNumber);
      console.log(`📅 Format tableau détecté, jour ${currentDayNumber} actif: ${isDayActive}`);
    } else {
      // Format objet : {lundi: true, mardi: false, ...}
      isDayActive = config.activeDays[currentDay] === true;
      console.log(`📅 Format objet détecté, jour ${currentDay} actif: ${isDayActive}`);
    }
    
    if (!isDayActive) {
      console.log(`⏸️ Reset non actif pour ${currentDay}`);
      return null;
    }
    
    // Vérifier si c'est la bonne heure (avec tolérance de 5 minutes)
    if (currentHour !== resetHour) {
      console.log(`⏸️ Pas encore l'heure du reset (${currentHour}h vs ${resetHour}h configuré)`);
      return null;
    }
    
    console.log('✅ C\'est l\'heure du reset automatique !');
    
    // 3. Vérifier si un reset a déjà été fait aujourd'hui
    const today = now.toISOString().split('T')[0]; // Format: YYYY-MM-DD
    if (config.lastReset === today) {
      console.log(`⏸️ Reset déjà effectué aujourd'hui (${today})`);
      return null;
    }
    
    // 4. Sauvegarder les statistiques avant reset (uniquement pour le jour actuel)
    const stats = await saveCurrentStats(today, currentDayNumber);
    console.log(`📊 Statistiques sauvegardées pour ${currentDay} (jour ${currentDayNumber}):`, stats);
    
    // 5. Effectuer le reset des tâches (uniquement pour le jour actuel)
    const resetCount = await resetAllTasks(currentDayNumber);
    console.log(`🔄 ${resetCount} tâches du ${currentDay} remises à zéro`);
    
    // 6. Mettre à jour la date du dernier reset
    await updateLastReset(today);
    
    // 7. Envoyer email de confirmation si activé
    if (config.notifications?.email?.enabled && config.notifications?.email?.onSuccess) {
      console.log('📧 Envoi de l\'email de confirmation...');
      await sendSuccessEmail(config.notifications.email.address, stats);
      console.log('📧 Email de confirmation envoyé');
    } else {
      console.log('📧 Email désactivé dans la configuration');
    }
    
    console.log('✅ Reset automatique terminé avec succès');
    return { success: true, tasksReset: resetCount, stats };
    
  } catch (error) {
    console.error('❌ Erreur lors du reset automatique:', error);
    
    // Envoyer email d'erreur si activé
    try {
      const config = await getResetConfig();
      if (config.notifications?.email?.enabled && config.notifications?.email?.onError) {
        console.log('📧 Envoi de l\'email d\'erreur...');
        await sendErrorEmail(config.notifications.email.address, error);
        console.log('📧 Email d\'erreur envoyé');
      }
    } catch (emailError) {
      console.error('Erreur lors de l\'envoi de l\'email d\'erreur:', emailError);
    }
    
    throw error;
  }
});

/**
 * Récupérer la configuration du reset
 */
async function getResetConfig() {
  try {
    const doc = await db.collection('reset_config').doc('main_config').get();
    
    if (doc.exists) {
      const config = doc.data();
      console.log('📋 Configuration trouvée dans Firestore:', JSON.stringify(config));
      
      // Si la config utilise 'time' au lieu de 'resetTime', on le corrige
      if (config.time && !config.resetTime) {
        console.log('⚠️ Migration de "time" vers "resetTime"');
        config.resetTime = config.time;
      }
      
      // Vérifier que resetTime existe
      if (!config.resetTime) {
        console.error('❌ ERREUR: resetTime manquant dans la config!');
        config.resetTime = '06:00'; // Valeur par défaut
      }
      
      return config;
    }
    
    // Configuration par défaut si non existante
    console.log('⚠️ Aucune configuration trouvée, utilisation des valeurs par défaut');
    return {
      enabled: true,
      resetTime: '06:00',
      timezone: 'Europe/Paris',
      activeDays: {
        lundi: true,
        mardi: true,
        mercredi: true,
        jeudi: true,
        vendredi: true,
        samedi: true,
        dimanche: true
      },
      lastReset: null,
      notifications: {
        email: {
          enabled: false,
          address: 'pierre.thonon@gmail.com',
          onSuccess: true,
          onError: true,
          weeklyStats: false
        }
      }
    };
  } catch (error) {
    console.error('❌ Erreur lors de la récupération de la config:', error);
    throw error;
  }
}

/**
 * Sauvegarder les statistiques du jour avant reset
 * @param {string} date - Date au format YYYY-MM-DD
 * @param {number} dayOfWeek - Numéro du jour (0=Dimanche, 1=Lundi, etc.)
 */
async function saveCurrentStats(date, dayOfWeek) {
  try {
    // Récupérer TOUTES les tâches (on filtrera en JS)
    const allTasks = await db.collection('tasks').get();
    
    // Filtrer pour inclure :
    // 1. Les tâches avec dayOfWeek === jour actuel
    // 2. Les anciennes tâches SANS dayOfWeek (qui apparaissent tous les jours)
    const tasks = allTasks.docs.filter(doc => {
      const task = doc.data();
      return task.dayOfWeek === dayOfWeek || 
             task.dayOfWeek === undefined || 
             task.dayOfWeek === null;
    });
    
    console.log(`📊 Analyse de ${tasks.length} tâches pour le jour ${dayOfWeek} (incluant anciennes tâches)`);
    
    // Calculer les stats par personne
    const stats = {
      papa: { completed: 0, total: 0, stars: 0 },
      maman: { completed: 0, total: 0, stars: 0 },
      florent: { completed: 0, total: 0, stars: 0 },
      harry: { completed: 0, total: 0, stars: 0 }
    };
    
    tasks.forEach(doc => {
      const task = doc.data();
      const person = task.assignedTo;
      
      if (stats[person]) {
        stats[person].total++;
        if (task.completed) {
          stats[person].completed++;
          stats[person].stars += (task.stars || 0);
        }
      }
    });
    
    // Calculer les taux de complétion
    Object.keys(stats).forEach(person => {
      stats[person].completionRate = stats[person].total > 0
        ? Math.round((stats[person].completed / stats[person].total) * 100)
        : 0;
    });
    
    // Totaux
    const totalTasks = tasks.length;
    const totalCompleted = Object.values(stats).reduce((sum, p) => sum + p.completed, 0);
    const totalStars = Object.values(stats).reduce((sum, p) => sum + p.stars, 0);
    const familyCompletionRate = totalTasks > 0 
      ? Math.round((totalCompleted / totalTasks) * 100)
      : 0;
    
    // Sauvegarder dans Firestore
    const statsDoc = {
      date,
      resetTime: new Date().toTimeString().split(' ')[0],
      beforeReset: stats,
      totalTasks,
      totalCompleted,
      totalStars,
      familyCompletionRate,
      resetBy: 'system_auto',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('daily_stats').doc(`stats_${date.replace(/-/g, '_')}`).set(statsDoc);
    
    return { ...statsDoc, ...stats, totalTasks, totalCompleted, totalStars, familyCompletionRate };
    
  } catch (error) {
    console.error('Erreur lors de la sauvegarde des stats:', error);
    throw error;
  }
}

/**
 * Remettre les tâches du jour à zéro
 * @param {number} dayOfWeek - Numéro du jour (0=Dimanche, 1=Lundi, etc.)
 */
async function resetAllTasks(dayOfWeek) {
  try {
    const batch = db.batch();
    
    // Récupérer TOUTES les tâches complétées (on filtrera en JS)
    const allCompletedTasks = await db.collection('tasks')
      .where('completed', '==', true)
      .get();
    
    // Filtrer pour inclure :
    // 1. Les tâches avec dayOfWeek === jour actuel
    // 2. Les anciennes tâches SANS dayOfWeek (qui apparaissent tous les jours)
    const tasksToReset = allCompletedTasks.docs.filter(doc => {
      const task = doc.data();
      return task.dayOfWeek === dayOfWeek || 
             task.dayOfWeek === undefined || 
             task.dayOfWeek === null;
    });
    
    console.log(`🔄 Reset de ${tasksToReset.length} tâches complétées pour le jour ${dayOfWeek} (incluant anciennes tâches)`);
    
    tasksToReset.forEach(doc => {
      batch.update(doc.ref, {
        completed: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    
    await batch.commit();
    return tasksToReset.length;
    
  } catch (error) {
    console.error('Erreur lors du reset des tâches:', error);
    throw error;
  }
}

/**
 * Mettre à jour la date du dernier reset
 */
async function updateLastReset(date) {
  try {
    await db.collection('reset_config').doc('main_config').update({
      lastReset: date,
      lastResetTimestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du lastReset:', error);
    throw error;
  }
}

/**
 * Fonction HTTP Callable - Force Reset Manuel
 * Permet de déclencher un reset manuellement depuis l'interface admin
 * Version: 1.1 - Fix nodemailer dependency
 */
exports.manualTaskReset = onCall({
  region: 'europe-west1',
  secrets: ['RESEND_API_KEY']
}, async (request) => {
  console.log('🔄 Reset manuel déclenché (v1.1)');
  console.log('Request data:', JSON.stringify(request.data));
  
  try {
    const { testMode = false } = request.data || {};
    console.log('Mode test:', testMode);
    
    // Obtenir le jour actuel
    const now = new Date();
    const currentDayNumber = now.getDay(); // 0=Dimanche, 1=Lundi, ..., 6=Samedi
    const currentDay = now.toLocaleDateString('fr-FR', { weekday: 'long' });
    console.log(`📅 Jour actuel: ${currentDay} (${currentDayNumber})`);
    
    // 1. Sauvegarder les statistiques
    console.log('💾 Début sauvegarde statistiques...');
    const today = new Date().toISOString().split('T')[0];
    console.log('Date:', today);
    
    const stats = await saveCurrentStats(today, currentDayNumber);
    console.log(`📊 Statistiques sauvegardées pour ${currentDay}:`, JSON.stringify(stats));
    
    // 2. Reset des tâches (uniquement pour le jour actuel)
    console.log(`🔄 Début reset des tâches du ${currentDay}...`);
    const resetCount = await resetAllTasks(currentDayNumber);
    console.log(`✅ ${resetCount} tâches du ${currentDay} réinitialisées`);
    
    // 3. Mettre à jour la config
    await updateLastReset(today);
    
    // 4. Envoyer un email si pas en mode test
    if (!testMode) {
      console.log('📧 Tentative d\'envoi d\'email...');
      try {
        const config = await getResetConfig();
        if (config.notifications?.email?.enabled && config.notifications?.email?.onSuccess) {
          console.log('📧 Configuration email active, envoi en cours...');
          await sendSuccessEmail(config.notifications.email.address, stats);
          console.log('✅ Email de confirmation envoyé avec succès');
        } else {
          console.log('⏸️ Email non configuré ou désactivé');
        }
      } catch (emailError) {
        console.error('❌ Erreur lors de l\'envoi de l\'email:', emailError);
        console.error('Stack:', emailError.stack);
        // Ne pas faire échouer tout le reset si juste l'email échoue
      }
    }
    
    return {
      success: true,
      message: testMode 
        ? `Test reset effectué avec succès pour ${currentDay}` 
        : `Reset manuel effectué avec succès pour ${currentDay}`,
      stats: stats,
      resetCount: resetCount,
      dayOfWeek: currentDayNumber,
      dayName: currentDay,
      testMode: testMode
    };
    
  } catch (error) {
    console.error('❌ Erreur lors du reset manuel:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Envoyer un email d'erreur - TEMPORAIREMENT DÉSACTIVÉ
    // try {
    //   const config = await getResetConfig();
    //   if (config.notifications?.email?.enabled && config.notifications?.email?.onError) {
    //     await sendErrorEmail(config.notifications.email.address, error);
    //   }
    // } catch (emailError) {
    //   console.error('Erreur lors de l\'envoi de l\'email d\'erreur:', emailError);
    // }
    
    // Retourner une erreur structurée
    throw new Error(`Erreur lors du reset manuel: ${error.message || 'Erreur inconnue'}`);
  }
});
