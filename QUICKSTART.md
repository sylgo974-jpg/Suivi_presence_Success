# 🚀 Démarrage Rapide - 5 Minutes Chrono !

## 🎯 Objectif

Remplir automatiquement ton Google Sheets avec 250+ formateurs et apprenants.

---

## 📍 Étape 1 : Créer l'onglet "Ressources" (30 secondes)

1. Ouvre [ton Google Sheets](https://docs.google.com/spreadsheets/d/1Q4eiooEl7l9umlq-cHdQo3dxVssO_s-h6L58eTSwlDw/edit)

2. En bas de la page, clique sur le bouton **"+"** 

3. Nomme le nouvel onglet : **Ressources**

```
✅ Bien : "Ressources" (avec R majuscule)
❌ Mal : "ressources", "Ressource", "RESSOURCES"
```

4. Laisse l'onglet vide, le script va tout remplir !

---

## 💻 Étape 2 : Ouvrir GitHub Codespaces (1 minute)

### Option A : Via le bouton (RECOMMANDÉ)

1. **Clique sur ce lien direct** : 
   🔗 [Créer un Codespace](https://github.com/sylgo974-jpg/Suivi_presence_Success/codespaces/new?machine=basicLinux32gb)

2. Clique sur le bouton vert **"Create codespace"**

3. ⏳ **Patiente 1-2 minutes** pendant que tout s'installe automatiquement

### Option B : Via le dépôt

1. Va sur [ton dépôt](https://github.com/sylgo974-jpg/Suivi_presence_Success)

2. Clique sur le bouton vert **"<> Code"**

3. Sélectionne l'onglet **"Codespaces"**

4. Clique sur **"Create codespace on main"**

---

## ✅ Étape 3 : Vérifier l'installation (30 secondes)

Quand le Codespace est prêt, tu vois un terminal.

Tape cette commande :

```bash
cd backend && bash check.sh
```

Tu devrais voir :

```
🔍 VÉRIFICATION DE L'ENVIRONNEMENT
==========================================

1️⃣ Vérification de Node.js...
   ✅ Node.js installé : v20.x.x

2️⃣ Vérification de npm...
   ✅ npm installé : 10.x.x

3️⃣ Vérification des dépendances...
   ✅ node_modules existe
   📦 50 packages installés

[...]

✨ Vérification terminée !
```

⚠️ **Si tu vois des ❌**, lance :
```bash
npm install
```

---

## 🚀 Étape 4 : Remplir Google Sheets (1 minute)

Maintenant, lance le script magique :

```bash
node scripts/populate-ressources.js
```

### Ce qui se passe :

1. 🔌 Connexion à Google Sheets
2. 🧹 Effacement de l'ancien contenu (si existant)
3. 📥 Insertion de 250+ lignes de données
4. ✅ Confirmation

### Résultat attendu :

```
🚀 Début de la population des ressources...
📊 Total de lignes à insérer : 250
🧹 Ancien contenu effacé
✅ 250 ressources insérées avec succès !

📊 Récapitulatif :
  - Formateurs : 45
  - Apprenants : 205
  - TOTAL : 250

✨ Script terminé avec succès !
```

---

## 🎉 Étape 5 : Vérifier dans Google Sheets (30 secondes)

Retourne sur [ton Google Sheets](https://docs.google.com/spreadsheets/d/1Q4eiooEl7l9umlq-cHdQo3dxVssO_s-h6L58eTSwlDw/edit)

Va sur l'onglet **"Ressources"**

Tu devrais voir :

| Jour | Creneau | Formation | Role | Nom |
|------|---------|-----------|------|-----|
| LUNDI | MATIN | TSMEL | Formateur | IDMONT Sophia |
| LUNDI | MATIN | TSMEL | Formateur | SEBAOUN Morgan |
| LUNDI | MATIN | TSMEL | Apprenant | VALMY LUCAS |
| ... | ... | ... | ... | ... |

✅ **250+ lignes remplies automatiquement !**

---

## 📡 Étape 6 : Tester l'API (1 minute)

Dans le terminal Codespaces, démarre le serveur :

```bash
npm start
```

Ouvre un **nouveau terminal** (Ctrl + Shift + `) et teste :

```bash
# Lister toutes les formations
curl http://localhost:3000/api/resources/formations

# Résultat attendu :
# ["AMUM","ASCOM","CV","FPA","GRAPHISTE","MUM","NTC","REM","TLE","TSMEL"]
```

```bash
# Lister les formateurs TSMEL du LUNDI
curl "http://localhost:3000/api/resources/formateurs?jour=LUNDI&formation=TSMEL"

# Résultat attendu :
# ["IDMONT Sophia","SEBAOUN Morgan"]
```

```bash
# Lister les apprenants MUM du MARDI
curl "http://localhost:3000/api/resources/apprenants?jour=MARDI&formation=MUM"

# Résultat attendu :
# ["DEVAUSSUZENET ELSY AURELIE","SEYCHELLES SLOANE MARIE MEGANE",...]
```

---

## ✅ Récapitulatif

✅ Onglet "Ressources" créé  
✅ Codespace lancé  
✅ Node.js et npm installés  
✅ 250+ données insérées dans Sheets  
✅ API fonctionnelle  

---

## ❌ Problèmes courants

### Erreur : "Cannot find module"

**Solution** :
```bash
cd backend
npm install
```

### Erreur : "Permission denied" (Google Sheets)

**Solution** :
1. Vérifie que l'onglet s'appelle bien **"Ressources"**
2. Vérifie que le compte de service a accès au fichier Sheets
3. Dans Sheets, clique sur **Partager** et ajoute l'email du compte de service

### Erreur : "GOOGLE_CREDENTIALS not found"

**Solution** :
Tu as besoin du fichier JSON des credentials Google.
Contacte l'admin ou vérifie dans `backend/config/`

### Le terminal ne répond pas

**Solution** :
Ouvre un nouveau terminal :
- Menu : **Terminal** > **New Terminal**
- Ou : **Ctrl + Shift + `**

---

## 📚 Documentation complète

- 📖 [RESSOURCES.md](RESSOURCES.md) - Guide complet des ressources
- 💻 [.devcontainer/README.md](.devcontainer/README.md) - Guide Codespaces
- 🌍 [GitHub Repo](https://github.com/sylgo974-jpg/Suivi_presence_Success)

---

## 💬 Besoin d'aide ?

Si tu bloques quelque part :

1. Vérifie les logs du terminal
2. Lance `bash check.sh` pour diagnostiquer
3. Ouvre une issue sur GitHub
4. Contacte Sylvain ! 🚀

---

**Félicitations ! Ton système de gestion des ressources est opérationnel ! 🎉**
