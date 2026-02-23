const express = require('express');
const router = express.Router();
const { appendToSheet, getTodayAttendances } = require('../config/sheets');

// ── Utilitaires retry ──────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function isRetryable(err) {
  const msg = (err && err.message) ? err.message : String(err);
  return /backendError|503|500|UNAVAILABLE|ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket hang up/i.test(msg);
}

// Exponential backoff : 300ms -> 900ms -> 2700ms
async function appendWithRetry(data, maxRetries = 3) {
  let attempt = 0;
  while (true) {
    try {
      return await appendToSheet(data);
    } catch (err) {
      attempt++;
      if (!isRetryable(err) || attempt > maxRetries) throw err;
      const delay = 300 * Math.pow(3, attempt - 1);
      console.warn(`Retry appendToSheet (tentative ${attempt}/${maxRetries}) dans ${delay}ms...`);
      await sleep(delay);
    }
  }
}
// ──────────────────────────────────────────────────────────────────────────────

// POST /api/attendance/sign
router.post('/sign', async (req, res) => {
  try {
    const data = req.body;

    if (!data.apprenantNom || !data.apprenantPrenom || !data.signature) {
      return res.status(400).json({ message: 'Donnees incompletes', code: 'BAD_REQUEST' });
    }

    // Retry automatique sur erreurs transitoires Google Sheets API
    await appendWithRetry(data, 3);

    res.json({ success: true, message: 'Signature enregistree' });

  } catch (error) {
    console.error('Erreur /attendance/sign:', error);
    res.status(500).json({
      message: 'Erreur serveur (ecriture feuille)',
      code: 'SHEETS_APPEND_FAILED'
    });
  }
});

// GET /api/attendance/today?date=YYYY-MM-DD&sessionCode=XXXXXX
router.get('/today', async (req, res) => {
  try {
    const date = req.query.date;
    const sessionCode = req.query.sessionCode || null;

    if (!date) {
      return res.status(400).json({ message: 'Parametre date manquant', code: 'BAD_REQUEST' });
    }

    const attendances = await getTodayAttendances(date, sessionCode);
    res.json(attendances);

  } catch (error) {
    console.error('Erreur /attendance/today:', error);
    res.status(500).json({ message: 'Erreur serveur', code: 'TODAY_FETCH_FAILED' });
  }
});

module.exports = router;
