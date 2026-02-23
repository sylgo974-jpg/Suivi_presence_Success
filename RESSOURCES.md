# 👥 Gestion des Ressources - Formateurs et Apprenants

Ce document explique comment gérer la liste des formateurs et apprenants dans le système de pointage Success Formation.

---

## 🎯 Vue d'ensemble

Les données des formateurs et apprenants sont stockées dans un onglet **"Ressources"** de votre Google Sheets.

**Fichier Sheets** : [Suivi Pointage Success](https://docs.google.com/spreadsheets/d/1Q4eiooEl7l9umlq-cHdQo3dxVssO_s-h6L58eTSwlDw/edit)

---

## 📄 Structure de l'onglet "Ressources"

L'onglet doit contenir 5 colonnes :

| Colonne | Description | Exemple |
|---------|-------------|----------|
| **Jour** | Jour de la semaine | LUNDI, MARDI, MERCREDI, JEUDI, VENDREDI, AFC |
| **Creneau** | Créneau horaire | MATIN, APRES-MIDI, VARIABLE |
| **Formation** | Type de formation | TSMEL, MUM, AMUM, TLE, CV, etc. |
| **Role** | Rôle de la personne | Formateur, Apprenant |
| **Nom** | Nom complet | GORECKI Sylvain |

### Exemple de données

```
Jour        | Creneau | Formation | Role       | Nom
------------|---------|-----------|------------|-------------------------
LUNDI       | MATIN   | TSMEL     | Formateur  | IDMONT Sophia
LUNDI       | MATIN   | TSMEL     | Formateur  | SEBAOUN Morgan
LUNDI       | MATIN   | TSMEL     | Apprenant  | VALMY LUCAS
LUNDI       | MATIN   | TSMEL     | Apprenant  | CRESCENCE Thomas Jean
LUNDI       | MATIN   | REM       | Formateur  | CAPEROS Alexandra
MARDI       | MATIN   | MUM       | Formateur  | GARCIA Renée
```

---

## 🚀 Initialisation automatique

### Étape 1 : Créer l'onglet "Ressources"

1. Ouvre ton fichier [Google Sheets](https://docs.google.com/spreadsheets/d/1Q4eiooEl7l9umlq-cHdQo3dxVssO_s-h6L58eTSwlDw/edit)
2. Clique sur le bouton **"+"** en bas pour ajouter un nouvel onglet
3. Nomme-le exactement **"Ressources"** (avec majuscule)

### Étape 2 : Remplir automatiquement les données

Un script est fourni pour remplir automatiquement l'onglet avec toutes les données :

```bash
# Depuis le dossier backend
cd backend

# Installer les dépendances si nécessaire
npm install

# Exécuter le script de population
node scripts/populate-ressources.js
```

**Sortie attendue** :
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

## ✏️ Modification manuelle

Tu peux aussi modifier directement dans Google Sheets :

### Ajouter un formateur

1. Va sur l'onglet **"Ressources"**
2. Ajoute une nouvelle ligne :
   ```
   JEUDI | MATIN | TSMEL | Formateur | NOUVEAU Nom
   ```

### Ajouter un apprenant

1. Ajoute une ligne :
   ```
   VENDREDI | MATIN | MUM | Apprenant | NOUVEL Apprenant
   ```

### Supprimer une personne

1. Trouve la ligne correspondante
2. Clique droit > Supprimer la ligne

---

## 🔌 API - Utilisation dans ton application

### Endpoints disponibles

Ton backend expose maintenant ces routes :

#### 1. Récupérer toutes les formations

```http
GET /api/resources/formations
```

**Réponse** :
```json
[
  "AMUM",
  "ASCOM",
  "CV",
  "FPA",
  "GRAPHISTE",
  "MUM",
  "NTC",
  "REM",
  "TLE",
  "TSMEL"
]
```

#### 2. Récupérer les formateurs (avec filtres)

```http
GET /api/resources/formateurs?jour=LUNDI&formation=TSMEL
```

**Réponse** :
```json
[
  "IDMONT Sophia",
  "SEBAOUN Morgan"
]
```

#### 3. Récupérer les apprenants (avec filtres)

```http
GET /api/resources/apprenants?jour=MARDI&formation=MUM
```

**Réponse** :
```json
[
  "DEVAUSSUZENET ELSY AURELIE",
  "SEYCHELLES SLOANE MARIE MEGANE",
  "DUBARY Maël Julien Paul",
  ...
]
```

#### 4. Récupérer tout (formateurs + apprenants)

```http
GET /api/resources/filter?jour=JEUDI&formation=AMUM
```

**Réponse** :
```json
{
  "formateurs": [
    "ELMIJI Zineb",
    "SILOTIA Maximin"
  ],
  "apprenants": [
    "HOARAU ANDRE",
    "BENEDICTE",
    "ALI MZE BEN DAVID",
    "MAMY ANASTASIE FRIDA"
  ],
  "total": {
    "formateurs": 2,
    "apprenants": 4
  }
}
```

---

## 📦 Intégration dans l'interface formateur

Voici comment modifier `docs/index.html` pour utiliser les données dynamiques :

### Exemple JavaScript

```javascript
// Charger la liste des formations depuis l'API
async function loadFormations() {
    const response = await fetch('https://ton-backend.vercel.app/api/resources/formations');
    const formations = await response.json();
    
    const select = document.getElementById('formation');
    select.innerHTML = '<option value="">-- Sélectionner --</option>';
    
    formations.forEach(formation => {
        const option = document.createElement('option');
        option.value = formation;
        option.textContent = formation;
        select.appendChild(option);
    });
}

// Charger au démarrage de la page
window.addEventListener('DOMContentLoaded', loadFormations);
```

---

## 🔄 Workflow complet

### Lors de la création d'une session

1. Le formateur sélectionne sa **formation** (chargée depuis `/api/resources/formations`)
2. Le formateur entre son **nom** (ou sélectionne dans une liste depuis `/api/resources/formateurs`)
3. L'application génère un QR code avec ces infos

### Lors du pointage apprenant

1. L'apprenant scanne le QR code
2. L'apprenant entre son **nom** (ou sélectionne dans une liste depuis `/api/resources/apprenants`)
3. La signature est enregistrée dans l'onglet **"Signatures"**

### Génération de rapport

1. Récupérer toutes les signatures du jour via `/api/attendance`
2. Récupérer la liste complète des apprenants via `/api/resources/apprenants`
3. Comparer les deux listes pour identifier :
   - **Présents** : apprenants qui ont pointé
   - **Absents** : apprenants dans la liste mais sans pointage

---

## 📑 Exemple : Générer un rapport d'absence

```javascript
async function generateAbsenceReport(jour, formation) {
    // 1. Récupérer tous les apprenants attendus
    const responseApprenants = await fetch(
        `https://ton-backend.vercel.app/api/resources/apprenants?jour=${jour}&formation=${formation}`
    );
    const apprenantsAttendus = await responseApprenants.json();
    
    // 2. Récupérer les signatures du jour
    const responseSignatures = await fetch(
        `https://ton-backend.vercel.app/api/attendance/today?date=${date}`
    );
    const signatures = await responseSignatures.json();
    
    // 3. Extraire les noms des apprenants présents
    const apprenantsPresents = signatures.map(s => s.apprenantNom);
    
    // 4. Identifier les absents
    const absents = apprenantsAttendus.filter(
        nom => !apprenantsPresents.includes(nom)
    );
    
    console.log('👥 Attendus :', apprenantsAttendus.length);
    console.log('✅ Présents :', apprenantsPresents.length);
    console.log('❌ Absents :', absents.length);
    console.log('Liste absents :', absents);
    
    return {
        attendus: apprenantsAttendus,
        presents: apprenantsPresents,
        absents: absents
    };
}

// Utilisation
generateAbsenceReport('LUNDI', 'TSMEL');
```

---

## ✅ Checklist d'installation

- [ ] Créer l'onglet "Ressources" dans Google Sheets
- [ ] Exécuter le script `populate-ressources.js`
- [ ] Vérifier que les données apparaissent bien dans Sheets
- [ ] Tester l'API : `/api/resources/formations`
- [ ] Tester l'API : `/api/resources/formateurs?jour=LUNDI`
- [ ] Tester l'API : `/api/resources/apprenants?formation=TSMEL`
- [ ] Modifier l'interface formateur pour utiliser les listes dynamiques
- [ ] Déployer sur Vercel

---

## 📞 Support

Si tu as des questions ou des problèmes :

1. Vérifie que l'onglet s'appelle bien **"Ressources"** (avec majuscule)
2. Vérifie les logs du backend : `vercel logs`
3. Teste les endpoints avec Postman ou curl
4. Vérifie les permissions Google Sheets de ton compte de service

---

## 🔐 Sécurité

**Attention** : Les endpoints `/api/resources/*` sont publics. Si tu veux les protéger :

1. Ajoute une clé API dans les headers
2. Utilise l'authentification JWT
3. Limite les appels par IP (rate limiting)

Pour l'instant, c'est suffisant pour un usage interne Success Formation.

---

**🌍 Déployé sur** : [Vercel](https://vercel.com)  
**📊 Données stockées dans** : [Google Sheets](https://docs.google.com/spreadsheets/d/1Q4eiooEl7l9umlq-cHdQo3dxVssO_s-h6L58eTSwlDw/edit)
