const admin = require('firebase-admin');
const path = require('path'); // Ajoutez cette ligne pour importer 'path'
const serviceAccount = require(path.join(__dirname, 'systemederecompensesenfants-f16a009d4b9f.json'));  // Assurez-vous que votre fichier .json est bien à cet endroit

// Initialiser Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Référence à la collection 'tasks'
const db = admin.firestore();
const tasksRef = db.collection('tasks');

// Fonction pour supprimer toutes les tâches
async function deleteAllTasks() {
  const snapshot = await tasksRef.get();
  
  if (snapshot.empty) {
    console.log('Aucune tâche à supprimer.');
    return;
  }

  // Supprimer chaque tâche dans la collection
  const batch = db.batch();
  snapshot.forEach(doc => {
    batch.delete(doc.ref);
  });

  // Appliquer la suppression en batch
  await batch.commit();
  console.log('Toutes les tâches ont été supprimées.');
}

// Appeler la fonction de suppression
deleteAllTasks().catch(error => {
  console.error('Erreur lors de la suppression des tâches:', error);
});
