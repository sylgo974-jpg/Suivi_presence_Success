const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const attendanceRoutes = require('./routes/attendance');

const app = express();
const PORT = process.env.PORT || 3000;

// Connexion MongoDB
const MONGODB_URI = process.env.MONGODB_URI;

let isMongoConnected = false;

if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('✅ Connecté à MongoDB');
        isMongoConnected = true;
    })
    .catch(err => {
        console.error('❌ Erreur MongoDB:', err.message);
        isMongoConnected = false;
    });
} else {
    console.warn('⚠️ MONGODB_URI non défini');
}

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
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// Modèle Session
const sessionSchema = new mongoose.Schema({
    sessionCode: { type: String, required: true, unique: true, index: true },
    formateurNom: { type: String, required: true },
    formateurPrenom: { type: String, required: true },
    formation: { type: String, required: true },
    date: { type: String, required: true },
    creneau: { type: String, required: true },
    creneauLabel: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 86400 }
});

const Session = mongoose.model('Session', sessionSchema);

// Générer un code court
function generateSessionCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Route POST : Créer une session
app.post('/api/sessions', async (req, res) => {
    try {
        // Vérifier si MongoDB est connecté
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ 
                error: 'Base de données non disponible',
                readyState: mongoose.connection.readyState,
                states: {0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting'}
            });
        }
        
        const { formateurNom, formateurPrenom, formation, date, creneau, creneauLabel } = req.body;
        
        if (!formateurNom || !formateurPrenom || !formation || !date || !creneau) {
            return res.status(400).json({ error: 'Données manquantes' });
        }
        
        let sessionCode;
        let isUnique = false;
        let attempts = 0;
        
        while (!isUnique && attempts < 10) {
            sessionCode = generateSessionCode();
            const existing = await Session.findOne({ sessionCode });
            if (!existing) isUnique = true;
            attempts++;
        }
        
        if (!isUnique) {
            return res.status(500).json({ error: 'Impossible de générer un code unique' });
        }
        
        const session = new Session({
            sessionCode,
            formateurNom,
            formateurPrenom,
            formation,
            date,
            creneau,
            creneauLabel
        });
        
        await session.save();
        
        console.log(`✅ Session créée: ${sessionCode}`);
        res.json({ sessionCode });
        
    } catch (error) {
        console.error('❌ Erreur création session:', error);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
});

// Route GET : Récupérer une session
app.get('/api/sessions/:code', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ error: 'Base de données non disponible' });
        }
        
        const { code } = req.params;
        const session = await Session.findOne({ sessionCode: code });
        
        if (!session) {
            return res.status(404).json({ error: 'Session non trouvée ou expirée' });
        }
        
        res.json(session);
        
    } catch (error) {
        console.error('❌ Erreur récupération session:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Serveur démarré sur le port ${PORT}`);
});
