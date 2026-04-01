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

// ── Normalisation pour comparaisons de noms ────────────────────────────────────────
function norm(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_]/g, ' ')
    .trim();
}

// ── Enregistrer une signature d'apprenant ──────────────────────────────────────────
// FIX : Vérification anti-doublon AVANT l'écriture
async function appendToSheet(data) {
  const sheets = await getGoogleSheetsClient();

  // ── Anti-doublon : vérifier si cet apprenant a déjà signé ce créneau/date ──
  try {
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Signatures!A:O',
    });
    const rows = existing.data.values || [];

    const isDuplicate = rows.slice(1).some(row => {
      const rowDate = row[1] || '';
      const rowCreneau = row[2] || '';
      const rowFormation = row[4] || '';
      const rowNom = row[7] || '';
      const rowPrenom = row[8] || '';

      return rowDate === data.date
        && rowCreneau === data.creneau
        && norm(rowFormation) === norm(data.formation)
        && norm(rowNom) === norm(data.apprenantNom)
        && norm(rowPrenom) === norm(data.apprenantPrenom);
    });

    if (isDuplicate) {
      console.log(`⚠️ Doublon détecté : ${data.apprenantPrenom} ${data.apprenantNom} a déjà signé le ${data.date} créneau ${data.creneau} (${data.formation}). Écriture ignorée.`);
      return { duplicate: true };
    }
  } catch (checkErr) {
    // En cas d'erreur de lecture, on continue quand même l'écriture
    // pour ne pas bloquer la signature
    console.warn('⚠️ Impossible de vérifier les doublons:', checkErr.message);
  }

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
    data.sessionCode || '' // Colonne O
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Signatures!A:O',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS', // FIX : forcer l'insertion de nouvelles lignes
    resource: { values: [row] },
  });

  console.log(`✅ Signature enregistrée: ${data.apprenantPrenom} ${data.apprenantNom} [session: ${data.sessionCode}]`);
  return { duplicate: false };
}

// ── Récupérer les présences filtrées par sessionCode (ancien mode) ──────────────────
async function getTodayAttendances(date, sessionCode) {
  const sheets = await getGoogleSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Signatures!A:O',
  });
  const rows = response.data.values || [];

  return rows
    .slice(1)
    .filter(row => {
      const rowDate = row[1];
      const rowSessionCode = row[14] || '';
      if (!rowDate) return false;
      if (rowDate !== date) return false;
      if (sessionCode) return rowSessionCode === sessionCode;
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

// ═════════════════════════════════════════════════════════════════════════════════
// FIX PRINCIPAL : Nouvelle fonction — présences par formation + date + créneau
// Agrège les signatures de TOUTES les sessions d'une même formation/date
// Déduplique par nom normalisé pour éviter les doublons visuels
// ═════════════════════════════════════════════════════════════════════════════════
async function getAttendanceByFormation(date, formation, creneau) {
  const sheets = await getGoogleSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Signatures!A:O',
  });
  const rows = response.data.values || [];

  const seen = new Set(); // Pour dédupliquer par nom normalisé + créneau
  const results = [];

  rows.slice(1).forEach(row => {
    const rowDate = row[1] || '';
    const rowCreneau = row[2] || '';
    const rowFormation = row[4] || '';
    const rowNom = row[7] || '';
    const rowPrenom = row[8] || '';

    if (rowDate !== date) return;
    if (norm(rowFormation) !== norm(formation)) return;
    if (creneau && rowCreneau !== creneau) return;

    // Clé de déduplication : nom normalisé + créneau
    const dedupeKey = norm(rowNom) + '|' + norm(rowPrenom) + '|' + rowCreneau;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    results.push({
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
    });
  });

  return results;
}

// ── Sauvegarder une session ─────────────────────────────────────────────────────────
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
    sessionData.jour || '',
    sessionData.signatureMatin || '',
    sessionData.signatureApresMidi || ''
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Sessions!A:K',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS', // FIX : forcer INSERT au lieu de OVERWRITE
    resource: { values: [row] },
  });

  console.log(`✅ Session sauvegardée: ${sessionData.sessionCode}`);
}

// ── Récupérer une session par son code ───────────────────────────────────────────────
async function getSessionByCode(code) {
  const sheets = await getGoogleSheetsClient();

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Sessions!A:K',
    });
    const rows = response.data.values || [];

    const sessionRow = rows.find(row => row[0] === code);
    if (!sessionRow) return null;

    return {
      sessionCode: sessionRow[0],
      formateurNom: sessionRow[1],
      formateurPrenom: sessionRow[2],
      formation: sessionRow[3],
      date: sessionRow[4],
      creneau: sessionRow[5],
      creneauLabel: sessionRow[6],
      createdAt: sessionRow[7],
      jour: sessionRow[8] || null,
      signatureMatin: sessionRow[9] || null,
      signatureApresMidi: sessionRow[10] || null
    };
  } catch (error) {
    console.error('❌ Erreur recherche session:', error.message);
    throw error;
  }
}

// ── Mettre à jour la signature formateur d'une session existante ─────────────────────
async function updateSessionSignature(code, creneau, signature) {
  const sheets = await getGoogleSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Sessions!A:A',
  });
  const rows = response.data.values || [];

  const rowIndex = rows.findIndex((row, i) => i > 0 && row[0] === code);
  if (rowIndex === -1) {
    throw new Error(`Session ${code} introuvable`);
  }
  const sheetsRow = rowIndex + 1;
  const col = creneau === 'matin' ? 'J' : 'K';

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Sessions!${col}${sheetsRow}`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: [[signature]] },
  });

  console.log(`✅ Signature ${creneau} mise à jour — session ${code} (ligne ${sheetsRow})`);
}

// ── Récapitulatif mensuel d'un apprenant ──────────────────────────────────────────────
async function getMonthlyAttendance(nomComplet, month, year) {
  const sheets = await getGoogleSheetsClient();

  const ncNorm = norm(nomComplet);

  function isInMonth(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    return (d.getMonth() + 1) === parseInt(month) &&
      d.getFullYear() === parseInt(year);
  }

  // ── 1. Lire toutes les signatures ──────────────────────────────────────────────
  const sigResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Signatures!A:O',
  });
  const sigRows = (sigResp.data.values || []).slice(1);

  const mySignatures = sigRows.filter(row => {
    const sigNom = row[7] || '';
    const sigPrenom = row[8] || '';
    const sigFull1 = norm(`${sigNom} ${sigPrenom}`);
    const sigFull2 = norm(`${sigPrenom} ${sigNom}`);
    const dateRow = row[1] || '';

    const nameMatch =
      ncNorm === sigFull1 ||
      ncNorm === sigFull2 ||
      sigFull1.includes(ncNorm) ||
      sigFull2.includes(ncNorm) ||
      ncNorm.includes(norm(sigNom));

    return nameMatch && isInMonth(dateRow);
  });

  // ── 2. Lire toutes les sessions pour récupérer les signatures formateur ──────────
  const sessResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Sessions!A:K',
  });
  const sessRows = (sessResp.data.values || []).slice(1);

  const sessionsMap = {};
  sessRows.forEach(row => {
    if (row[0]) {
      sessionsMap[row[0]] = {
        sessionCode: row[0],
        formateurNom: row[1],
        formateurPrenom: row[2],
        formation: row[3],
        date: row[4],
        creneau: row[5],
        jour: row[8] || '',
        signatureMatin: row[9] || null,
        signatureApresMidi: row[10] || null
      };
    }
  });

  // ── 3. Construire la map journalière ────────────────────────────────────────────
  const dailyMap = {};

  mySignatures.forEach(sig => {
    const date = sig[1] || '';
    const creneau = sig[2] || '';
    const timestamp = sig[0] || '';
    const sessionCode = sig[14] || '';
    const sess = sessionsMap[sessionCode] || {};

    const dateKey = date.includes('T') ? date.split('T')[0] : date;

    if (!dailyMap[dateKey]) {
      dailyMap[dateKey] = { date: dateKey, matin: null, apresMidi: null };
    }

    const sigData = {
      timestamp,
      formation: sig[4] || '',
      formateurNom: sig[5] || sess.formateurNom || '',
      formateurPrenom: sig[6] || sess.formateurPrenom || '',
      signatureApprenant: sig[9] || null,
      sessionCode,
      signatureFormateur: creneau === 'matin'
        ? (sess.signatureMatin || null)
        : (sess.signatureApresMidi || null),
      signatureFormateurMatin: sess.signatureMatin || null,
      signatureFormateurApresMidi: sess.signatureApresMidi || null
    };

    if (creneau === 'matin') {
      dailyMap[dateKey].matin = sigData;
    } else {
      dailyMap[dateKey].apresMidi = sigData;
    }
  });

  const attendances = Object.values(dailyMap)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return {
    apprenant: { nomComplet },
    mois: parseInt(month),
    annee: parseInt(year),
    attendances
  };
}

module.exports = {
  appendToSheet,
  getTodayAttendances,
  getAttendanceByFormation, // NOUVEAU
  saveSessions,
  getSessionByCode,
  updateSessionSignature,
  getMonthlyAttendance
};
