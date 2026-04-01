const { google } = require('googleapis');

if (!process.env.GOOGLE_CREDENTIALS) {
    console.error('❌ ERREUR CRITIQUE: Variable GOOGLE_CREDENTIALS manquante!');
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

function norm(str) {
    return (str || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[-_]/g, ' ')
        .trim();
}

// ══════════════════════════════════════════════════════════════════════════════
// UTILITAIRE : écriture sûre en fin de feuille
//
// POURQUOI ? values.append avec INSERT_ROWS peut écraser des lignes existantes
// quand il y a des lignes vides au milieu de la feuille, ou quand deux appels
// arrivent quasi-simultanément (race condition).
//
// STRATÉGIE : lire la colonne A → trouver la dernière ligne non-vide
//             → écrire à lastRow+1 avec values.update
// ══════════════════════════════════════════════════════════════════════════════
async function appendRowSafe(sheets, sheetName, colEnd, rowData) {
    var response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: sheetName + '!A:A',
    });
    var colA = response.data.values || [];

    var lastRow = 0;
    for (var i = colA.length - 1; i >= 0; i--) {
        if (colA[i] && colA[i][0] && colA[i][0].toString().trim() !== '') {
            lastRow = i + 1;
            break;
        }
    }

    var targetRow = lastRow + 1;

    await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: sheetName + '!A' + targetRow + ':' + colEnd + targetRow,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [rowData] },
    });

    console.log('[appendRowSafe] ' + sheetName + ' ligne ' + targetRow);
    return targetRow;
}

// ── Enregistrer une signature d'apprenant ─────────────────────────────────────
async function appendToSheet(data) {
    const sheets = await getGoogleSheetsClient();

    // Anti-doublon
    try {
        var existing = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'Signatures!A:O',
        });
        var rows = existing.data.values || [];

        var isDuplicate = rows.slice(1).some(function(row) {
            return (row[1] || '') === data.date
                && (row[2] || '') === data.creneau
                && norm(row[4]) === norm(data.formation)
                && norm(row[7]) === norm(data.apprenantNom)
                && norm(row[8]) === norm(data.apprenantPrenom);
        });

        if (isDuplicate) {
            console.log('⚠️ Doublon : ' + data.apprenantPrenom + ' ' + data.apprenantNom);
            return { duplicate: true };
        }
    } catch (checkErr) {
        console.warn('⚠️ Vérification doublons impossible:', checkErr.message);
    }

    var row = [
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
        data.sessionCode || ''
    ];

    await appendRowSafe(sheets, 'Signatures', 'O', row);
    console.log('✅ Signature : ' + data.apprenantPrenom + ' ' + data.apprenantNom + ' [' + data.sessionCode + ']');
    return { duplicate: false };
}

// ── Récupérer les présences filtrées par sessionCode ──────────────────────────
async function getTodayAttendances(date, sessionCode) {
    const sheets = await getGoogleSheetsClient();
    var response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: 'Signatures!A:O',
    });
    var rows = response.data.values || [];

    return rows.slice(1).filter(function(row) {
        if (!row[1] || row[1] !== date) return false;
        if (sessionCode) return (row[14] || '') === sessionCode;
        return true;
    }).map(function(row) {
        return {
            timestamp: row[0], date: row[1], creneau: row[2], creneauLabel: row[3],
            formation: row[4], formateurNom: row[5], formateurPrenom: row[6],
            apprenantNom: row[7], apprenantPrenom: row[8], sessionCode: row[14] || ''
        };
    });
}

// ── Présences par formation + date (cross-session) ────────────────────────────
async function getAttendanceByFormation(date, formation, creneau) {
    const sheets = await getGoogleSheetsClient();
    var response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: 'Signatures!A:O',
    });
    var rows = response.data.values || [];
    var seen = new Set();
    var results = [];

    rows.slice(1).forEach(function(row) {
        if ((row[1] || '') !== date) return;
        if (norm(row[4]) !== norm(formation)) return;
        if (creneau && (row[2] || '') !== creneau) return;
        var key = norm(row[7]) + '|' + norm(row[8]) + '|' + (row[2] || '');
        if (seen.has(key)) return;
        seen.add(key);
        results.push({
            timestamp: row[0], date: row[1], creneau: row[2], creneauLabel: row[3],
            formation: row[4], formateurNom: row[5], formateurPrenom: row[6],
            apprenantNom: row[7], apprenantPrenom: row[8], sessionCode: row[14] || ''
        });
    });
    return results;
}

// ── Sauvegarder une session ──────────────────────────────────────────────────
async function saveSessions(sessionData) {
    const sheets = await getGoogleSheetsClient();
    var row = [
        sessionData.sessionCode, sessionData.formateurNom, sessionData.formateurPrenom,
        sessionData.formation, sessionData.date, sessionData.creneau,
        sessionData.creneauLabel, sessionData.createdAt, sessionData.jour || '',
        sessionData.signatureMatin || '', sessionData.signatureApresMidi || ''
    ];
    await appendRowSafe(sheets, 'Sessions', 'K', row);
    console.log('✅ Session sauvegardée: ' + sessionData.sessionCode);
}

// ── Récupérer une session par son code ───────────────────────────────────────
async function getSessionByCode(code) {
    const sheets = await getGoogleSheetsClient();
    try {
        var response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID, range: 'Sessions!A:K',
        });
        var rows = response.data.values || [];
        var sessionRow = rows.find(function(row) { return row[0] === code; });
        if (!sessionRow) return null;
        return {
            sessionCode: sessionRow[0], formateurNom: sessionRow[1],
            formateurPrenom: sessionRow[2], formation: sessionRow[3],
            date: sessionRow[4], creneau: sessionRow[5], creneauLabel: sessionRow[6],
            createdAt: sessionRow[7], jour: sessionRow[8] || null,
            signatureMatin: sessionRow[9] || null, signatureApresMidi: sessionRow[10] || null
        };
    } catch (error) {
        console.error('❌ Erreur recherche session:', error.message);
        throw error;
    }
}

// ── Mettre à jour la signature formateur ─────────────────────────────────────
async function updateSessionSignature(code, creneau, signature) {
    const sheets = await getGoogleSheetsClient();
    var response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: 'Sessions!A:A',
    });
    var rows = response.data.values || [];
    var rowIndex = rows.findIndex(function(row, i) { return i > 0 && row[0] === code; });
    if (rowIndex === -1) throw new Error('Session ' + code + ' introuvable');
    var sheetsRow = rowIndex + 1;
    var col = creneau === 'matin' ? 'J' : 'K';
    await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: 'Sessions!' + col + sheetsRow,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[signature]] },
    });
    console.log('✅ Sig ' + creneau + ' — session ' + code + ' (ligne ' + sheetsRow + ')');
}

// ── Récapitulatif mensuel ────────────────────────────────────────────────────
async function getMonthlyAttendance(nomComplet, month, year) {
    const sheets = await getGoogleSheetsClient();
    var ncNorm = norm(nomComplet);

    function isInMonth(dateStr) {
        if (!dateStr) return false;
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        return (d.getMonth() + 1) === parseInt(month) && d.getFullYear() === parseInt(year);
    }

    var sigResp = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: 'Signatures!A:O',
    });
    var sigRows = (sigResp.data.values || []).slice(1);

    var mySignatures = sigRows.filter(function(row) {
        var f1 = norm((row[7]||'') + ' ' + (row[8]||''));
        var f2 = norm((row[8]||'') + ' ' + (row[7]||''));
        var nameMatch = ncNorm === f1 || ncNorm === f2
            || f1.indexOf(ncNorm) >= 0 || f2.indexOf(ncNorm) >= 0
            || ncNorm.indexOf(norm(row[7])) >= 0;
        return nameMatch && isInMonth(row[1] || '');
    });

    var sessResp = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: 'Sessions!A:K',
    });
    var sessRows = (sessResp.data.values || []).slice(1);
    var sessionsMap = {};
    sessRows.forEach(function(row) {
        if (row[0]) sessionsMap[row[0]] = {
            sessionCode: row[0], formateurNom: row[1], formateurPrenom: row[2],
            formation: row[3], date: row[4], creneau: row[5], jour: row[8] || '',
            signatureMatin: row[9] || null, signatureApresMidi: row[10] || null
        };
    });

    var dailyMap = {};
    mySignatures.forEach(function(sig) {
        var date = sig[1] || '', creneau = sig[2] || '';
        var sessionCode = sig[14] || '';
        var sess = sessionsMap[sessionCode] || {};
        var dateKey = date.indexOf('T') >= 0 ? date.split('T')[0] : date;
        if (!dailyMap[dateKey]) dailyMap[dateKey] = { date: dateKey, matin: null, apresMidi: null };
        var sigData = {
            timestamp: sig[0] || '', formation: sig[4] || '',
            formateurNom: sig[5] || sess.formateurNom || '',
            formateurPrenom: sig[6] || sess.formateurPrenom || '',
            signatureApprenant: sig[9] || null, sessionCode: sessionCode,
            signatureFormateur: creneau === 'matin' ? (sess.signatureMatin || null) : (sess.signatureApresMidi || null),
            signatureFormateurMatin: sess.signatureMatin || null,
            signatureFormateurApresMidi: sess.signatureApresMidi || null
        };
        if (creneau === 'matin') dailyMap[dateKey].matin = sigData;
        else dailyMap[dateKey].apresMidi = sigData;
    });

    return {
        apprenant: { nomComplet: nomComplet },
        mois: parseInt(month), annee: parseInt(year),
        attendances: Object.values(dailyMap).sort(function(a,b) { return new Date(a.date) - new Date(b.date); })
    };
}

module.exports = {
    appendToSheet, getTodayAttendances, getAttendanceByFormation,
    saveSessions, getSessionByCode, updateSessionSignature, getMonthlyAttendance
};
