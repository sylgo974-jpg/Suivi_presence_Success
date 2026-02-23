# 🚀 Utilisation de GitHub Codespaces

Ce dossier contient la configuration pour utiliser GitHub Codespaces avec ton projet.

## 🎯 Qu'est-ce que Codespaces ?

GitHub Codespaces est un environnement de développement complet **dans le cloud**.
Plus besoin d'installer Node.js, npm ou quoi que ce soit sur ton ordinateur !

## 💻 Comment démarrer ?

### 1. Créer un Codespace

1. Va sur [ton dépôt GitHub](https://github.com/sylgo974-jpg/Suivi_presence_Success)
2. Clique sur le bouton vert **"<> Code"**
3. Sélectionne l'onglet **"Codespaces"**
4. Clique sur **"Create codespace on main"**

⏳ **Attends 1-2 minutes** que Codespaces se configure automatiquement.

### 2. Ce qui se passe automatiquement

Quand le Codespace démarre :
- ✅ Node.js 20 est installé
- ✅ Les dépendances npm sont installées (`npm install` dans backend)
- ✅ Le terminal s'ouvre automatiquement

### 3. Tu es prêt !

Une fois que le terminal affiche :
```
✅ Setup terminé !
```

Tu peux lancer le script de population :

```bash
cd backend
node scripts/populate-ressources.js
```

## 📝 Commandes utiles

### Remplir Google Sheets avec les données
```bash
cd backend
node scripts/populate-ressources.js
```

### Démarrer le serveur local
```bash
cd backend
npm start
```

### Tester les API
```bash
# Liste des formations
curl http://localhost:3000/api/resources/formations

# Formateurs pour TSMEL
curl "http://localhost:3000/api/resources/formateurs?formation=TSMEL"

# Apprenants pour MUM le LUNDI
curl "http://localhost:3000/api/resources/apprenants?formation=MUM&jour=LUNDI"
```

## 🔧 Problèmes courants

### Le terminal ne montre rien

Ouvre un nouveau terminal :
- Menu : **Terminal** > **New Terminal**
- Ou raccourci : **Ctrl + Shift + `** (Windows/Linux) ou **Cmd + Shift + `** (Mac)

### Erreur "Cannot find module"

Réinstalle les dépendances :
```bash
cd backend
rm -rf node_modules package-lock.json
npm install
```

### Erreur Google Sheets permissions

Vérifie que :
1. L'onglet **"Ressources"** existe dans [ton Google Sheets](https://docs.google.com/spreadsheets/d/1Q4eiooEl7l9umlq-cHdQo3dxVssO_s-h6L58eTSwlDw/edit)
2. Le compte de service a les droits **"Éditeur"** sur le fichier

## 💾 Sauvegarde et arrêt

### Sauvegarder ton travail

Tout est automatiquement sauvegardé dans GitHub !

Si tu as modifié des fichiers :
```bash
git add .
git commit -m "Mon message de commit"
git push
```

### Arrêter le Codespace

1. Va sur [GitHub Codespaces](https://github.com/codespaces)
2. Clique sur les **"..."** à côté de ton Codespace
3. Sélectionne **"Stop codespace"**

Le Codespace s'arrête automatiquement après 30 minutes d'inactivité.

## ✨ Avantages de Codespaces

- 💻 Accès depuis n'importe quel ordinateur
- 🚀 Pas d'installation locale
- 🔄 Environnement standardisé pour toute l'équipe
- ☁️ Tout dans le cloud
- 💾 Synchronisation automatique avec GitHub

## 💰 Quota gratuit

GitHub offre **60 heures/mois gratuites** de Codespaces.
Largement suffisant pour ce projet !

---

**Besoin d'aide ?** Ouvre une issue sur GitHub ou contacte Sylvain ! 🚀
