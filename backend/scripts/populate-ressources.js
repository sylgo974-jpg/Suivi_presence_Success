/**
 * Script de population de l'onglet "Ressources" dans Google Sheets
 * Lance ce script une seule fois pour initialiser les données
 * 
 * Usage: node backend/scripts/populate-ressources.js
 */

const { google } = require('googleapis');
const credentials = process.env.GOOGLE_CREDENTIALS 
    ? JSON.parse(process.env.GOOGLE_CREDENTIALS) 
    : require('../config/suivi-pointage-486908-ca78da824d02.json');

const SHEET_ID = '1Q4eiooEl7l9umlq-cHdQo3dxVssO_s-h6L58eTSwlDw';

// Données source
const DATA = {
  "TSMEL LUNDI": {
    jour: "LUNDI",
    creneau: "MATIN",
    formation: "TSMEL",
    formateurs: ["IDMONT Sophia", "SEBAOUN Morgan"],
    apprenants: ["VALMY LUCAS", "CRESCENCE Thomas Jean Christophe", "TEMOT ANTHONY", "DAMOUR MORGAN", "HOARAU HENRI BRICE", "PELLIER LUCAS", "SEYCHELLES LISA MARIE-EVA", "TURPIN Elio Roann"]
  },
  "REM LUNDI": {
    jour: "LUNDI",
    creneau: "MATIN",
    formation: "REM",
    formateurs: ["CAPEROS Alexandra", "ELMIJI Zineb"],
    apprenants: ["AKIM SAID ALI MADI Raphaël", "BOMMALAIS JASON JEAN YANNICK", "BERGOUGNOUX Sarah", "LAURET Maily", "RANGAMA TARANY"]
  },
  "TSMEL MARDI": {
    jour: "MARDI",
    creneau: "MATIN",
    formation: "TSMEL",
    formateurs: ["GORECKI Sylvain", "SEBAOUN Morgan"],
    apprenants: ["FONTAINE FIONA DEBORA", "PAGESSE EVAN KENDRICK", "TURLOY Steven Jean Germain"]
  },
  "MUM MARDI": {
    jour: "MARDI",
    creneau: "MATIN",
    formation: "MUM",
    formateurs: ["GARCIA Renée"],
    apprenants: ["DEVAUSSUZENET ELSY AURELIE", "SEYCHELLES SLOANE MARIE MEGANE", "DUBARY Maël Julien Paul", "GRONDIN THOMAS", "ICHANE Gabrielle Marie Sarah", "PHILEAS ELISA MARIE", "ROCHE MARIE LAURA", "TIMA THEO ANTOINE", "CRODIER ERIC"]
  },
  "AMUM MARDI": {
    jour: "MARDI",
    creneau: "MATIN",
    formation: "AMUM",
    formateurs: ["HOAREAU ERIC"],
    apprenants: ["BELLON Mahily Joséphine", "CONSTANT JAROD APPOLINAIRE", "MAILLOT Maëllise Marie-Annabelle", "MOUROUGASSIN LAURABELLE LEA", "ABDALLAH MADI Léna", "SERVAN ENZO LUCAS", "CATAYE MAYRA", "BOYER DAVY JEAN FRANCOIS"]
  },
  "CV MARDI": {
    jour: "MARDI",
    creneau: "MATIN",
    formation: "CV",
    formateurs: ["ROUSSEAU Jean Francois", "Manin Ludovic"],
    apprenants: ["ABROUSSE Emma Marie-Thérèse", "BOURA Souraya"]
  },
  "TSMEL MERCREDI": {
    jour: "MERCREDI",
    creneau: "MATIN",
    formation: "TSMEL",
    formateurs: ["GORECKI Sylvain"],
    apprenants: ["DIJOUX CLEMENT PAUL", "GILLES Landry", "GRONDIN NOLAN GAYCE"]
  },
  "MUM MERCREDI": {
    jour: "MERCREDI",
    creneau: "MATIN",
    formation: "MUM",
    formateurs: ["CAPEROS Alexandra", "PAYET Giana"],
    apprenants: ["CAMILLOT Noah", "FERRY Arthur", "GRANULANT JEREMY", "LEBEAU Dylan", "MAILLOT JOSUE", "TECHER Samuel"]
  },
  "AMUM MERCREDI": {
    jour: "MERCREDI",
    creneau: "MATIN",
    formation: "AMUM",
    formateurs: ["HOAREAU ERIC"],
    apprenants: ["BLUKER Shaïna Anne Johanna", "CADET-CILLON Aurélia Marie Cassandra", "LATCHIMY Lorenzi Jean Stéphane", "ROSALIE Réhana", "GASTREIN Tania"]
  },
  "AMUM JEUDI": {
    jour: "JEUDI",
    creneau: "MATIN",
    formation: "AMUM",
    formateurs: ["ELMIJI Zineb", "SILOTIA Maximin"],
    apprenants: ["HOARAU ANDRE", "BENEDICTE", "ALI MZE BEN DAVID", "MAMY ANASTASIE FRIDA"]
  },
  "ASCOM JEUDI": {
    jour: "JEUDI",
    creneau: "MATIN",
    formation: "ASCOM",
    formateurs: ["BENARD Jérémy", "PAYET Giana"],
    apprenants: ["JOSEPH Pierre Olivier", "LUSANG Laurence", "FIBAQUE EMILIE", "FRANCOISE CAROLINE MARIE NESLY", "LALLEMAND EVA", "TURPIN Marie Emeline", "GONNEVEILLE ERINA", "HAGEN Thomas", "IBRAHIM Alicia"]
  },
  "MUM JEUDI": {
    jour: "JEUDI",
    creneau: "MATIN",
    formation: "MUM",
    formateurs: ["SAMARIE Olivier", "ROUSSEAU Jean Francois"],
    apprenants: ["BENARD Leiticia MARIE ANGELIQUE", "BOYER MATHILDE", "DIJOUX MAEVA", "IMOUZA LUCAS ALEX", "ITEMA Lindjie Marie Nelcie", "ROULLE LEA", "VITRY MARIE LEA"]
  },
  "FPA JEUDI": {
    jour: "JEUDI",
    creneau: "MATIN",
    formation: "FPA",
    formateurs: ["BENARD Julie"],
    apprenants: ["GORECKI Sylvain Jacques", "HOAREAU ERIC VINCENT"]
  },
  "MUM VENDREDI": {
    jour: "VENDREDI",
    creneau: "MATIN",
    formation: "MUM",
    formateurs: ["SAMARIE Olivier", "Manin Ludovic"],
    apprenants: ["ABBEZZOT Eulalie Marie Irène", "CHAMAND FLORA ELOISE", "CICHY MANEL", "FIRMANG LORNA KELLIA MARIE JOSEPHINE", "HOARAU Benjamin", "TIBURCE DORA CHERYL", "VARAINE JEAN STEPHANE"]
  },
  "GRAPHISTE VENDREDI": {
    jour: "VENDREDI",
    creneau: "MATIN",
    formation: "GRAPHISTE",
    formateurs: ["DUCHESNE Maximilien", "MOREL Karine"],
    apprenants: ["BOYER FLORA-MARIE", "HANG-SI LAN KEE-MEI", "PICARD TECHER MELISSA"]
  },
  "NTC VENDREDI": {
    jour: "VENDREDI",
    creneau: "MATIN",
    formation: "NTC",
    formateurs: ["RICHARD Sonia"],
    apprenants: ["BOUBOUILLE KILLIAN", "DALLEAU SONY JUNIOR SULLY", "LEBRETON VALERIE"]
  },
  "TLE VENDREDI": {
    jour: "VENDREDI",
    creneau: "MATIN",
    formation: "TLE",
    formateurs: ["GORECKI Sylvain"],
    apprenants: ["TECHER LEO", "BELLO Gael Thomas", "PAYET Kélyan", "TREMOULU Kenny Noah", "DEVALLET MICKAEL MICHEL", "FOLIO Bryan Patrice"]
  },
  "AMUM 1 AFC": {
    jour: "AFC",
    creneau: "VARIABLE",
    formation: "AMUM",
    formateurs: ["Alexandra CAPARROS", "Olivier SAMARIE", "Maximin SOLITIA", "Eric HOAREAU", "Johana SIGISMEAU"],
    apprenants: ["ESTHER Kévin", "SERVAN Mael", "VALLIAMEE Meheidy Bastien", "TROCA Lorna Marie Hélèna"]
  },
  "AMUM 2 AFC": {
    jour: "AFC",
    creneau: "VARIABLE",
    formation: "AMUM",
    formateurs: ["DITNAN Yvanick"],
    apprenants: ["RIOUL Gillian Danick", "BASQUE Ulrick", "LATOUR Nawfal"]
  },
  "MUM AFC": {
    jour: "AFC",
    creneau: "VARIABLE",
    formation: "MUM",
    formateurs: ["Johana SIGISMEAU", "LAURENCE LUSANG", "Alexandra CAPARROS", "Jean-François ROUSSEAU"],
    apprenants: ["EPIPHANA Raïssa", "FLORENCY Noëllie", "FONTAINE Mie-Claude Clémenne", "GENCE Frédéric", "HERODE Michelle Marie-Hortellia"]
  },
  "TLE AFC": {
    jour: "AFC",
    creneau: "VARIABLE",
    formation: "TLE",
    formateurs: ["PEDASE Alain"],
    apprenants: ["ABOUTOIHI Chouanibou", "DE BOISVILLIERS Juliette", "LASTOUILLAT Marie Jocelyne", "MABLOUKE Anne Gaêlle Marie Laëtitia", "MAROUDE GOPALLE Soma Pierre Yllan", "RIVIERE Kenzo"]
  },
  "TSMEL AFC": {
    jour: "AFC",
    creneau: "VARIABLE",
    formation: "TSMEL",
    formateurs: ["BOUVILLON Fabiola"],
    apprenants: ["HOUMADI Latuf", "LOURAGUAIS Gaetan Jean Mat", "VITRY Marie-Océane"]
  }
};

async function getGoogleSheetsClient() {
    const auth = new google.auth.GoogleAuth({
        credentials: credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const client = await auth.getClient();
    return google.sheets({ version: 'v4', auth: client });
}

async function populateRessources() {
    console.log('🚀 Début de la population des ressources...');
    
    const sheets = await getGoogleSheetsClient();
    
    // Préparation des lignes
    const rows = [
        ['Jour', 'Creneau', 'Formation', 'Role', 'Nom'] // En-tête
    ];
    
    // Parcourir toutes les sessions
    for (const [sessionName, sessionData] of Object.entries(DATA)) {
        const { jour, creneau, formation, formateurs, apprenants } = sessionData;
        
        // Ajouter les formateurs
        formateurs.forEach(formateurNom => {
            rows.push([jour, creneau, formation, 'Formateur', formateurNom]);
        });
        
        // Ajouter les apprenants
        apprenants.forEach(apprenantNom => {
            rows.push([jour, creneau, formation, 'Apprenant', apprenantNom]);
        });
    }
    
    console.log(`📊 Total de lignes à insérer : ${rows.length - 1}`);
    
    try {
        // Effacer l'onglet existant (si nécessaire)
        await sheets.spreadsheets.values.clear({
            spreadsheetId: SHEET_ID,
            range: 'Ressources!A:E',
        });
        
        console.log('🧹 Ancien contenu effacé');
        
        // Insérer les nouvelles données
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: 'Ressources!A1',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: rows,
            },
        });
        
        console.log(`✅ ${rows.length - 1} ressources insérées avec succès !`);
        console.log('\n📊 Récapitulatif :');
        
        const nbFormateurs = rows.filter(r => r[3] === 'Formateur').length;
        const nbApprenants = rows.filter(r => r[3] === 'Apprenant').length;
        
        console.log(`  - Formateurs : ${nbFormateurs}`);
        console.log(`  - Apprenants : ${nbApprenants}`);
        console.log(`  - TOTAL : ${nbFormateurs + nbApprenants}`);
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'insertion:', error.message);
        throw error;
    }
}

// Exécution
if (require.main === module) {
    populateRessources()
        .then(() => {
            console.log('\n✨ Script terminé avec succès !');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Erreur fatale:', error);
            process.exit(1);
        });
}

module.exports = { populateRessources };
