const { google } = require('googleapis');

// Chargement des credentials Google depuis la variable d'environnement UNIQUEMENT
// Le fichier JSON local ne doit jamais être commité (voir .gitignore)
if (!process.env.GOOGLE_CREDENTIALS) {
    console.error('❌ ERREUR CRITIQUE: Variable GOOGLE_CREDENTIALS manquante!');
    console.error('➡️  Configurer GOOGLE_CREDENTIALS dans les variables d\'environnement Vercel.');
    throw new Error('GOOGLE_CREDENTIALS non configurée. Vérifiez les variables d\'environnement Vercel.');
}

let credentials;
try {
    credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} catch (parseErr) {
    console.error('❌ ERREUR: GOOGLE_CREDENTIALS n\'est pas un JSON valide:', parseErr.message);
    throw new Error('GOOGLE_CREDENTIALS invalide (JSON malformé). Vérifiez la variable dans Vercel.');
}

const SHEET_ID = '1Q4eiooEl7l9umlq-cHdQo3dxVssO_s-h6L58eTSwlDw';

async function getGoogleSheetsClient() {
    const auth = new google.auth.GoogleAuth({
        credentials: credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const client = await auth.getClient();
    return google.sheets({ version: 'v4', auth: client });
}

/**
 * Récupère toutes les ressources (formateurs et apprenants) depuis l'onglet "Ressources"
 * Format attendu dans Sheets : Jour | Creneau | Formation | Role | Nom
 */
async function getAllRessources() {
    const sheets = await getGoogleSheetsClient();
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'Ressources!A:E',
        });
        const rows = response.data.values || [];
        
        if (rows.length < 2) {
            console.warn('⚠️ Aucune donnée dans l\'onglet Ressources');
            return [];
        }
        // Ignorer l'en-tête (première ligne)
        return rows.slice(1).map(row => ({
            jour: row[0] || '',
            creneau: row[1] || '',
            formation: row[2] || '',
            role: row[3] || '',
            nom: row[4] || ''
        }));
        
    } catch (error) {
        console.error('❌ Erreur lecture Ressources:', error.message);
        throw error;
    }
}

/**
 * Récupère les formateurs disponibles
 * @param {string} jour - Ex: "LUNDI", "MARDI", etc.
 * @param {string} creneau - Ex: "MATIN", "APRES-MIDI"
 * @param {string} formation - Ex: "TSMEL", "MUM", etc.
 */
async function getFormateurs(jour = null, creneau = null, formation = null) {
    const ressources = await getAllRessources();
    
    return ressources.filter(r => {
        if (r.role !== 'Formateur') return false;
        if (jour && r.jour !== jour) return false;
        if (creneau && r.creneau !== creneau) return false;
        if (formation && r.formation !== formation) return false;
        return true;
    }).map(r => r.nom);
}

/**
 * Récupère les apprenants disponibles
 * @param {string} jour - Ex: "LUNDI", "MARDI", etc.
 * @param {string} creneau - Ex: "MATIN", "APRES-MIDI"
 * @param {string} formation - Ex: "TSMEL", "MUM", etc.
 */
async function getApprenants(jour = null, creneau = null, formation = null) {
    const ressources = await getAllRessources();
    
    return ressources.filter(r => {
        if (r.role !== 'Apprenant') return false;
        if (jour && r.jour !== jour) return false;
        if (creneau && r.creneau !== creneau) return false;
        if (formation && r.formation !== formation) return false;
        return true;
    }).map(r => r.nom);
}

/**
 * Récupère la liste des formations disponibles
 */
async function getFormations() {
    const ressources = await getAllRessources();
    const formations = [...new Set(ressources.map(r => r.formation))];
    return formations.filter(f => f !== '').sort();
}

/**
 * Récupère toutes les ressources filtrées par jour, créneau et formation
 */
async function getRessourcesByFilters(jour = null, creneau = null, formation = null) {
    const ressources = await getAllRessources();
    
    return ressources.filter(r => {
        if (jour && r.jour !== jour) return false;
        if (creneau && r.creneau !== creneau) return false;
        if (formation && r.formation !== formation) return false;
        return true;
    });
}

module.exports = {
    getAllRessources,
    getFormateurs,
    getApprenants,
    getFormations,
    getRessourcesByFilters
};
