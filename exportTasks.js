// exportTasks.js
const admin = require('firebase-admin');
const fs = require('fs');

admin.initializeApp({
  credential: admin.credential.applicationDefault(), // 👈 prend GOOGLE_APPLICATION_CREDENTIALS
});

const db = admin.firestore();
const COLLECTION_NAME = 'tasks';

async function exportCollection() {
  try {
    const snapshot = await db.collection(COLLECTION_NAME).get();
    if (snapshot.empty) {
      console.log('Aucun document trouvé dans la collection', COLLECTION_NAME);
      return;
    }
    const data = {};
    snapshot.forEach(doc => { data[doc.id] = doc.data(); });

    const filename = `${COLLECTION_NAME}_export.json`;
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`✅ Export terminé ! Fichier créé : ${filename}`);
  } catch (error) {
    console.error("❌ Erreur lors de l'export :", error);
  }
}
exportCollection();

