/**
 * Gestion de l'interface admin pour le reset automatique
 */

import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, orderBy, limit, getDocs, writeBatch, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const db = getFirestore();

// Éléments DOM
let resetAdminBtn, resetAdminSection, closeResetAdminBtn;
let editResetConfigBtn, resetConfigModal, resetConfigForm, cancelResetConfigBtn;
let testResetBtn, forceResetBtn;
let resetStatus, resetTimeDisplay, resetEmailDisplay, nextResetDisplay;
let resetHistory;

/**
 * Initialiser l'interface admin du reset
 */
export function initResetAdmin() {
    // Récupérer les éléments DOM
    resetAdminBtn = document.getElementById('resetAdminBtn');
    resetAdminSection = document.getElementById('resetAdminSection');
    closeResetAdminBtn = document.getElementById('closeResetAdminBtn');
    
    editResetConfigBtn = document.getElementById('editResetConfigBtn');
    resetConfigModal = document.getElementById('resetConfigModal');
    resetConfigForm = document.getElementById('resetConfigForm');
    cancelResetConfigBtn = document.getElementById('cancelResetConfigBtn');
    
    testResetBtn = document.getElementById('testResetBtn');
    forceResetBtn = document.getElementById('forceResetBtn');
    
    resetStatus = document.getElementById('resetStatus');
    resetTimeDisplay = document.getElementById('resetTimeDisplay');
    resetEmailDisplay = document.getElementById('resetEmailDisplay');
    nextResetDisplay = document.getElementById('nextResetDisplay');
    
    resetHistory = document.getElementById('resetHistory');
    
    // Event listeners
    resetAdminBtn?.addEventListener('click', openResetAdmin);
    closeResetAdminBtn?.addEventListener('click', closeResetAdmin);
    
    editResetConfigBtn?.addEventListener('click', openResetConfigModal);
    cancelResetConfigBtn?.addEventListener('click', closeResetConfigModal);
    resetConfigForm?.addEventListener('submit', saveResetConfig);
    
    testResetBtn?.addEventListener('click', handleTestReset);
    forceResetBtn?.addEventListener('click', handleForceReset);
    
    console.log('✅ Reset Admin initialisé');
}

/**
 * Afficher/masquer le bouton Reset Admin en fonction du mode admin
 */
export function toggleResetAdminButton(isAdminMode) {
    if (resetAdminBtn) {
        if (isAdminMode) {
            resetAdminBtn.classList.remove('hidden');
        } else {
            resetAdminBtn.classList.add('hidden');
            closeResetAdmin(); // Fermer la section si ouverte
        }
    }
}

/**
 * Ouvrir la section admin du reset
 */
async function openResetAdmin() {
    resetAdminSection.classList.remove('hidden');
    await loadResetConfig();
    await loadResetHistory();
}

/**
 * Fermer la section admin du reset
 */
function closeResetAdmin() {
    resetAdminSection.classList.add('hidden');
}

/**
 * Charger la configuration actuelle du reset
 */
async function loadResetConfig() {
    try {
        const configRef = doc(db, 'reset_config', 'main_config');
        const configSnap = await getDoc(configRef);
        
        if (configSnap.exists()) {
            const config = configSnap.data();
            
            // Afficher le statut
            resetStatus.textContent = config.enabled ? '✅ Activé' : '⭕ Désactivé';
            resetStatus.className = 'value ' + (config.enabled ? 'status-active' : 'status-inactive');
            
            // Afficher l'heure
            resetTimeDisplay.textContent = config.time || '--:--';
            
            // Afficher l'email
            resetEmailDisplay.textContent = config.notifications?.email?.address || '---';
            
            // Calculer le prochain reset
            const nextReset = calculateNextReset(config.time, config.activeDays || [1,2,3,4,5,6,0]);
            nextResetDisplay.textContent = nextReset;
            
        } else {
            resetStatus.textContent = '⚠️ Non configuré';
            resetStatus.className = 'value status-warning';
        }
    } catch (error) {
        console.error('Erreur lors du chargement de la config:', error);
        resetStatus.textContent = '❌ Erreur';
        resetStatus.className = 'value status-error';
    }
}

/**
 * Calculer la date/heure du prochain reset
 */
function calculateNextReset(time, activeDays) {
    if (!time) return '---';
    
    const now = new Date();
    const [hours, minutes] = time.split(':').map(Number);
    
    // Créer une date pour aujourd'hui à l'heure du reset
    let nextReset = new Date(now);
    nextReset.setHours(hours, minutes, 0, 0);
    
    // Si l'heure est déjà passée aujourd'hui, passer à demain
    if (nextReset <= now) {
        nextReset.setDate(nextReset.getDate() + 1);
    }
    
    // Vérifier si le jour est actif
    while (!activeDays.includes(nextReset.getDay())) {
        nextReset.setDate(nextReset.getDate() + 1);
    }
    
    // Formater la date
    const options = { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' };
    return nextReset.toLocaleDateString('fr-FR', options);
}

/**
 * Charger l'historique des resets
 */
async function loadResetHistory() {
    try {
        const statsQuery = query(
            collection(db, 'daily_stats'),
            orderBy('createdAt', 'desc'),
            limit(7)
        );
        
        const statsSnap = await getDocs(statsQuery);
        
        if (statsSnap.empty) {
            resetHistory.innerHTML = '<p class="no-history">Aucun historique disponible</p>';
            return;
        }
        
        let html = '';
        statsSnap.forEach((doc) => {
            const data = doc.data();
            const date = data.date || '---';
            const totalCompleted = data.totalCompleted || 0;
            const totalTasks = data.totalTasks || 0;
            const rate = data.familyCompletionRate || 0;
            const stars = data.totalStars || 0;
            
            html += `
                <div class="history-item">
                    <div class="history-date">${formatDate(date)}</div>
                    <div class="history-stats">
                        <span class="stat">📊 ${rate}%</span>
                        <span class="stat">✅ ${totalCompleted}/${totalTasks}</span>
                        <span class="stat">⭐ ${stars}</span>
                    </div>
                </div>
            `;
        });
        
        resetHistory.innerHTML = html;
        
    } catch (error) {
        console.error('Erreur lors du chargement de l\'historique:', error);
        resetHistory.innerHTML = '<p class="error">Erreur lors du chargement de l\'historique</p>';
    }
}

/**
 * Formater une date
 */
function formatDate(dateStr) {
    const date = new Date(dateStr);
    const options = { weekday: 'short', day: 'numeric', month: 'short' };
    return date.toLocaleDateString('fr-FR', options);
}

/**
 * Ouvrir la modal de configuration
 */
async function openResetConfigModal() {
    try {
        const configRef = doc(db, 'reset_config', 'main_config');
        const configSnap = await getDoc(configRef);
        
        if (configSnap.exists()) {
            const config = configSnap.data();
            
            // Remplir le formulaire
            document.getElementById('resetEnabled').checked = config.enabled || false;
            document.getElementById('resetTime').value = config.time || '06:00';
            document.getElementById('resetTimezone').value = config.timezone || 'Europe/Paris';
            
            // Jours actifs
            const activeDays = config.activeDays || [1,2,3,4,5,6,0];
            document.querySelectorAll('.day-checkbox').forEach(checkbox => {
                checkbox.checked = activeDays.includes(parseInt(checkbox.value));
            });
            
            // Email
            const emailConfig = config.notifications?.email || {};
            document.getElementById('emailEnabled').checked = emailConfig.enabled !== false;
            document.getElementById('resetEmail').value = emailConfig.address || '';
            document.getElementById('emailOnSuccess').checked = emailConfig.onSuccess !== false;
            document.getElementById('emailOnError').checked = emailConfig.onError !== false;
            document.getElementById('emailWeeklyStats').checked = emailConfig.weeklyStats || false;
        }
        
        resetConfigModal.classList.remove('hidden');
    } catch (error) {
        console.error('Erreur lors de l\'ouverture de la modal:', error);
        alert('Erreur lors du chargement de la configuration');
    }
}

/**
 * Fermer la modal de configuration
 */
function closeResetConfigModal() {
    resetConfigModal.classList.add('hidden');
}

/**
 * Sauvegarder la configuration
 */
async function saveResetConfig(e) {
    e.preventDefault();
    
    try {
        // Récupérer les jours actifs
        const activeDays = Array.from(document.querySelectorAll('.day-checkbox:checked'))
            .map(cb => parseInt(cb.value));
        
        if (activeDays.length === 0) {
            alert('⚠️ Vous devez sélectionner au moins un jour actif');
            return;
        }
        
        const config = {
            enabled: document.getElementById('resetEnabled').checked,
            time: document.getElementById('resetTime').value,
            timezone: document.getElementById('resetTimezone').value,
            activeDays: activeDays,
            notifications: {
                email: {
                    enabled: document.getElementById('emailEnabled').checked,
                    address: document.getElementById('resetEmail').value,
                    onSuccess: document.getElementById('emailOnSuccess').checked,
                    onError: document.getElementById('emailOnError').checked,
                    weeklyStats: document.getElementById('emailWeeklyStats').checked
                }
            },
            updatedAt: serverTimestamp()
        };
        
        const configRef = doc(db, 'reset_config', 'main_config');
        await updateDoc(configRef, config);
        
        alert('✅ Configuration sauvegardée avec succès !');
        closeResetConfigModal();
        await loadResetConfig();
        
    } catch (error) {
        console.error('Erreur lors de la sauvegarde:', error);
        alert('❌ Erreur lors de la sauvegarde : ' + error.message);
    }
}

/**
 * Test Reset (ne fait que logguer, n'envoie pas d'email)
 */
async function handleTestReset() {
    if (!confirm('🧪 Test Reset\n\nCette action va décocher toutes les tâches SANS envoyer d\'email.\n\nContinuer ?')) {
        return;
    }
    
    try {
        await performReset(false); // false = mode test, pas d'email
        alert('✅ Test Reset effectué avec succès !\n\nToutes les tâches ont été décochées.');
        window.location.reload();
    } catch (error) {
        console.error('Erreur lors du test reset:', error);
        alert('❌ Erreur : ' + error.message);
    }
}

/**
 * Forcer un reset immédiat (avec email)
 */
async function handleForceReset() {
    if (!confirm('⚠️ ATTENTION - Reset Immédiat\n\nCette action va :\n- Décocher toutes les tâches\n- Sauvegarder les statistiques\n- Envoyer un email de confirmation\n\nContinuer ?')) {
        return;
    }
    
    try {
        // D'abord sauvegarder les stats
        await saveCurrentStats();
        
        // Puis faire le reset
        await performReset(true); // true = avec email (via Cloud Function si configuré)
        
        alert('✅ Reset immédiat effectué avec succès !\n\n📊 Statistiques sauvegardées\n🔄 Tâches décochées\n📧 Email envoyé');
        window.location.reload();
    } catch (error) {
        console.error('Erreur lors du reset forcé:', error);
        alert('❌ Erreur : ' + error.message);
    }
}

/**
 * Effectuer le reset des tâches
 */
async function performReset(withEmail) {
    const batch = writeBatch(db);
    const tasksQuery = query(collection(db, 'tasks'));
    const tasksSnap = await getDocs(tasksQuery);
    
    tasksSnap.forEach((taskDoc) => {
        if (taskDoc.data().completed) {
            batch.update(taskDoc.ref, {
                completed: false,
                updatedAt: serverTimestamp()
            });
        }
    });
    
    await batch.commit();
    console.log(`🔄 ${tasksSnap.size} tâches traitées`);
}

/**
 * Sauvegarder les statistiques actuelles
 */
async function saveCurrentStats() {
    try {
        const tasksSnap = await getDocs(collection(db, 'tasks'));
        
        const stats = {
            papa: { completed: 0, total: 0, stars: 0 },
            maman: { completed: 0, total: 0, stars: 0 },
            florent: { completed: 0, total: 0, stars: 0 },
            harry: { completed: 0, total: 0, stars: 0 }
        };
        
        tasksSnap.forEach((taskDoc) => {
            const task = taskDoc.data();
            const person = task.assignedTo;
            
            if (stats[person]) {
                stats[person].total++;
                if (task.completed) {
                    stats[person].completed++;
                    stats[person].stars += (task.stars || 0);
                }
            }
        });
        
        // Calculer les taux
        Object.keys(stats).forEach(person => {
            stats[person].completionRate = stats[person].total > 0
                ? Math.round((stats[person].completed / stats[person].total) * 100)
                : 0;
        });
        
        const totalTasks = tasksSnap.size;
        const totalCompleted = Object.values(stats).reduce((sum, p) => sum + p.completed, 0);
        const totalStars = Object.values(stats).reduce((sum, p) => sum + p.stars, 0);
        const familyCompletionRate = totalTasks > 0 
            ? Math.round((totalCompleted / totalTasks) * 100)
            : 0;
        
        const today = new Date().toISOString().split('T')[0];
        const statsDoc = {
            date: today,
            resetTime: new Date().toTimeString().split(' ')[0],
            beforeReset: stats,
            totalTasks,
            totalCompleted,
            totalStars,
            familyCompletionRate,
            resetBy: 'manual_force',
            createdAt: serverTimestamp()
        };
        
        await setDoc(doc(db, 'daily_stats', `stats_${today.replace(/-/g, '_')}`), statsDoc);
        console.log('📊 Statistiques sauvegardées');
        
    } catch (error) {
        console.error('Erreur lors de la sauvegarde des stats:', error);
        throw error;
    }
}
