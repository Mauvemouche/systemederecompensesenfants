const admin = require("firebase-admin");
const fs = require("fs").promises;
const path = require("path");

const serviceAccount = require(path.join(__dirname, 'systemederecompensesenfants-f16a009d4b9f.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const tasksCollection = db.collection("tasks");

async function addTaskToFirestore(taskData) {
  try {
    await tasksCollection.add(taskData);
    const dayName = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][taskData.dayOfWeek] || 'N/A';
    console.log(`✓ ${taskData.title} | ${taskData.assignedTo} | ${dayName} | ${taskData.category}`);
  } catch (error) {
    console.error("✗ Erreur ajout :", error);
  }
}

(async () => {
  try {
    const data = await fs.readFile(path.join(__dirname, 'tasks.json'), "utf8");
    const tasks = JSON.parse(data);

    console.log(`\nDébut de l'import de ${tasks.length} modèle(s) de tâches...\n`);

    let total = 0;

    for (const task of tasks) {
      let {
        title = "",
        description = "",
        assignedTo = "",
        stars = 1,
        category = "",
        order = null,
        isBonus = false,
        isPenalty = false,
        isSeriousFault = false,
        dayOfWeek = null
      } = task;

      title = title.trim();
      assignedTo = assignedTo ? assignedTo.toLowerCase().trim() : "";
      category = category ? category.toLowerCase().trim() : "";

      if (!title || !category || !assignedTo) {
        console.warn(`⚠️ Tâche ignorée (données manquantes) : ${title || 'sans titre'}`);
        continue;
      }

      const people = [];
      if (assignedTo === "enfants") {
        people.push("florent", "harry");
      } else if (assignedTo === "tous") {
        people.push("florent", "harry", "papa", "maman");
      } else {
        people.push(assignedTo);
      }

      const baseData = {
        title,
        description: description.trim(),
        stars: Number(stars),
        category,
        completed: false,
        order,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        isBonus: Boolean(isBonus),
        isPenalty: Boolean(isPenalty),
        isSeriousFault: Boolean(isSeriousFault),
        formatVersion: "new"
      };

      if (category === "quotidien") {
        // Quotidiennes : 7 instances
        for (let day = 0; day < 7; day++) {
          for (const person of people) {
            await addTaskToFirestore({
              ...baseData,
              assignedTo: person,
              dayOfWeek: day
            });
            total++;
          }
        }
      } else {
        // Hebdo, mensuel, ponctuel : une seule instance, dimanche par défaut
        const finalDayOfWeek = dayOfWeek ?? 0;

        for (const person of people) {
          await addTaskToFirestore({
            ...baseData,
            assignedTo: person,
            dayOfWeek: finalDayOfWeek
          });
          total++;
        }
      }
    }

    console.log(`\n✅ Import terminé avec succès : ${total} tâches créées.`);
    console.log(`   → Quotidiennes : 7 jours`);
    console.log(`   → Hebdo/mensuelles/autres : placées le dimanche`);

  } catch (err) {
    console.error("❌ Erreur fatale lors de l'import :", err);
  }
})();