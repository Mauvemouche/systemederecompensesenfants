const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccount = require(path.join(__dirname, 'systemederecompensesenfants-firebase-adminsdk-fbsvc-4851826d17.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const tasksCollection = db.collection("tasks");

// Fonction pour ajouter les tâches dans Firestore
async function addTaskToFirestore(taskData) {
  try {
    await tasksCollection.add(taskData);
    console.log(`Tâche ajoutée : ${taskData.title}`);
  } catch (error) {
    console.error("Erreur lors de l'ajout de la tâche :", error);
  }
}

// Fonction principale pour importer le fichier JSON
async function importJSON(filePath) {
  // Lire le fichier JSON
  fs.readFile(filePath, "utf8", async (err, data) => {
    if (err) {
      console.error("Erreur lors de la lecture du fichier JSON :", err);
      return;
    }

    const tasks = JSON.parse(data); // Convertir le JSON en objet JavaScript

    // Traiter chaque tâche dans le JSON
    for (const task of tasks) {
      let { title, assignedTo, stars, category, completed, dayOfWeek, order, description, isBonus, isPenalty, isSeriousFault } = task;

      // Forcer la minuscule sur assignedTo avant toute utilisation
      assignedTo = assignedTo ? assignedTo.toLowerCase() : '';  // Mettre en minuscule

      // Vérifier que la catégorie est renseignée, sinon afficher une erreur
      if (!category) {
        console.error(`Erreur : catégorie vide pour la tâche "${title}"`);
        continue; // Ignore cette ligne si category est vide
      }

      // Vérifier si "assignedTo" est "tous" ou "enfants"
      const people = [];

      if (assignedTo === "enfants") {
        // Si "enfants", ajouter Florent et Harry
        people.push("florent", "harry");
      } else if (assignedTo === "tous") {
        // Si "tous", ajouter Florent, Harry, Papa et Maman
        people.push("florent", "harry", "papa", "maman");
      } else if (assignedTo) {
        // Si non, simplement ajouter la personne spécifiée
        people.push(assignedTo);
      }

      // Règles de récurrence en fonction de la catégorie
      let recurEvery1Days = 0;
      let recurEvery7Days = 0;
      let recurEvery1Month = 0;

      if (category.toLowerCase() === "quotidien") {
        recurEvery1Days = 1; // Répéter tous les jours
      } else if (category.toLowerCase() === "hebdomadaire") {
        recurEvery7Days = 1; // Répéter toutes les 7 jours (hebdomadaire)
      } else if (category.toLowerCase() === "mensuel") {
        recurEvery1Month = 1; // Répéter tous les mois
      }

      // Si category est "quotidien", créer des tâches pour chaque jour
      if (category.toLowerCase() === "quotidien") {
        // Créer 7 tâches par personne (1 par jour de la semaine)
        for (let i = 0; i < 7; i++) {
          for (const person of people) {
            const taskData = {
              title,
              description,
              assignedTo: person,
              stars,
              category,
              completed: false, // Par défaut à false
              dayOfWeek: i, // Assignation des jours de 0 à 6
              order: order || null,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              isBonus,
              isPenalty,
              isSeriousFault,
              recurEvery1Days, // Ajout de la récurrence quotidienne
            };
            await addTaskToFirestore(taskData);
          }
        }
      } else {
        // Sinon, créer une seule tâche par personne
        for (const person of people) {
          const taskData = {
            title,
            description,
            assignedTo: person,
            stars,
            category,
            completed: false, // Par défaut à false
            dayOfWeek,
            order: order || null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            isBonus,
            isPenalty,
            isSeriousFault,
            recurEvery7Days, // Ajout de la récurrence hebdomadaire
            recurEvery1Month, // Ajout de la récurrence mensuelle
          };
          await addTaskToFirestore(taskData);
        }
      }
    }

    console.log(`Toutes les tâches ont été importées.`);
  });
}

// Lancer l'importation du fichier JSON
const jsonFilePath = path.join(__dirname, 'tasks.json'); // Remplacez 'tasks.json' par le chemin de votre fichier JSON
importJSON(jsonFilePath);
