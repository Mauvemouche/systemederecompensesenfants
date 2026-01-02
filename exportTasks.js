// exportTasks.js
const admin = require('firebase-admin');
const fs = require('fs');

// 1. Remplace par le chemin vers ton fichier serviceAccountKey.json
const serviceAccount = require('./systemederecompensesenfants-firebase-adminsdk-fbsvc-4851826d17.json');

// 2. Initialiser l'app Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// 3. Nom de la collection à exporter
const COLLECTION_NAME = 'tasks';  // Change si nécessaire

async function exportCollection() {
    try {
        const snapshot = await db.collection(COLLECTION_NAME).get();

        if (snapshot.empty) {
            console.log('Aucun document trouvé dans la collection', COLLECTION_NAME);
            return;
        }

        const data = {};
        snapshot.forEach(doc => {
            data[doc.id] = doc.data();
        });

        const filename = `${COLLECTION_NAME}_export.json`;
        fs.writeFileSync(filename, JSON.stringify(data, null, 2));
        console.log(`✅ Export terminé ! Fichier créé : ${filename}`);
    } catch (error) {
        console.error('❌ Erreur lors de l\'export :', error);
    }
}

// Exécuter l'export
exportCollection();
