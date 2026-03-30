const express = require('express');
const cors    = require('cors');
const attendanceRoutes = require('./routes/attendance');
const resourcesRoutes  = require('./routes/resources');
const rapportRoutes    = require('./routes/rapport');
const { saveSessions, getSessionByCode, updateSessionSignature }
    = require('./config/sheets');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '20mb' })); // Augmenté pour les signatures base64

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/attendance', attendanceRoutes);
app.use('/api/resources',  resourcesRoutes);
app.use('/api/rapport',    rapportRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString(), storage: 'Google Sheets' });
});

// ── Générateur de code session ────────────────────────────────────────────────
function generateSessionCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// ── POST /api/sessions — Créer une session ────────────────────────────────────
app.post('/api/sessions', async (req, res) => {
    try {
        const {
            formateurNom,
            formateurPrenom,
            formation,
            jour,
            date,
            creneau,
            creneauLabel,
            signatureMatin,      // Nouveau : signature formateur matin (base64)
            signatureApresMidi   // Nouveau : signature formateur après-midi (base64)
        } = req.body;

        if (!formateurNom || !formateurPrenom || !formation || !date || !creneau) {
            return res.status(400).json({ error: 'Données manquantes' });
        }

        const sessionCode = generateSessionCode();

        const sessionData = {
            sessionCode,
            formateurNom,
            formateurPrenom,
            formation,
            jour:               jour || null,
            date,
            creneau,
            creneauLabel,
            createdAt:          new Date().toISOString(),
            signatureMatin:     signatureMatin     || '',
            signatureApresMidi: signatureApresMidi || ''
        };

        await saveSessions(sessionData);
        console.log(`✅ Session créée: ${sessionCode}`);
        res.json({ sessionCode });

    } catch (error) {
        console.error('❌ Erreur création session:', error);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
});

// ── GET /api/sessions/:code — Récupérer une session ──────────────────────────
app.get('/api/sessions/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const session  = await getSessionByCode(code);

        if (!session) {
            return res.status(404).json({ error: 'Session non trouvée ou expirée' });
        }

        const sessionDate = new Date(session.createdAt);
        const hoursDiff   = (Date.now() - sessionDate) / (1000 * 60 * 60);

        if (hoursDiff > 24) {
            return res.status(404).json({ error: 'Session expirée (valide 24h)' });
        }

        res.json(session);

    } catch (error) {
        console.error('❌ Erreur récupération session:', error);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
});

// ── PATCH /api/sessions/:code/signature — Mettre à jour la sig formateur ─────
// Body : { creneau: 'matin'|'apres-midi', signature: '<base64>' }
app.patch('/api/sessions/:code/signature', async (req, res) => {
    try {
        const { code }               = req.params;
        const { creneau, signature } = req.body;

        if (!creneau || !signature) {
            return res.status(400).json({ error: 'creneau et signature sont requis' });
        }

        if (!['matin', 'apres-midi'].includes(creneau)) {
            return res.status(400).json({ error: 'creneau doit être "matin" ou "apres-midi"' });
        }

        await updateSessionSignature(code, creneau, signature);
        console.log(`✅ Signature ${creneau} mise à jour — session ${code}`);
        res.json({ success: true, message: `Signature ${creneau} enregistrée` });

    } catch (error) {
        console.error('❌ Erreur mise à jour signature:', error);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
});

// ── Export Vercel ─────────────────────────────────────────────────────────────
module.exports = app;

// ── Démarrage local ───────────────────────────────────────────────────────────
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`✅ Serveur démarré sur le port ${PORT}`);
        console.log(`📊 Stockage: Google Sheets`);
    });
}
