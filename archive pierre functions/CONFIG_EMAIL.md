# 📧 Configuration Email pour Firebase Functions

## 🔑 Étape 1 : Créer un App Password Gmail

Pour que les notifications email fonctionnent, vous devez créer un "App Password" Gmail :

### Instructions :

1. **Aller dans votre compte Google**
   - Visitez : https://myaccount.google.com/security

2. **Activer la vérification en 2 étapes** (si pas déjà fait)
   - Paramètres de sécurité → Vérification en 2 étapes
   - Suivre les instructions

3. **Créer un App Password**
   - Paramètres de sécurité → Vérification en 2 étapes → Mots de passe des applications
   - Sélectionner "Autre (nom personnalisé)"
   - Entrer : "Activity Day to Day"
   - Cliquer sur "Générer"
   - **COPIER LE MOT DE PASSE** (16 caractères sans espaces)

## ⚙️ Étape 2 : Configurer les Secrets Firebase

Une fois le mot de passe généré, configurez-le dans Firebase :

```bash
# Dans le dossier Activity_day_to_day
cd /Users/thononpierre/Documents/Windsurf/CascadeProjects/windsurf-project/Activity_day_to_day

# Configurer l'email
firebase functions:secrets:set EMAIL_USER

# Quand demandé, entrer : pierre.thonon@gmail.com

# Configurer le mot de passe
firebase functions:secrets:set EMAIL_PASSWORD

# Quand demandé, coller le App Password de 16 caractères
```

## 🧪 Étape 3 : Tester Localement (Optionnel)

Pour tester sans déployer :

```bash
cd functions
npm run serve
```

## 🚀 Étape 4 : Déployer

```bash
# Depuis le dossier Activity_day_to_day
firebase deploy --only functions

# Ou déployer tout le projet
firebase deploy
```

## ✅ Vérification

Après le déploiement, vous pouvez :

1. **Vérifier dans la Console Firebase** :
   - https://console.firebase.google.com
   - Aller dans "Functions"
   - Voir la fonction `dailyTaskReset`

2. **Tester manuellement** :
   - Dans la console Functions, cliquer sur la fonction
   - Cliquer sur "Tester la fonction"

3. **Vérifier les logs** :
   ```bash
   firebase functions:log
   ```

## 🔒 Sécurité

Les secrets (EMAIL_USER et EMAIL_PASSWORD) sont :
- ✅ Stockés de manière sécurisée par Firebase
- ✅ Jamais exposés dans le code
- ✅ Accessibles uniquement par les Cloud Functions

## ❓ Dépannage

**Erreur : "Invalid login"**
- Vérifier que la vérification en 2 étapes est activée
- Générer un nouveau App Password
- S'assurer de copier le mot de passe sans espaces

**Erreur : "Missing secrets"**
- Relancer les commandes `firebase functions:secrets:set`
- Vérifier avec : `firebase functions:secrets:access EMAIL_USER`

**L'email n'arrive pas**
- Vérifier les logs : `firebase functions:log`
- Vérifier les spams
- Vérifier que l'email est activé dans la config Firestore

## 📝 Configuration Firestore

La fonction utilisera la configuration dans `reset_config/main_config` :

```javascript
{
  enabled: true,
  time: "06:00",
  notifications: {
    email: {
      enabled: true,  // ← Activer les emails
      address: "pierre.thonon@gmail.com",
      onSuccess: true,
      onError: true
    }
  }
}
```

Cette configuration sera créée via l'interface admin dans l'étape suivante.
