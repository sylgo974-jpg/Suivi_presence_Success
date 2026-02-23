const express = require('express');
const router = express.Router();
const { 
    getAllRessources, 
    getFormateurs, 
    getApprenants, 
    getFormations,
    getRessourcesByFilters 
} = require('../config/resources');

/**
 * GET /api/resources/all
 * Récupère toutes les ressources
 */
router.get('/all', async (req, res) => {
    try {
        const ressources = await getAllRessources();
        res.json(ressources);
    } catch (error) {
        console.error('❌ Erreur récupération ressources:', error);
        res.status(500).json({ 
            error: 'Erreur serveur', 
            details: error.message 
        });
    }
});

/**
 * GET /api/resources/formations
 * Récupère la liste unique des formations
 */
router.get('/formations', async (req, res) => {
    try {
        const formations = await getFormations();
        res.json(formations);
    } catch (error) {
        console.error('❌ Erreur récupération formations:', error);
        res.status(500).json({ 
            error: 'Erreur serveur', 
            details: error.message 
        });
    }
});

/**
 * GET /api/resources/formateurs
 * Récupère les formateurs (avec filtres optionnels)
 * Query params: jour, creneau, formation
 */
router.get('/formateurs', async (req, res) => {
    try {
        const { jour, creneau, formation } = req.query;
        const formateurs = await getFormateurs(
            jour || null, 
            creneau || null, 
            formation || null
        );
        res.json(formateurs);
    } catch (error) {
        console.error('❌ Erreur récupération formateurs:', error);
        res.status(500).json({ 
            error: 'Erreur serveur', 
            details: error.message 
        });
    }
});

/**
 * GET /api/resources/apprenants
 * Récupère les apprenants (avec filtres optionnels)
 * Query params: jour, creneau, formation
 */
router.get('/apprenants', async (req, res) => {
    try {
        const { jour, creneau, formation } = req.query;
        const apprenants = await getApprenants(
            jour || null, 
            creneau || null, 
            formation || null
        );
        res.json(apprenants);
    } catch (error) {
        console.error('❌ Erreur récupération apprenants:', error);
        res.status(500).json({ 
            error: 'Erreur serveur', 
            details: error.message 
        });
    }
});

/**
 * GET /api/resources/filter
 * Récupère les ressources filtrées complètes (formateurs + apprenants)
 * Query params: jour, creneau, formation
 */
router.get('/filter', async (req, res) => {
    try {
        const { jour, creneau, formation } = req.query;
        const ressources = await getRessourcesByFilters(
            jour || null, 
            creneau || null, 
            formation || null
        );
        
        // Séparer formateurs et apprenants
        const formateurs = ressources.filter(r => r.role === 'Formateur');
        const apprenants = ressources.filter(r => r.role === 'Apprenant');
        
        res.json({
            formateurs: formateurs.map(f => f.nom),
            apprenants: apprenants.map(a => a.nom),
            total: {
                formateurs: formateurs.length,
                apprenants: apprenants.length
            }
        });
    } catch (error) {
        console.error('❌ Erreur filtre ressources:', error);
        res.status(500).json({ 
            error: 'Erreur serveur', 
            details: error.message 
        });
    }
});

module.exports = router;
