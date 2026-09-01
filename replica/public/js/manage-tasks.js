import {
    collection,
    doc,
    query,
    where,
    orderBy,
    onSnapshot,
    updateDoc,
    deleteDoc,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// État global
let currentPerson = 'papa';
let currentDay = 1; // Lundi par défaut
let unsubscribe = null;
let currentTasks = []; // Pour stocker les tâches chargées

document.addEventListener('DOMContentLoaded', () => {
    // Vérifier accès admin
    if (sessionStorage.getItem('isAdminMode') !== 'true') {
        window.location.href = 'index.html';
        return;
    }

    initializeControls();
    initializeEditListeners();
    // Le chargement initial se fera après l'initialisation des contrôles
});

function initializeControls() {
    const personSelect = document.getElementById('personSelect');
    const daySelect = document.getElementById('daySelect');

    // Définir le jour actuel par défaut
    const today = new Date().getDay();
    daySelect.value = today.toString();
    currentDay = today;

    // Listeners
    personSelect.addEventListener('change', (e) => {
        currentPerson = e.target.value;
        loadTasks();
    });

    daySelect.addEventListener('change', (e) => {
        currentDay = parseInt(e.target.value);
        loadTasks();
    });

    // Chargement initial
    loadTasks();
}

function loadTasks() {
    if (unsubscribe) {
        unsubscribe();
    }

    const tasksList = document.getElementById('tasksList');
    tasksList.innerHTML = '<div class="empty-state">Chargement des tâches...</div>';

    // Requête : Filtrer par personne, puis trier par ordre
    // Note: On filtre par jour côté client si nécessaire car la structure actuelle 
    // semble avoir 'dayOfWeek' dans le doc.

    // Pour simplifier et être sûr d'avoir tout, on prend toutes les tâches de la personne
    // et on filtre le jour en JS (comme dans app.js apparemment)
    // OU on utilise la query composée si l'index existe.
    // D'après app.js: const q = query(collection(window.db, 'tasks'), orderBy('assignedTo'), orderBy('order'));
    // Il charge tout.

    // On va faire pareil pour être cohérent et éviter les problèmes d'index manquants pour l'instant
    // Mais on filtre par 'assignedTo' pour réduire un peu.

    const q = query(
        collection(window.db, 'tasks'),
        where('assignedTo', '==', currentPerson)
    );

    unsubscribe = onSnapshot(q, (snapshot) => {
        const tasks = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // Filtrer par jour (et inclure les anciennes tâches sans jour si nécessaire, 
            // mais ici on veut gérer le jour précis, donc on ne devrait voir QUE celles du jour ?)
            // Dans app.js, les anciennes tâches s'affichent partout.
            // Ici, affichons les tâches du jour séléctionné + les tâches sans jour (legacy)
            if (data.dayOfWeek === currentDay || data.dayOfWeek === undefined || data.dayOfWeek === null) {
                tasks.push({
                    id: doc.id,
                    ...data
                });
            }
        });

        // Trier par ordre
        tasks.sort((a, b) => (a.order || 0) - (b.order || 0));

        currentTasks = tasks;
        renderTasks(tasks);
    }, (error) => {
        console.error("Erreur chargement:", error);
        tasksList.innerHTML = `<div class="empty-state" style="color:red">Erreur: ${error.message}</div>`;
    });
}

function renderTasks(tasks) {
    const container = document.getElementById('tasksList');
    container.innerHTML = '';

    if (tasks.length === 0) {
        container.innerHTML = '<div class="empty-state">Aucune tâche pour ce jour.</div>';
        return;
    }

    tasks.forEach((task, index) => {
        const row = document.createElement('div');
        row.className = 'task-row';
        row.draggable = true;
        row.dataset.taskId = task.id;
        row.dataset.currentOrder = task.order || 0;

        // Style visuel pour inactif
        if (task.isActive === false) {
            row.style.opacity = '0.6';
            row.style.background = '#f5f5f5';
        }

        // Icône selon type
        let icon = '';
        if (task.isBonus) icon = '🎁 ';
        if (task.isPenalty) icon = '⛔ ';
        if (task.isSeriousFault) icon = '💀 ';

        row.innerHTML = `
            <div class="row-handle">⋮⋮</div>
            <div class="row-position">
                <input type="number" value="${task.order !== undefined ? task.order : index}" 
                       min="0" class="position-input" data-id="${task.id}">
            </div>
            <div class="row-content">
                <div class="row-title">
                    ${icon}${escapeHtml(task.title)}
                    ${task.dayOfWeek === undefined ? '<span style="font-size:0.8em; color:orange">(Tous les jours)</span>' : ''}
                </div>
                <div class="row-stars">
                    ${task.stars} ⭐
                </div>
                <!-- Status Badge -->
                <div style="min-width: 80px; text-align: center;">
                    ${task.isActive === false
                ? '<span style="background:#eee; color:#666; padding:4px 8px; border-radius:12px; font-size:0.8rem;">Inactif</span>'
                : '<span style="background:#e8f5e9; color:#2e7d32; padding:4px 8px; border-radius:12px; font-size:0.8rem;">Actif</span>'}
                </div>
            </div>
            <div class="row-actions">
                <button class="btn-icon" onclick="toggleTaskActive('${task.id}', ${task.isActive !== false})" 
                        title="${task.isActive === false ? 'Réactiver' : 'Désactiver'}">
                    ${task.isActive === false ? '👁️' : '👁️‍🗨️'}
                </button>
                <button class="btn-icon" onclick="editTask('${task.id}')" title="Modifier">✏️</button>
                <button class="btn-icon" onclick="deleteTask('${task.id}')" title="Supprimer" style="color: #f44336;">🗑️</button>
            </div>
        `;

        // Event listeners pour drag & drop
        row.addEventListener('dragstart', handleDragStart);
        row.addEventListener('dragover', handleDragOver);
        row.addEventListener('drop', handleDrop);
        row.addEventListener('dragend', handleDragEnd);

        // Event listener pour changement manuel de position
        const posInput = row.querySelector('.position-input');
        posInput.addEventListener('change', handlePositionChange);

        container.appendChild(row);
    });
}

// ===== Gestion de l'édition =====
window.editTask = function (taskId) {
    // Trouver la tâche dans les données locales ou via DOM serait risqué si données changent.
    // Idéalement on garde une map des tâches chargées, ou on récupère du DOM si simple.
    // Ici on va faire un getDoc rapide ou utiliser une map globale.
    // Pour simplifier, on va stocker les tâches courantes dans une variable globale.
    const task = currentTasks.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById('editTaskId').value = task.id;
    document.getElementById('editTaskTitle').value = task.title;
    document.getElementById('editTaskDescription').value = task.description || '';
    document.getElementById('editAssignedTo').value = task.assignedTo;
    document.getElementById('editStars').value = task.stars || 3;
    document.getElementById('editCategory').value = task.category || 'quotidien';

    document.getElementById('editTaskModal').classList.remove('hidden');
};

// Initialisation des listeners pour l'édition
function initializeEditListeners() {
    const editForm = document.getElementById('editTaskForm');
    const cancelBtn = document.getElementById('cancelEditBtn');

    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const taskId = document.getElementById('editTaskId').value;

            try {
                await updateDoc(doc(window.db, 'tasks', taskId), {
                    title: document.getElementById('editTaskTitle').value,
                    description: document.getElementById('editTaskDescription').value,
                    assignedTo: document.getElementById('editAssignedTo').value,
                    stars: parseInt(document.getElementById('editStars').value),
                    category: document.getElementById('editCategory').value,
                    updatedAt: serverTimestamp()
                });

                document.getElementById('editTaskModal').classList.add('hidden');
                showNotification('Tâche modifiée avec succès', 'success');
            } catch (error) {
                console.error("Erreur update:", error);
                showNotification('Erreur lors de la modification', 'error');
            }
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            document.getElementById('editTaskModal').classList.add('hidden');
        });
    }
}

// ===== Gestion de la suppression =====
window.deleteTask = async function (taskId) {
    if (confirm('Êtes-vous sûr de vouloir supprimer cette tâche ?')) {
        try {
            await deleteDoc(doc(window.db, 'tasks', taskId));
            showNotification('Tâche supprimée', 'success');
        } catch (error) {
            console.error("Erreur suppression:", error);
            showNotification('Erreur lors de la suppression', 'error');
        }
    }
}


// ===== Gestion Active/Inactive =====
window.toggleTaskActive = async function (taskId, currentStatus) {
    // currentStatus est true si actif, false si inactif
    // On veut inverser
    const newStatus = !currentStatus;

    try {
        await updateDoc(doc(window.db, 'tasks', taskId), {
            isActive: newStatus,
            updatedAt: serverTimestamp()
        });
        showNotification(newStatus ? 'Tâche réactivée' : 'Tâche désactivée', 'success');
    } catch (error) {
        console.error("Erreur toggle active:", error);
        showNotification('Erreur lors du changement de statut', 'error');
    }
};

// ===== Logic Drag & Drop =====
let draggedItem = null;

function handleDragStart(e) {
    draggedItem = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Ajouter classe visuelle
    if (this !== draggedItem) {
        this.classList.add('drag-over');
    }
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.task-row').forEach(row => row.classList.remove('drag-over'));
    draggedItem = null;
}

function handleDrop(e) {
    e.stopPropagation();
    e.preventDefault();

    if (draggedItem !== this) {
        // Réorganiser le DOM pour l'effet visuel immédiat
        const container = document.getElementById('tasksList');
        const rows = Array.from(container.querySelectorAll('.task-row'));
        const fromIndex = rows.indexOf(draggedItem);
        const toIndex = rows.indexOf(this);

        if (fromIndex < toIndex) {
            this.after(draggedItem);
        } else {
            this.before(draggedItem);
        }

        // Sauvegarder le nouvel ordre
        saveNewOrder();
    }

    return false;
}

// ===== Logic Position Manuelle =====
function handlePositionChange(e) {
    const newPos = parseInt(e.target.value);
    const taskId = e.target.dataset.id;

    // On veut déplacer cette tâche à la position 'newPos'
    // Stratégie: Mettre à jour l'ordre de cette tâche et décaler les autres

    // Pour simplifier : on met à jour le champ order directement, 
    // mais idéalement il faudrait une renumérotation complète pour éviter les doublons/trous.
    // L'approche la plus robuste ici est de récupérer l'élément, le déplacer dans le DOM
    // à la bonne place, puis lancer saveNewOrder().

    const container = document.getElementById('tasksList');
    const rows = Array.from(container.querySelectorAll('.task-row'));
    const taskRow = rows.find(row => row.dataset.taskId === taskId);

    if (!taskRow) return;

    // Retirer du DOM
    taskRow.remove();

    // Réinsérer à la position cible (ajustée aux bornes)
    let targetIndex = newPos; // Si 0-based
    // L'utilisateur pense souvent en 1-based, mais ici on affiche l'index 0-based ou ce qui est stocké.
    // Supposons que l'input affiche (0, 1, 2...)

    if (targetIndex < 0) targetIndex = 0;
    if (targetIndex >= rows.length) targetIndex = rows.length - 1;

    const remainingRows = Array.from(container.querySelectorAll('.task-row'));

    if (targetIndex >= remainingRows.length) {
        container.appendChild(taskRow);
    } else {
        container.insertBefore(taskRow, remainingRows[targetIndex]);
    }

    saveNewOrder();
}

async function saveNewOrder() {
    const container = document.getElementById('tasksList');
    const rows = container.querySelectorAll('.task-row');

    const updates = [];

    rows.forEach((row, index) => {
        const taskId = row.dataset.taskId;
        const currentOrderInput = row.querySelector('.position-input');

        // Mettre à jour l'input visuellement
        if (currentOrderInput) currentOrderInput.value = index;

        // Préparer update Firestore
        // Note: On met à jour toutes les tâches pour garantir une suite propre 0, 1, 2...
        updates.push(
            updateDoc(doc(window.db, 'tasks', taskId), {
                order: index,
                updatedAt: serverTimestamp()
            })
        );
    });

    try {
        await Promise.all(updates);
        showNotification("Ordre mis à jour !", "success");
    } catch (error) {
        console.error("Erreur sauvegarde:", error);
        showNotification("Erreur lors de la sauvegarde de l'ordre", "error");
    }
}

// Utilitaires
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    // Style basique si CSS pas chargé
    Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '15px 25px',
        background: type === 'error' ? '#f44336' : '#4CAF50',
        color: 'white',
        borderRadius: '8px',
        zIndex: 10000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
    });

    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}
