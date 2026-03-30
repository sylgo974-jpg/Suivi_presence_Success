const express = require('express');
const router  = express.Router();
const { getMonthlyAttendance } = require('../config/sheets');
const { getApprenants }        = require('../config/resources');

/**
 * GET /api/rapport/apprenants
 * Retourne la liste de tous les apprenants (toutes formations, tous jours)
 * pour alimenter le sélecteur du module rapport.
 */
router.get('/apprenants', async (req, res) => {
  try {
    // Pas de filtre → tous les apprenants
    const apprenants = await getApprenants(null, null, null);

    // Déduplique et trie
    const unique = [...new Set(apprenants)].sort();
    res.json(unique);
  } catch (error) {
    console.error('❌ Erreur apprenants rapport:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

/**
 * GET /api/rapport/mensuel?nomComplet=DUPONT Jean&mois=3&annee=2026
 * Retourne les données de présence mensuelle pour un apprenant.
 *
 * Réponse JSON :
 * {
 *   apprenant: { nomComplet },
 *   mois, annee,
 *   attendances: [
 *     {
 *       date,
 *       matin:    { timestamp, formation, formateurNom, formateurPrenom,
 *                   signatureApprenant, signatureFormateur } | null,
 *       apresMidi: { ... } | null
 *     }, ...
 *   ]
 * }
 */
router.get('/mensuel', async (req, res) => {
  const { nomComplet, mois, annee } = req.query;

  if (!nomComplet || !mois || !annee) {
    return res.status(400).json({
      error: 'Paramètres manquants',
      requis: ['nomComplet', 'mois', 'annee']
    });
  }

  const moisInt  = parseInt(mois);
  const anneeInt = parseInt(annee);

  if (isNaN(moisInt) || moisInt < 1 || moisInt > 12) {
    return res.status(400).json({ error: 'Paramètre mois invalide (1-12)' });
  }
  if (isNaN(anneeInt) || anneeInt < 2020 || anneeInt > 2100) {
    return res.status(400).json({ error: 'Paramètre annee invalide' });
  }

  try {
    const data = await getMonthlyAttendance(nomComplet, moisInt, anneeInt);
    res.json(data);
  } catch (error) {
    console.error('❌ Erreur rapport mensuel:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

module.exports = router;
