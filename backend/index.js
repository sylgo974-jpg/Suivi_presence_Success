const express = require('express');
const cors = require('cors');
const attendanceRoutes = require('./routes/attendance');
const { saveSessions, getSessionByCode } = require('./config/sheets');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/attendance', attendanceRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        storage: 'Google Sheets'
    });
});

// Générer un code court (6 caractères alphanumeriques)
function generateSessionCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sans O, 0, I, 1 pour éviter confusion
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Route POST : Créer une session
app.post('/api/sessions', async (req, res) => {
    try {
        const { formateurNom, formateurPrenom, formation, date, creneau, creneauLabel } = req.body;
        
        if (!formateurNom || !formateurPrenom || !formation || !date || !creneau) {
            return res.status(400).json({ error: 'Données manquantes' });
        }
        
        // Générer un code unique
        const sessionCode = generateSessionCode();
        
        const sessionData = {
            sessionCode,
            formateurNom,
            formateurPrenom,
            formation,
            date,
            creneau,
            creneauLabel,
            createdAt: new Date().toISOString()
        };
        
        // Sauvegarder dans Google Sheets
        await saveSessions(sessionData);
        
        console.log(`✅ Session créée: ${sessionCode}`);
        res.json({ sessionCode });
        
    } catch (error) {
        console.error('❌ Erreur création session:', error);
        res.status(500).json({ 
            error: 'Erreur serveur', 
            details: error.message 
        });
    }
});

// Route GET : Récupérer une session par son code
app.get('/api/sessions/:code', async (req, res) => {
    try {
        const { code } = req.params;
        
        console.log(`🔍 Recherche session: ${code}`);
        
        const session = await getSessionByCode(code);
        
        if (!session) {
            console.log(`❌ Session non trouvée: ${code}`);
            return res.status(404).json({ error: 'Session non trouvée ou expirée' });
        }
        
        // Vérifier si la session a plus de 24h (optionnel)
        const sessionDate = new Date(session.createdAt);
        const now = new Date();
        const hoursDiff = (now - sessionDate) / (1000 * 60 * 60);
        
        if (hoursDiff > 24) {
            console.log(`⏰ Session expirée: ${code} (${hoursDiff.toFixed(1)}h)`);
            return res.status(404).json({ error: 'Session expirée (valide 24h)' });
        }
        
        console.log(`✅ Session trouvée: ${code}`);
        res.json(session);
        
    } catch (error) {
        console.error('❌ Erreur récupération session:', error);
        res.status(500).json({ 
            error: 'Erreur serveur',
            details: error.message 
        });
    }
});

// Export pour Vercel
module.exports = app;

// Démarrage serveur local uniquement
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`✅ Serveur démarré sur le port ${PORT}`);
        console.log(`📊 Stockage: Google Sheets uniquement`);
    });
}
