/**
 * Module de gestion des emails
 * Utilise Resend pour envoyer des notifications
 */

const { Resend } = require('resend');

/**
 * Créer l'instance Resend
 * La clé API est injectée comme variable d'environnement par Firebase Functions
 */
function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Le secret RESEND_API_KEY n\'est pas configuré');
  }
  
  console.log('📧 Initialisation du client Resend...');
  return new Resend(process.env.RESEND_API_KEY);
}

/**
 * Envoyer un email de succès avec les statistiques
 */
async function sendSuccessEmail(toEmail, stats) {
  try {
    const resend = getResendClient();
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          h2 { color: #4CAF50; }
          .stats { background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0; }
          .stats ul { list-style: none; padding: 0; }
          .stats li { padding: 8px 0; border-bottom: 1px solid #ddd; }
          .stats li:last-child { border-bottom: none; }
          .total { background: #4CAF50; color: white; padding: 15px; border-radius: 8px; margin: 20px 0; }
          .footer { color: #666; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>✅ Reset Quotidien Effectué</h2>
          <p>Le reset automatique des tâches a été effectué avec succès ce matin à 06:00.</p>
          
          <div class="stats">
            <h3>📊 Statistiques d'hier (${stats.date}) :</h3>
            <ul>
              <li>👨 <strong>Papa</strong> : ${stats.papa?.completed || 0}/${stats.papa?.total || 0} tâches (${stats.papa?.completionRate || 0}%) - ${stats.papa?.stars || 0}⭐</li>
              <li>👩 <strong>Maman</strong> : ${stats.maman?.completed || 0}/${stats.maman?.total || 0} tâches (${stats.maman?.completionRate || 0}%) - ${stats.maman?.stars || 0}⭐</li>
              <li>👦 <strong>Bastien</strong> : ${stats.bastien?.completed || 0}/${stats.bastien?.total || 0} tâches (${stats.bastien?.completionRate || 0}%) - ${stats.bastien?.stars || 0}⭐</li>
              <li>🧒 <strong>Florent</strong> : ${stats.florent?.completed || 0}/${stats.florent?.total || 0} tâches (${stats.florent?.completionRate || 0}%) - ${stats.florent?.stars || 0}⭐</li>
            </ul>
          </div>
          
          <div class="total">
            <p><strong>🏆 Performance Familiale : ${stats.familyCompletionRate || 0}% (${stats.totalCompleted || 0}/${stats.totalTasks || 0} tâches)</strong></p>
            <p><strong>⭐ Total Étoiles : ${stats.totalStars || 0}⭐</strong></p>
          </div>
          
          <p>Bonne journée ! 🎉</p>
          
          <div class="footer">
            <p>Activity Day to Day - Système automatisé</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    const { data, error } = await resend.emails.send({
      from: 'Activity Day to Day <onboarding@resend.dev>',
      to: toEmail,
      subject: '✅ Reset Quotidien Effectué - Activity Day to Day',
      html: htmlContent
    });
    
    if (error) {
      throw error;
    }
    
    console.log('📧 Email de succès envoyé:', data.id);
    return data;
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi de l\'email de succès:', error);
    throw error;
  }
}

/**
 * Envoyer un email d'erreur
 */
async function sendErrorEmail(toEmail, error) {
  try {
    const resend = getResendClient();
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          h2 { color: #f44336; }
          .error { background: #ffebee; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f44336; }
          .footer { color: #666; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>⚠️ Erreur Reset Automatique</h2>
          <p>Une erreur s'est produite lors du reset automatique ce matin.</p>
          
          <div class="error">
            <h3>Détails de l'erreur :</h3>
            <p><strong>❌ Erreur :</strong> ${error.message || 'Erreur inconnue'}</p>
            <p><strong>🕐 Heure :</strong> ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}</p>
            <p><strong>🔄 Statut :</strong> Échec</p>
          </div>
          
          <p><strong>Action requise :</strong></p>
          <ul>
            <li>Vérifier la configuration Firebase</li>
            <li>Consulter les logs Firebase Console</li>
            <li>Effectuer un reset manuel si nécessaire</li>
          </ul>
          
          <div class="footer">
            <p>Activity Day to Day - Système automatisé</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    const { data, error: sendError } = await resend.emails.send({
      from: 'Activity Day to Day <onboarding@resend.dev>',
      to: toEmail,
      subject: '⚠️ Erreur Reset Automatique - Activity Day to Day',
      html: htmlContent
    });
    
    if (sendError) {
      throw sendError;
    }
    
    console.log('📧 Email d\'erreur envoyé:', data.id);
    return data;
    
  } catch (emailError) {
    console.error('❌ Erreur lors de l\'envoi de l\'email d\'erreur:', emailError);
    throw emailError;
  }
}

module.exports = {
  sendSuccessEmail,
  sendErrorEmail
};
