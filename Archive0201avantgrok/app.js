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
            // On cache la sélection de jours car c'est forcément le dimanche selon vos nouveaux titres
            daysSelectionGroup.style.display = 'none'; 
        } else { // quotidien
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
    const title = document.getElementById('taskTitle').value;
    const assignedTo = document.getElementById('assignedTo').value;
    
    try {
        if (category === 'quotidien') {
            for (let i = 0; i <= 6; i++) {
                await saveTask(title, category, assignedTo, i);
            }
        } else if (category === 'hebdomadaire') {
            // Sauvegarde forcée sur le Dimanche (jour 0)
            await saveTask(title, category, assignedTo, 0);
        } else if (category === 'mensuel' || category === 'ponctuel') {
            const dateVal = document.getElementById('specificDate').value;
            if (!dateVal) return alert("Sélectionnez une date");
            const dateObj = new Date(dateVal);
            await saveTask(title, category, assignedTo, dateObj.getDay(), dateVal);
        }
        resetForm();
    } catch (err) { console.error(err); }
}

async function saveTask(title, category, assignedTo, dayOfWeek, fullDate = null) {
    await addDoc(collection(window.db, "tasks"), {
        title, category, assignedTo, dayOfWeek, fullDate,
        completed: false, stars: 3, createdAt: serverTimestamp()
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

function listenToTasks() {
    const q = query(collection(window.db, "tasks"), where("dayOfWeek", "==", selectedDayView));
    onSnapshot(q, (snapshot) => {
        const earned = { papa: 0, maman: 0, florent: 0, harry: 0 };
        const totalPossible = { papa: 0, maman: 0, florent: 0, harry: 0 };

        ['papa', 'maman', 'florent', 'harry'].forEach(p => document.getElementById(`tasks-${p}`).innerHTML = '');

        snapshot.forEach(docSnap => {
            const task = docSnap.data();
            const person = task.assignedTo;
            const stars = task.stars || 3;

            const taskEl = createTaskElement(docSnap.id, task);
            document.getElementById(`tasks-${person}`).appendChild(taskEl);

            totalPossible[person] += stars;
            if (task.completed) earned[person] += stars;
        });

        ['papa', 'maman', 'florent', 'harry'].forEach(person => {
            const el = document.getElementById(`stars-count-${person}`);
            if (el) {
                el.innerHTML = `${earned[person]} <span style="font-size: 0.8em; opacity: 0.7;">/ ${totalPossible[person]}</span>`;
            }
        });
    });
}

function createTaskElement(id, task) {
    const div = document.createElement('div');
    div.className = `task-item ${task.completed ? 'completed' : ''}`;
    div.innerHTML = `
        <div class="task-header">
            <div class="checkbox ${task.completed ? 'checked' : ''}" onclick="toggleStatus('${id}', ${!task.completed})"></div>
            <div class="task-content">
                <span class="task-title">${task.title}</span>
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