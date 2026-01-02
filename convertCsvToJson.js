const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

// Chemins des fichiers
const inputCsvFile = path.join(__dirname, 'tasks.csv');
const outputJsonFile = path.join(__dirname, 'tasks.json');

// Fonction pour retirer le BOM (caractère invisible parfois ajouté par Excel)
function removeBOM(data) {
  return data.charCodeAt(0) === 0xFEFF ? data.slice(1) : data;
}

console.log(`🚀 Démarrage de la conversion...`);
console.log(`Reading: ${inputCsvFile}`);

const tasks = [];

// Utilise le stream pour transformer le CSV en JSON
fs.createReadStream(inputCsvFile)
  .pipe(csv({
    separator: ';', // Assurez-vous que votre CSV utilise bien le point-virgule
    mapHeaders: ({ header }) => header.trim(),
    mapValues: ({ value }) => value.trim()
  }))
  .on('headers', (headers) => {
    console.log('📊 Colonnes détectées :', headers.join(', '));
  })
  .on('data', (row) => {
    // 1. Ignorer les lignes sans titre
    if (!row.title || row.title === '') return;

    const category = (row.category || '').toLowerCase().trim();
    const today = new Date().getDay(); // 0 = Dimanche, 1 = Lundi, etc.

    // 2. Analyse du dayOfWeek fourni dans le CSV
    let dayOfWeek = null;
    if (row.dayOfWeek !== undefined && row.dayOfWeek !== '') {
      const parsed = parseInt(row.dayOfWeek, 10);
      if (!isNaN(parsed)) dayOfWeek = parsed;
    }

    // 3. LOGIQUE INTELLIGENTE DES JOURS
    if (category === 'hebdomadaire' || category === 'mensuel') {
      // Forçage automatique au Dimanche
      dayOfWeek = 0;
    } 
    else if (category === 'ponctuel') {
      // Sécurité : si l'utilisateur a oublié le jour, on met AUJOURD'HUI
      if (dayOfWeek === null) {
        dayOfWeek = today;
        console.log(`📍 Ponctuel auto-assigné à AUJOURD'HUI (${dayOfWeek}) : "${row.title}"`);
      }
    }

    // 4. Construction de l'objet tâche
    tasks.push({
      title: row.title,
      description: row.description || '',
      assignedTo: row.assignedTo || '',
      stars: parseInt(row.stars, 10) || 1,
      category: category,
      completed: false,
      dayOfWeek: dayOfWeek,
      order: row.order ? parseInt(row.order, 10) : null,
      isBonus: (row.isBonus || '').toLowerCase() === 'true',
      isPenalty: (row.isPenalty || '').toLowerCase() === 'true',
      isSeriousFault: (row.isSeriousFault || '').toLowerCase() === 'true',
    });
  })
  .on('end', () => {
    // 5. Écriture du fichier final
    try {
      fs.writeFileSync(outputJsonFile, JSON.stringify(tasks, null, 2), 'utf8');
      console.log(`\n✅ Conversion réussie !`);
      console.log(`📁 Fichier sauvegardé : ${outputJsonFile}`);
      console.log(`📝 Nombre de tâches : ${tasks.length}`);
      
      const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
      console.log(`💡 Note : Les tâches ponctuelles sans jour ont été réglées sur : ${dayNames[new Date().getDay()]}\n`);
    } catch (err) {
      console.error("❌ Erreur lors de l'écriture du JSON :", err);
    }
  })
  .on('error', (error) => {
    console.error('❌ Erreur lors de la lecture du CSV :', error);
  });