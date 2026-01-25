/**
 * Module autonome pour la page admin.html
 * Gestion de l'interface admin pour le reset automatique
 */

import { getFirestore, doc, getDoc, updateDoc, collection, query, orderBy, limit, getDocs, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';

const db = getFirestore();
const functions = window.functions;

// Éléments DOM
let editResetConfigBtn, resetConfigModal, resetConfigForm, cancelResetConfigBtn;
let testResetBtn, forceResetBtn;
let resetStatus, resetTimeDisplay, resetEmailDisplay, nextResetDisplay;
let resetHistory;

/**
 * Initialiser l'interface admin du reset
 */
export function initResetAdmin() {
    console.log('🔧 Initialisation Admin Reset...');
    
    // Récupérer les éléments DOM
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
    editResetConfigBtn?.addEventListener('click', openResetConfigModal);
    cancelResetConfigBtn?.addEventListener('click', closeResetConfigModal);
    resetConfigForm?.addEventListener('submit', saveResetConfig);
    
    testResetBtn?.addEventListener('click', handleTestReset);
    forceResetBtn?.addEventListener('click', handleForceReset);
    
    // Charger les données
    loadResetConfig();
    loadResetHistory();
    
    console.log('✅ Admin Reset initialisé');
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
            resetHistory.innerHTML = '<p class="no-history">Aucun historique disponible. Le premier reset aura lieu demain matin.</p>';
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
            document.getElementById('resetEmail').value = emailConfig.address || 'pierre.thonon@gmail.com';
            document.getElementById('emailOnSuccess').checked = emailConfig.onSuccess !== false;
            document.getElementById('emailOnError').checked = emailConfig.onError !== false;
            document.getElementById('emailWeeklyStats').checked = emailConfig.weeklyStats || false;
        }
        
        resetConfigModal.classList.remove('hidden');
    } catch (error) {
        console.error('Erreur lors de l\'ouverture de la modal:', error);
        alert('❌ Erreur lors du chargement de la configuration');
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
    if (!confirm('🧪 Test Reset\n\nCette action va :\n- Sauvegarder les statistiques\n- Décocher toutes les tâches\n- SANS envoyer d\'email\n\nContinuer ?')) {
        return;
    }
    
    // Afficher un loader
    testResetBtn.disabled = true;
    testResetBtn.textContent = '⏳ Reset en cours...';
    
    try {
        const manualReset = httpsCallable(functions, 'manualTaskReset');
        const result = await manualReset({ testMode: true });
        
        console.log('✅ Test reset:', result.data);
        
        alert(`✅ Test Reset effectué avec succès !\n\n📊 Statistiques sauvegardées\n🔄 ${result.data.resetCount} tâches décochées`);
        await loadResetHistory();
    } catch (error) {
        console.error('Erreur lors du test reset:', error);
        alert('❌ Erreur : ' + error.message);
    } finally {
        testResetBtn.disabled = false;
        testResetBtn.textContent = '⚙️ Test Reset (Mode Test)';
    }
}

/**
 * Forcer un reset immédiat (avec email via stats sauvegardées)
 */
async function handleForceReset() {
    if (!confirm('⚠️ ATTENTION - Reset Immédiat\n\nCette action va :\n- Sauvegarder les statistiques actuelles\n- Décocher toutes les tâches\n- Envoyer un email de confirmation\n\nContinuer ?')) {
        return;
    }
    
    // Afficher un loader
    forceResetBtn.disabled = true;
    forceResetBtn.textContent = '⏳ Reset en cours...';
    
    try {
        const manualReset = httpsCallable(functions, 'manualTaskReset');
        const result = await manualReset({ testMode: false });
        
        console.log('✅ Force reset:', result.data);
        
        alert(`✅ Reset immédiat effectué avec succès !\n\n📊 Statistiques sauvegardées\n🔄 ${result.data.resetCount} tâches décochées\n📧 Email envoyé`);
        await loadResetHistory();
        await loadResetConfig();
    } catch (error) {
        console.error('Erreur lors du reset forcé:', error);
        alert('❌ Erreur : ' + error.message);
    } finally {
        forceResetBtn.disabled = false;
        forceResetBtn.textContent = '🔄 Forcer Reset Immédiat';
    }
}

