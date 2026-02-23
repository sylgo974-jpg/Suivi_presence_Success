const express = require('express');
const router = express.Router();
const { appendToSheet, getTodayAttendances } = require('../config/sheets');

// Enregistrer une signature
router.post('/sign', async (req, res) => {
    try {
        const data = req.body;
        
        // Validation
        if (!data.apprenantNom || !data.apprenantPrenom || !data.signature) {
            return res.status(400).json({ message: 'Données incomplètes' });
        }

        // Enregistrer dans Google Sheets (le sessionCode est inclus dans data)
        await appendToSheet(data);

        res.json({ success: true, message: 'Signature enregistrée' });
    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// Récupérer les présences filtrées par sessionCode
// GET /api/attendance/today?date=YYYY-MM-DD&sessionCode=XXXXXX
router.get('/today', async (req, res) => {
    try {
        const date = req.query.date;
        const sessionCode = req.query.sessionCode || null; // Optionnel mais recommandé
        
        if (!date) {
            return res.status(400).json({ message: 'Paramètre date manquant' });
        }
        
        const attendances = await getTodayAttendances(date, sessionCode);
        res.json(attendances);
    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

module.exports = router;
