const { google } = require('googleapis');
const credentials = process.env.GOOGLE_CREDENTIALS 
    ? JSON.parse(process.env.GOOGLE_CREDENTIALS) 
    : require('./suivi-pointage-486908-ca78da824d02.json');

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
        data.timestamp
    ];

    await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Signatures!A:N',
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: [row],
        },
    });
    
    console.log(`✅ Signature enregistrée: ${data.apprenantPrenom} ${data.apprenantNom}`);
}

// Récupérer les présences d'une date donnée
async function getTodayAttendances(date) {
    const sheets = await getGoogleSheetsClient();
    
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Signatures!A:N',
    });

    const rows = response.data.values || [];
    
    // Filtrer par date du jour (colonne B = index 1)
    return rows
        .slice(1) // Ignorer l'en-tête
        .filter(row => row[1] === date)
        .map(row => ({
            timestamp: row[0],
            date: row[1],
            creneau: row[2],
            creneauLabel: row[3],
            formation: row[4],
            formateurNom: row[5],
            formateurPrenom: row[6],
            apprenantNom: row[7],
            apprenantPrenom: row[8]
        }));
}

// Sauvegarder une session (nouveau)
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
        sessionData.createdAt
    ];

    await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Sessions!A:H',
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: [row],
        },
    });
    
    console.log(`✅ Session sauvegardée: ${sessionData.sessionCode}`);
}

// Récupérer une session par son code (nouveau)
async function getSessionByCode(code) {
    const sheets = await getGoogleSheetsClient();
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'Sessions!A:H',
        });

        const rows = response.data.values || [];
        
        // Chercher le code dans la colonne A (index 0)
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
            createdAt: sessionRow[7]
        };
        
    } catch (error) {
        console.error('❌ Erreur recherche session:', error.message);
        throw error;
    }
}

module.exports = {
    appendToSheet,
    getTodayAttendances,
    saveSessions,
    getSessionByCode
};
