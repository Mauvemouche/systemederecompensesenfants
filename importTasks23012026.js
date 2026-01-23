const admin = require("firebase-admin");
const fs = require("fs");

// ✅ clé admin (comme pour l’export)
const serviceAccount = require("./systemederecompensesenfants-firebase-adminsdk-fbsvc-12782cb2d9");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const FILE = "./tasks_import_florent_harry.json";
const COLLECTION = "tasks";

async function importTasks() {
  const raw = fs.readFileSync(FILE, "utf8");
  const tasks = JSON.parse(raw);

  console.log(`📦 ${tasks.length} tâches à importer...`);

  const batch = db.batch();
  let count = 0;

  for (const task of tasks) {
    const docRef = db.collection(COLLECTION).doc(); // id auto
    batch.set(docRef, {
      ...task,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    count++;

    // Firestore limite à 500 opérations par batch
    // Ici on fait simple : 1 seul batch (max 500 ok)
  }

  await batch.commit();
  console.log(`✅ Import terminé : ${count} documents ajoutés dans ${COLLECTION}`);
}

importTasks().catch(console.error);
