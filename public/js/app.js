import { 
    collection, addDoc, updateDoc, doc, onSnapshot, query, where, serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let selectedDayView = new Date().getDay(); 
const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

document.addEventListener('DOMContentLoaded', () => {
    updateDayUI();
    listenToTasks();
    setupFormLogic();
});

function setupFormLogic() {
    const categorySelect = document.getElementById('category');
    const specificDateGroup = document.getElementById('specificDateGroup');
    const daysSelectionGroup = document.getElementById('daysSelectionGroup');
    const dateLabel = document.getElementById('dateLabel');
    const taskForm = document.getElementById('taskForm');

    categorySelect.addEventListener('change', () => {
        const val = categorySelect.value;
        if (val === 'ponctuel' || val === 'mensuel') {
            specificDateGroup.style.display = 'block';
            daysSelectionGroup.style.display = 'none';
            dateLabel.innerText = val === 'mensuel' ? "Date du mois concerné" : "Date spécifique";
        } else if (val === 'hebdomadaire') {
            specificDateGroup.style.display = 'none';
            daysSelectionGroup.style.display = 'none'; 
        } else {
            specificDateGroup.style.display = 'none';
            daysSelectionGroup.style.display = 'none';
        }
    });

    document.getElementById('toggleFormBtn').onclick = () => taskForm.classList.toggle('hidden');
    taskForm.onsubmit = handleTaskSubmit;
}

async function handleTaskSubmit(e) {
    e.preventDefault();
    const category = document.getElementById('category').value;
    const title = document.getElementById('taskTitle').value.trim();
    const assignedTo = document.getElementById('assignedTo').value;
    
    const isBonus = /bonus/i.test(title);

    try {
        if (category === 'quotidien') {
            for (let i = 0; i <= 6; i++) {
                await saveTask(title, category, assignedTo, i, isBonus);
            }
        } else if (category === 'hebdomadaire') {
            await saveTask(title, category, assignedTo, 0, isBonus);
        } else if (category === 'mensuel' || category === 'ponctuel') {
            const dateVal = document.getElementById('specificDate').value;
            if (!dateVal) return alert("Sélectionnez une date");
            const dateObj = new Date(dateVal);
            await saveTask(title, category, assignedTo, dateObj.getDay(), isBonus, dateVal);
        }
        resetForm();
    } catch (err) { console.error(err); }
}

async function saveTask(title, category, assignedTo, dayOfWeek, isBonus = false, fullDate = null) {
    await addDoc(collection(window.db, "tasks"), {
        title, category, assignedTo, dayOfWeek, fullDate,
        completed: false, stars: 3, isBonus: isBonus, createdAt: serverTimestamp()
    });
}

window.resetForm = () => {
    document.getElementById('taskForm').reset();
    document.getElementById('taskForm').classList.add('hidden');
};

window.changeDay = (dayIndex) => {
    selectedDayView = dayIndex;
    updateDayUI();
    listenToTasks();
};

window.changeDayRelative = (offset) => {
    selectedDayView = (selectedDayView + offset + 7) % 7;
    updateDayUI();
    listenToTasks();
};

function updateDayUI() {
    const today = new Date().getDay();
    document.getElementById('dayNavigationTitle').innerText = 
        `📅 ${dayNames[selectedDayView].toUpperCase()} ${selectedDayView === today ? "(Aujourd'hui)" : ""}`;

    document.querySelectorAll('.filter-btn').forEach((btn) => {
        if(btn.id.startsWith('dayBtn')) {
            const dayIdx = parseInt(btn.id.replace('dayBtn', ''));
            btn.classList.toggle('active', dayIdx === selectedDayView);
        }
    });
}

// Base : max 20 min à 100% des tâches normales
function getBaseScreenMinutes(normalPercent) {
    return Math.round((normalPercent / 100) * 20);
}

function listenToTasks() {
    const q = query(collection(window.db, "tasks"), where("dayOfWeek", "==", selectedDayView));
    onSnapshot(q, (snapshot) => {
        const stats = { papa: {}, maman: {}, florent: {}, harry: {} };

        ['papa', 'maman', 'florent', 'harry'].forEach(p => {
            stats[p] = {
                normalTotal: 0,
                normalEarned: 0,
                bonusEarned: 0
            };
            document.getElementById(`tasks-${p}`).innerHTML = '';
        });

        // Passe 1 : tâches normales + affichage
        snapshot.forEach(docSnap => {
            const task = docSnap.data();
            const person = task.assignedTo;
            const stars = task.stars || 3;
            const isBonus = task.isBonus === true;

            const taskEl = createTaskElement(docSnap.id, task);
            document.getElementById(`tasks-${person}`).appendChild(taskEl);

            if (!isBonus) {
                stats[person].normalTotal += stars;
                if (task.completed) stats[person].normalEarned += stars;
            }
        });

        // Passe 2 : bonus uniquement si 100% normal
        snapshot.forEach(docSnap => {
            const task = docSnap.data();
            const person = task.assignedTo;
            const stars = task.stars || 3;
            if (task.isBonus && task.completed) {
                const normalPercent = stats[person].normalTotal > 0 
                    ? (stats[person].normalEarned / stats[person].normalTotal) 
                    : 1;
                if (normalPercent === 1) {
                    stats[person].bonusEarned += stars;
                }
            }
        });

        // Mise à jour affichage
        ['papa', 'maman', 'florent', 'harry'].forEach(person => {
            const s = stats[person];
            const normalMax = s.normalTotal || 1;
            const earned = s.normalEarned + s.bonusEarned;

            // Étoiles : earned / normalMax
            document.getElementById(`stars-count-${person}`).innerHTML = 
                `${earned} <span style="font-size: 0.8em; opacity: 0.7;">/ ${normalMax}</span>`;

            // % peut dépasser 100%
            const percent = (earned / normalMax) * 100;
            document.getElementById(`percentage-${person}`).textContent = `${Math.round(percent)}%`;
            document.getElementById(`progress-fill-${person}`).style.width = `${Math.min(160, percent)}%`;

            // Temps d'écran seulement pour enfants
            if (person === 'florent' || person === 'harry') {
                const normalPercent = (s.normalEarned / normalMax) * 100;
                const baseMin = getBaseScreenMinutes(normalPercent);
                const bonusMin = s.bonusEarned; // +1 min par étoile bonus
                const totalMin = baseMin + bonusMin;

                document.getElementById(`base-minutes-${person}`).textContent = baseMin;
                document.getElementById(`screen-minutes-${person}`).textContent = totalMin;
                document.getElementById(`bonus-minutes-${person}`).textContent = bonusMin;
                document.getElementById(`total-minutes-${person}`).textContent = totalMin;

                document.getElementById(`base-time-${person}`).style.display = 'inline';
                document.getElementById(`screen-time-badge-${person}`).style.display = 'inline';
                document.getElementById(`bonus-time-${person}`).style.display = bonusMin > 0 ? 'inline' : 'none';
            } else {
                document.getElementById(`base-time-${person}`).style.display = 'none';
                document.getElementById(`screen-time-badge-${person}`).style.display = 'none';
                document.getElementById(`bonus-time-${person}`).style.display = 'none';
            }
        });
    });
}

function createTaskElement(id, task) {
    const div = document.createElement('div');
    div.className = `task-item ${task.completed ? 'completed' : ''}`;
    
    const bonusBadge = task.isBonus ? '<span style="background:#ffeb3b; color:#333; padding:2px 8px; border-radius:8px; font-size:0.8em; margin-left:8px;">BONUS</span>' : '';

    div.innerHTML = `
        <div class="task-header">
            <div class="checkbox ${task.completed ? 'checked' : ''}" onclick="toggleStatus('${id}', ${!task.completed})"></div>
            <div class="task-content">
                <span class="task-title">${task.title}${bonusBadge}</span>
                <div class="task-meta">
                    <span class="task-category">${task.category}</span>
                    <span class="task-stars">⭐ ${task.stars || 3}</span>
                </div>
            </div>
        </div>
    `;
    return div;
}

window.toggleStatus = async (id, status) => {
    await updateDoc(doc(window.db, "tasks", id), { completed: status });
};