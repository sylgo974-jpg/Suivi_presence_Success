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
        range: 'Feuille 1!A:N',
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: [row],
        },
    });
}

async function getTodayAttendances(date) {
    const sheets = await getGoogleSheetsClient();
    
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Feuille 1!A:N',
    });

    const rows = response.data.values || [];
    
    // Filtrer par date du jour
    return rows
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

module.exports = {
    appendToSheet,
    getTodayAttendances
};
