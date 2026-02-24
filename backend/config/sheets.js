const { google } = require('googleapis');

// Chargement des credentials Google depuis la variable d'environnement UNIQUEMENT
// Le fichier JSON local ne doit jamais être commité (voir .gitignore)
if (!process.env.GOOGLE_CREDENTIALS) {
    console.error('\u274c ERREUR CRITIQUE: Variable GOOGLE_CREDENTIALS manquante!');
    console.error('\u27a1\ufe0f Configurer GOOGLE_CREDENTIALS dans les variables d\'environnement Vercel.');
    throw new Error('GOOGLE_CREDENTIALS non configurée. Vérifiez les variables d\'environnement Vercel.');
}

let credentials;
try {
    credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} catch (parseErr) {
    console.error('\u274c ERREUR: GOOGLE_CREDENTIALS n\'est pas un JSON valide:', parseErr.message);
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

// Enregistrer une signature d'apprenant
async function appendToSheet(data) {
    const sheets = await getGoogleSheetsClient();
    
    const row = [
        new Date().toISOString(),
        data.date,
        data.creneau,
        data.creneauLabel,
        data.formation,
        data.formateurNom,
        data.formateurPrenom,
        data.apprenantNom,
        data.apprenantPrenom,
        data.signature,
        data.latitude || 'N/A',
        data.longitude || 'N/A',
        data.userAgent || 'N/A',
        data.timestamp,
        data.sessionCode || '' // Colonne O : code session pour filtrage
    ];

    await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Signatures!A:O',
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: [row],
        },
    });
    
    console.log(`\u2705 Signature enregistrée: ${data.apprenantPrenom} ${data.apprenantNom} [session: ${data.sessionCode}]`);
}

// Récupérer les présences filtrées par sessionCode
// Si sessionCode est fourni : seulement cette session
// Sinon (fallback) : toutes les présences du jour (ancien comportement)
async function getTodayAttendances(date, sessionCode) {
    const sheets = await getGoogleSheetsClient();
    
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Signatures!A:O',
    });
    const rows = response.data.values || [];
    
    return rows
        .slice(1) // Ignorer l'en-tête
        .filter(row => {
            const rowDate = row[1];
            const rowSessionCode = row[14] || ''; // Colonne O
            
            if (!rowDate) return false;
            
            // Filtrage par date obligatoire
            if (rowDate !== date) return false;
            
            // Si un sessionCode est fourni, filtrer strictement par lui
            if (sessionCode) {
                return rowSessionCode === sessionCode;
            }
            
            // Fallback sans sessionCode : retourner toutes les présences du jour
            return true;
        })
        .map(row => ({
            timestamp: row[0],
            date: row[1],
            creneau: row[2],
            creneauLabel: row[3],
            formation: row[4],
            formateurNom: row[5],
            formateurPrenom: row[6],
            apprenantNom: row[7],
            apprenantPrenom: row[8],
            sessionCode: row[14] || ''
        }));
}

// Sauvegarder une session
// Colonnes : A=sessionCode, B=formateurNom, C=formateurPrenom, D=formation,
//            E=date, F=creneau, G=creneauLabel, H=createdAt, I=jour
async function saveSessions(sessionData) {
    const sheets = await getGoogleSheetsClient();
    
    const row = [
        sessionData.sessionCode,
        sessionData.formateurNom,
        sessionData.formateurPrenom,
        sessionData.formation,
        sessionData.date,
        sessionData.creneau,
        sessionData.creneauLabel,
        sessionData.createdAt,
        sessionData.jour || '' // Colonne I : jour (AFC, LUNDI, MARDI, etc.)
    ];

    await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Sessions!A:I',
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: [row],
        },
    });
    
    console.log(`\u2705 Session sauvegardée: ${sessionData.sessionCode}`);
}

// Récupérer une session par son code
async function getSessionByCode(code) {
    const sheets = await getGoogleSheetsClient();
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'Sessions!A:I', // Colonne I incluse pour récupérer le jour
        });
        const rows = response.data.values || [];
        
        const sessionRow = rows.find(row => row[0] === code);
        
        if (!sessionRow) {
            return null;
        }
        
        return {
            sessionCode: sessionRow[0],
            formateurNom: sessionRow[1],
            formateurPrenom: sessionRow[2],
            formation: sessionRow[3],
            date: sessionRow[4],
            creneau: sessionRow[5],
            creneauLabel: sessionRow[6],
            createdAt: sessionRow[7],
            jour: sessionRow[8] || null // <-- Récupération du jour (AFC, LUNDI, etc.)
        };
        
    } catch (error) {
        console.error('\u274c Erreur recherche session:', error.message);
        throw error;
    }
}

module.exports = {
    appendToSheet,
    getTodayAttendances,
    saveSessions,
    getSessionByCode
};
