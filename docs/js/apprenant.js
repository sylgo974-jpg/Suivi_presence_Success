const API_URL = 'https://suivi-presence-success.vercel.app/api';
const sessionFormateur = document.getElementById('session-formateur');
const sessionFormation = document.getElementById('session-formation');
const sessionDate = document.getElementById('session-date');
const sessionCreneau = document.getElementById('session-creneau');
const clearBtn = document.getElementById('clear-signature');
const submitBtn = document.getElementById('submit-signature');
const successMessage = document.getElementById('success-message');
const errorMessage = document.getElementById('error-message');
const errorText = document.getElementById('error-text');
const canvas = document.getElementById('signature-pad');
const signaturePad = new SignaturePad(canvas, {
  backgroundColor: 'rgb(255, 255, 255)',
  penColor: 'rgb(0, 0, 0)',
  minWidth: 1.5,
  maxWidth: 3.5
});

let sessionData = {};
let listeApprenants = [];
let monNomComplet = '';
let intervalId = null;

// ── Normalisation robuste (même logique que backend et formateur.js) ──────────
function normalise(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Resize canvas ─────────────────────────────────────────────────────────────
function resizeCanvas() {
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const data = signaturePad.toData();
  canvas.width = canvas.offsetWidth * ratio;
  canvas.height = canvas.offsetHeight * ratio;
  canvas.getContext('2d').scale(ratio, ratio);
  signaturePad.clear();
  if (data && data.length > 0) signaturePad.fromData(data);
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resizeCanvas, 250);
});
resizeCanvas();

document.getElementById('signature-pad').addEventListener('touchstart', (e) => {
  e.stopPropagation();
}, { passive: false });

// ── Retry fetch ───────────────────────────────────────────────────────────────
async function postWithRetry(url, payload, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) return res;
      if (![500, 503].includes(res.status) || i === retries) return res;
    } catch (networkErr) {
      if (i === retries) throw networkErr;
    }
    await new Promise(r => setTimeout(r, 600 * (i + 1)));
  }
}

// ── Export signature JPEG compressé ───────────────────────────────────────────
function exportSignatureCompressed(sourceCanvas) {
  const out = document.createElement('canvas');
  out.width = 600;
  out.height = 300;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 600, 300);
  ctx.drawImage(sourceCanvas, 0, 0, 600, 300);
  return out.toDataURL('image/jpeg', 0.7);
}

// ── Chargement des données session ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadSessionData();
});

async function loadSessionData() {
  const params = new URLSearchParams(window.location.search);
  const sessionCode = params.get('code');
  
  if (sessionCode) {
    try {
      const response = await fetch(`${API_URL}/sessions/${sessionCode}`);
      if (!response.ok) throw new Error('Session non trouvée ou expirée');
      sessionData = await response.json();
    } catch (error) {
      showError('Le QR code a peut-être expiré (valide 24h). ' + error.message);
      disableForm();
      return;
    }
  } else {
    sessionData = {
      formateurNom: params.get('formateurNom') || '',
      formateurPrenom: params.get('formateurPrenom') || '',
      formation: params.get('formation') || '',
      date: params.get('date') || '',
      creneau: params.get('creneau') || '',
      creneauLabel: params.get('creneauLabel') || '',
      jour: params.get('jour') || ''
    };
  }

  sessionFormateur.textContent = sessionData.formateurPrenom + ' ' + sessionData.formateurNom;
  sessionFormation.textContent = sessionData.formation;
  sessionDate.textContent = new Date(sessionData.date).toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  sessionCreneau.textContent = sessionData.creneauLabel;

  if (!validateSession()) return;

  await chargerApprenants();

  // FIX : Utiliser un intervalle qui charge les présences cross-session
  intervalId = setInterval(rafraichirPresences, 8000);
  rafraichirPresences();
}

// ── Charger la liste des apprenants attendus depuis l'API ─────────────────────
async function chargerApprenants() {
  if (!sessionData.formation) return;
  try {
    let jour = sessionData.jour;
    if (!jour && sessionData.date) {
      const joursSemaine = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'];
      jour = joursSemaine[new Date(sessionData.date).getDay()];
    }
    
    const url = `${API_URL}/resources/apprenants?formation=${encodeURIComponent(sessionData.formation)}${jour ? '&jour=' + encodeURIComponent(jour) : ''}`;
    const res = await fetch(url);
    listeApprenants = await res.json();
    
    const sel = document.getElementById('apprenant-select');
    if (sel) {
      sel.innerHTML = '<option value="">-- Choisir mon nom --</option>';
      listeApprenants.forEach(nom => {
        const opt = document.createElement('option');
        opt.value = nom;
        opt.textContent = nom;
        sel.appendChild(opt);
      });
      
      const optAutre = document.createElement('option');
      optAutre.value = "AUTRE";
      optAutre.textContent = "➕ Mon nom n'est pas dans la liste...";
      sel.appendChild(optAutre);

      document.getElementById('select-apprenant-group').style.display = 'block';
      document.getElementById('saisie-manuelle-group').style.display = 'none';
      document.getElementById('saisie-prenom-group').style.display = 'none';

      sel.addEventListener('change', function() {
        const val = this.value;
        const manualNomGroup = document.getElementById('saisie-manuelle-group');
        const manualPrenomGroup = document.getElementById('saisie-prenom-group');
        
        if (val === "AUTRE") {
          monNomComplet = '';
          document.getElementById('apprenant-nom').value = '';
          document.getElementById('apprenant-prenom').value = '';
          manualNomGroup.style.display = 'block';
          manualPrenomGroup.style.display = 'block';
        } else {
          monNomComplet = val;
          manualNomGroup.style.display = 'none';
          manualPrenomGroup.style.display = 'none';
          if (!val) {
            document.getElementById('apprenant-nom').value = '';
            document.getElementById('apprenant-prenom').value = '';
            return;
          }
          const parts = val.split(' ');
          document.getElementById('apprenant-nom').value = parts[0] || '';
          document.getElementById('apprenant-prenom').value = parts.slice(1).join(' ') || parts[0];
          rafraichirPresences();
        }
      });
    }
    document.getElementById('presence-card').style.display = 'block';
  } catch(e) {
    console.warn('Impossible de charger la liste des apprenants:', e);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// FIX PRINCIPAL : Rafraîchir les présences via /by-formation (cross-session)
// Au lieu de filtrer par sessionCode uniquement, on filtre par formation+date
// Cela permet de voir TOUTES les signatures, même celles d'autres sessions
// ══════════════════════════════════════════════════════════════════════════════
async function rafraichirPresences() {
  if (!sessionData || !sessionData.formation || !sessionData.date) return;

  try {
    const dateToday = sessionData.date.includes('T')
      ? sessionData.date.split('T')[0]
      : sessionData.date;

    // FIX : Utiliser le nouvel endpoint cross-session
    const url = `${API_URL}/attendance/by-formation?date=${encodeURIComponent(dateToday)}&formation=${encodeURIComponent(sessionData.formation)}`;
    const response = await fetch(url);
    if (!response.ok) return;
    const attendances = await response.json();

    // FIX : Construire un Set de noms normalisés avec toutes les variantes
    const nomsSignes = new Set();
    attendances.forEach(att => {
      const p = normalise(att.apprenantPrenom);
      const n = normalise(att.apprenantNom);
      nomsSignes.add(`${p} ${n}`);
      nomsSignes.add(`${n} ${p}`);
      nomsSignes.add(normalise(`${att.apprenantNom} ${att.apprenantPrenom}`));
      nomsSignes.add(normalise(`${att.apprenantPrenom} ${att.apprenantNom}`));
    });

    const presents = attendances;

    // FIX : Comparaison améliorée avec correspondance partielle
    const absents = listeApprenants.filter(nom => {
      const nomNorm = normalise(nom);
      if (nomsSignes.has(nomNorm)) return false;
      for (const signe of nomsSignes) {
        if (signe.length > 3 && (nomNorm.includes(signe) || signe.includes(nomNorm))) {
          return false;
        }
      }
      return true;
    });

    const total = presents.length + absents.length;
    const pct = total > 0 ? Math.round((presents.length / total) * 100) : 0;

    document.getElementById('count-present').textContent = presents.length;
    document.getElementById('count-absent').textContent = absents.length;
    document.getElementById('progress-bar').style.width = pct + '%';
    document.getElementById('progress-label').textContent = pct + '% de présence';

    const listEl = document.getElementById('presence-list');
    let html = '';

    presents.forEach(att => {
      const nomAff = `${att.apprenantPrenom} ${att.apprenantNom}`;
      const heure = new Date(att.timestamp).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
      const estMoi = monNomComplet && normalise(monNomComplet) === normalise(nomAff);
      const classMoi = estMoi ? ' moi' : '';
      html += `
        <div class="presence-item present${classMoi}">
          <span>✅ ${nomAff}${estMoi ? ' (vous)' : ''}</span>
          <span class="time">⏰ ${heure}</span>
        </div>
      `;
    });

    absents.forEach(nom => {
      const estMoi = monNomComplet && normalise(monNomComplet) === normalise(nom);
      const classMoi = estMoi ? ' moi' : '';
      html += `
        <div class="presence-item absent${classMoi}">
          <span>⏳ ${nom}${estMoi ? ' (vous)' : ''}</span>
          <span class="status">En attente</span>
        </div>
      `;
    });

    if (!html) html = '<div class="empty-list">⏳ En attente de signatures...</div>';
    listEl.innerHTML = html;

    // FIX : Vérifier si MOI j'ai déjà signé (cross-session)
    if (monNomComplet) {
      const monNomNorm = normalise(monNomComplet);
      let dejaSigne = nomsSignes.has(monNomNorm);
      if (!dejaSigne) {
        for (const signe of nomsSignes) {
          if (signe.length > 3 && (monNomNorm.includes(signe) || signe.includes(monNomNorm))) {
            dejaSigne = true;
            break;
          }
        }
      }

      if (dejaSigne) {
        document.getElementById('form-card').style.display = 'none';
        document.getElementById('signature-card').style.display = 'none';
        if (!successMessage.classList.contains('hidden')) return;
        document.getElementById('success-nom').textContent = monNomComplet;
        successMessage.classList.remove('hidden');
        clearInterval(intervalId);
      }
    }
  } catch(e) {
    console.warn('Erreur rafraîchissement présences:', e);
  }
}

// ── Validation session ─────────────────────────────────────────────────────────
function validateSession() {
  const now = new Date();
  const sessionDateObj = new Date(sessionData.date);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sessDate = new Date(sessionDateObj.getFullYear(), sessionDateObj.getMonth(), sessionDateObj.getDate());

  if (sessDate.getTime() !== today.getTime()) {
    showError('Ce QR code n\'est valide que pour le ' + sessionDateObj.toLocaleDateString('fr-FR'));
    disableForm();
    return false;
  }

  const currentSlot = getCurrentSlot();
  if (!currentSlot || currentSlot.id !== sessionData.creneau) {
    const message = sessionData.creneau === 'matin' ? 'Le pointage du matin est terminé.' : 'Le pointage de l\'après-midi est terminé.';
    showError(message);
    disableForm();
    return false;
  }
  return true;
}

function getCurrentSlot() {
  const now = new Date();
  const day = now.getDay();
  const time = now.getHours() * 60 + now.getMinutes();
  if (day === 0 || day === 6) return null;
  if (time >= 420 && time <= 750) return { id: 'matin', label: 'Matin (8h30 - 12h00)' };
  if (time >= 720 && time <= 1080) return { id: 'apres-midi', label: 'Après-midi (13h00 - 16h30)' };
  return null;
}

clearBtn.addEventListener('click', () => signaturePad.clear());

// ── Soumettre la signature ─────────────────────────────────────────────────────
submitBtn.addEventListener('click', async () => {
  const nomVal = document.getElementById('apprenant-nom').value.trim();
  const prenomVal = document.getElementById('apprenant-prenom').value.trim();

  if (!nomVal || !prenomVal) {
    alert('Veuillez sélectionner ou saisir votre nom et prénom');
    return;
  }
  if (signaturePad.isEmpty()) {
    alert('Veuillez signer dans le cadre prévu');
    return;
  }
  if (!validateSession()) return;

  submitBtn.disabled = true;
  submitBtn.innerHTML = 'Envoi en cours...';

  try {
    const position = await getLocation();
    const signatureB64 = exportSignatureCompressed(canvas);
    
    const signatureData = {
      ...sessionData,
      apprenantNom: nomVal.toUpperCase(),
      apprenantPrenom: prenomVal,
      signature: signatureB64,
      timestamp: new Date().toISOString(),
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      userAgent: navigator.userAgent
    };

    const response = await postWithRetry(`${API_URL}/attendance/sign`, signatureData, 2);
    if (!response.ok) {
      let errJson = null;
      try { errJson = await response.json(); } catch (_) {}
      let msg = errJson?.message || (response.status === 413 ? 'Signature trop lourde.' : 'Erreur serveur.');
      throw new Error(msg);
    }

    const result = await response.json();

    // FIX : Informer si doublon détecté (pas une erreur, mais un avertissement)
    if (result.duplicate) {
      console.log('ℹ️ Signature déjà enregistrée — pas de doublon créé');
    }

    monNomComplet = prenomVal + ' ' + nomVal.toUpperCase();
    document.getElementById('success-nom').textContent = monNomComplet;
    showSuccess();
    rafraichirPresences();
    clearInterval(intervalId);
  } catch (error) {
    showError(error.message || 'Erreur lors de l\'enregistrement.');
    submitBtn.disabled = false;
    submitBtn.innerHTML = ' ✅ Valider ma Présence';
  }
});

function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ coords: { latitude: null, longitude: null } });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      () => resolve({ coords: { latitude: null, longitude: null } }),
      { timeout: 5000, enableHighAccuracy: true }
    );
  });
}

function showSuccess() {
  document.getElementById('form-card').style.display = 'none';
  document.getElementById('signature-card').style.display = 'none';
  successMessage.classList.remove('hidden');
  successMessage.scrollIntoView({ behavior: 'smooth' });
}

function showError(message) {
  errorText.textContent = message;
  errorMessage.classList.remove('hidden');
  errorMessage.scrollIntoView({ behavior: 'smooth' });
}

function disableForm() {
  document.getElementById('apprenant-nom').disabled = true;
  document.getElementById('apprenant-prenom').disabled = true;
  const selApp = document.getElementById('apprenant-select');
  if (selApp) selApp.disabled = true;
  clearBtn.disabled = true;
  submitBtn.disabled = true;
  signaturePad.off();
}

const express = require('express');
const router = express.Router();
const { appendToSheet, getTodayAttendances, getAttendanceByFormation } = require('../config/sheets');

// ── Utilitaires retry ──────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function isRetryable(err) {
  const msg = (err && err.message) ? err.message : String(err);
  return /backendError|503|500|UNAVAILABLE|ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket hang up/i.test(msg);
}

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

// ── POST /api/attendance/sign ─────────────────────────────────────────────────
router.post('/sign', async (req, res) => {
  try {
    const data = req.body;

    if (!data.apprenantNom || !data.apprenantPrenom || !data.signature) {
      return res.status(400).json({ message: 'Donnees incompletes', code: 'BAD_REQUEST' });
    }

    const result = await appendWithRetry(data, 3);

    // FIX : Informer le client si c'est un doublon (pas d'erreur, juste un flag)
    if (result && result.duplicate) {
      return res.json({
        success: true,
        duplicate: true,
        message: 'Signature déjà enregistrée pour ce créneau'
      });
    }

    res.json({ success: true, duplicate: false, message: 'Signature enregistree' });

  } catch (error) {
    console.error('Erreur /attendance/sign:', error);
    res.status(500).json({
      message: 'Erreur serveur (ecriture feuille)',
      code: 'SHEETS_APPEND_FAILED'
    });
  }
});

// ── GET /api/attendance/today?date=YYYY-MM-DD&sessionCode=XXXXXX ──────────────
// Mode legacy : filtre par sessionCode
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

// ══════════════════════════════════════════════════════════════════════════════
// FIX PRINCIPAL : Nouvel endpoint cross-session
// GET /api/attendance/by-formation?date=YYYY-MM-DD&formation=TSMEL&creneau=matin
// Agrège les signatures de TOUTES les sessions d'une même formation/date
// ══════════════════════════════════════════════════════════════════════════════
router.get('/by-formation', async (req, res) => {
  try {
    const { date, formation, creneau } = req.query;

    if (!date || !formation) {
      return res.status(400).json({
        message: 'Paramètres date et formation requis',
        code: 'BAD_REQUEST'
      });
    }

    const attendances = await getAttendanceByFormation(date, formation, creneau || null);
    res.json(attendances);

  } catch (error) {
    console.error('Erreur /attendance/by-formation:', error);
    res.status(500).json({ message: 'Erreur serveur', code: 'FORMATION_FETCH_FAILED' });
  }
});

module.exports = router;

const API_URL = 'https://suivi-presence-success.vercel.app/api';

const formateurNom    = document.getElementById('formateur-nom');
const formateurPrenom = document.getElementById('formateur-prenom');
const formation       = document.getElementById('formation');
const currentDateEl   = document.getElementById('current-date');
const currentSlotEl   = document.getElementById('current-slot');
const generateQRBtn   = document.getElementById('generate-qr');
const qrSection       = document.getElementById('qr-section');
const qrcodeContainer = document.getElementById('qrcode-container');
const qrValidity      = document.getElementById('qr-validity');
const downloadQRBtn   = document.getElementById('download-qr');
const attendanceList  = document.getElementById('attendance-list');

let sessionData       = null;
let qrCodeInstance    = null;
let activeSessionCode = null;
let listeApprenants   = [];
let currentJour       = null;

// ══════════════════════════════════════════════════════════════════════════════
// FIX : Variables pour stocker la formation et le jour de la session active
// Utilisées pour charger les présences cross-sessions
// ══════════════════════════════════════════════════════════════════════════════
let activeFormation   = null;
let activeDate        = null;

window.getActiveSessionCode = () => activeSessionCode;

document.addEventListener('DOMContentLoaded', () => {
    console.log('Application Formateur démarrée');
    updateDateTime();
    setInterval(updateDateTime, 60000);

    // FIX : Le refresh utilise maintenant loadAllAttendance (cross-session)
    setInterval(() => {
        if (activeFormation && activeDate) {
            loadAllAttendance();
        }
    }, 10000);
});

function updateDateTime() {
    const now     = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    if (currentDateEl) currentDateEl.textContent = now.toLocaleDateString('fr-FR', options);

    const isAFC = currentJour === 'AFC';
    const slot  = getCurrentSlot(isAFC) || getCurrentSlot(!isAFC);

    if (currentSlotEl) {
        if (slot) {
            currentSlotEl.textContent = slot.label;
            currentSlotEl.style.color = 'var(--sf-success)';
        } else {
            currentSlotEl.textContent = 'Hors horaires de pointage';
            currentSlotEl.style.color = 'var(--sf-error)';
        }
    }
}

function getCurrentSlot(isAFC = false) {
    const now      = new Date(new Date().toLocaleString('en-US', { timeZone: 'Indian/Reunion' }));
    const day      = now.getDay();
    const time     = now.getHours() * 60 + now.getMinutes();

    if (day === 0 || day === 6) return null;

    if (isAFC) {
        if (time >= 480 && time <= 720)  return { id: 'matin',      label: 'Matin (8h00 - 12h00)' };
        if (time >= 780 && time <= 1005) return { id: 'apres-midi', label: 'Après-midi (13h00 - 16h30)' };
    } else {
        if (time >= 510 && time <= 735)  return { id: 'matin',      label: 'Matin (8h30 - 12h15)' };
        if (time >= 780 && time <= 1005) return { id: 'apres-midi', label: 'Après-midi (13h00 - 16h45)' };
    }
    return null;
}

function setListeApprenants(liste) { listeApprenants = liste || []; }
function setJourActuel(jour) {
    currentJour = jour || null;
    updateDateTime();
}

// ── Normalisation robuste pour comparaison de noms ────────────────────────────
// FIX : Même logique que le backend — insensible accents, casse, tirets
function normalise(str) {
    return (str || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

generateQRBtn.addEventListener('click', async () => {
    const manualFormation = document.getElementById('manual-formation').value.trim();
    const manualFormateur = document.getElementById('manual-formateur-nom').value.trim();

    let finalFormation = formation.value;
    if (document.getElementById('session-select').value === 'AUTRE') {
        if (!manualFormation) { alert('Veuillez saisir le nom de la formation'); return; }
        finalFormation = manualFormation;
    }

    let finalFormNom    = formateurNom.value;
    let finalFormPrenom = formateurPrenom.value;

    if (document.getElementById('formateur-select').value === 'AUTRE') {
        if (!manualFormateur) { alert('Veuillez saisir votre nom'); return; }
        const parts     = manualFormateur.split(' ');
        finalFormNom    = parts[0] || '';
        finalFormPrenom = parts.slice(1).join(' ') || parts[0];
    }

    if (!finalFormNom || !finalFormPrenom || !finalFormation) {
        alert('Veuillez remplir tous les champs obligatoires');
        return;
    }

    const jourSession = currentJour || 'AFC';
    const isAFC = jourSession === 'AFC' || finalFormation.toUpperCase().trim().startsWith('AFC');
    const slot  = getCurrentSlot(isAFC);

    if (!slot) {
        alert("Le pointage n'est disponible qu'aux horaires de formation");
        return;
    }

    const sigMatin     = window.getSignatureFormateur ? window.getSignatureFormateur('matin')      : null;
    const sigApresMidi = window.getSignatureFormateur ? window.getSignatureFormateur('apres-midi')  : null;

    const todayDate = new Date().toISOString().split('T')[0];

    sessionData = {
        formateurNom:       finalFormNom.toUpperCase(),
        formateurPrenom:    finalFormPrenom,
        formation:          finalFormation,
        jour:               jourSession,
        date:               todayDate,
        creneau:            slot.id,
        creneauLabel:       slot.label,
        signatureMatin:     sigMatin      || '',
        signatureApresMidi: sigApresMidi  || ''
    };

    try {
        generateQRBtn.disabled  = true;
        generateQRBtn.innerHTML = 'Génération...';

        const response = await fetch(`${API_URL}/sessions`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(sessionData)
        });
        if (!response.ok) throw new Error('Erreur lors de la création de la session');

        const { sessionCode } = await response.json();
        activeSessionCode = sessionCode;
        window.getActiveSessionCode = () => activeSessionCode;

        // FIX : Stocker formation et date pour le chargement cross-session
        activeFormation = finalFormation;
        activeDate      = todayDate;

        const baseURL      = window.location.origin + window.location.pathname.replace('index.html', '');
        const signatureURL = `${baseURL}signature.html?code=${sessionCode}`;

        displayQRCode(signatureURL);

        // FIX : Charger les présences cross-sessions immédiatement
        loadAllAttendance();

        generateQRBtn.innerHTML = 'QR Code Généré ✅';
        setTimeout(() => {
            generateQRBtn.innerHTML = '🔗 Mettre à jour le QR Code';
            generateQRBtn.disabled  = false;
        }, 3000);

    } catch (error) {
        console.error('Erreur:', error);
        alert(`Erreur: ${error.message}`);
        generateQRBtn.disabled  = false;
        generateQRBtn.innerHTML = '🔗 Générer QR Code';
    }
});

async function patchSignatureFormateur(creneau, signatureData) {
    if (!activeSessionCode || !signatureData) return;
    try {
        const resp = await fetch(`${API_URL}/sessions/${activeSessionCode}/signature`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ creneau, signature: signatureData })
        });
        if (resp.ok) {
            console.log(`✅ Signature ${creneau} envoyée vers Sheets`);
        } else {
            console.warn(`⚠️ Erreur PATCH signature ${creneau}:`, resp.status);
        }
    } catch (err) {
        console.warn('PATCH signature échoué (hors-ligne ?):', err);
    }
}
window.patchSignatureFormateur = patchSignatureFormateur;

function displayQRCode(url) {
    qrcodeContainer.innerHTML = '';
    const size = Math.min(window.innerWidth - 80, 300);

    qrCodeInstance = new QRCode(qrcodeContainer, {
        text:         url,
        width:        size,
        height:       size,
        colorDark:    '#000000',
        colorLight:   '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });

    qrValidity.innerHTML = `
        <strong>${sessionData.date}</strong><br><br>
        <strong>${sessionData.creneauLabel}</strong><br><br>
        <strong>${sessionData.formation}${sessionData.jour ? ' (' + sessionData.jour + ')' : ''}</strong><br><br>
        <strong>${sessionData.formateurPrenom} ${sessionData.formateurNom}</strong>
    `;

    qrSection.classList.remove('hidden');
    document.getElementById('attendance-section').classList.remove('hidden');
    document.getElementById('signalement-section').style.display = 'block';
    qrSection.scrollIntoView({ behavior: 'smooth' });
}

downloadQRBtn.addEventListener('click', () => {
    const canvas = qrcodeContainer.querySelector('canvas');
    if (canvas) {
        const link    = document.createElement('a');
        link.download = `QR-Success-${sessionData.formation}-${sessionData.date}.png`;
        link.href     = canvas.toDataURL('image/png');
        link.click();
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// FIX PRINCIPAL : Chargement des présences CROSS-SESSIONS
// Utilise /api/attendance/by-formation au lieu de /api/attendance/today
// Agrège automatiquement toutes les sessions de la même formation/date
// ══════════════════════════════════════════════════════════════════════════════
async function loadAllAttendance() {
    if (!activeFormation || !activeDate) return;

    try {
        const url = `${API_URL}/attendance/by-formation?date=${encodeURIComponent(activeDate)}&formation=${encodeURIComponent(activeFormation)}`;
        const response = await fetch(url);
        if (!response.ok) return;

        const attendances = await response.json();

        // FIX : Construire un Set de noms normalisés pour comparaison fiable
        const nomsSignes = new Set();
        attendances.forEach(att => {
            // Ajouter toutes les variantes de normalisation
            const p = normalise(att.apprenantPrenom);
            const n = normalise(att.apprenantNom);
            nomsSignes.add(`${p} ${n}`);
            nomsSignes.add(`${n} ${p}`);
            // Ajouter aussi le nom complet brut normalisé
            nomsSignes.add(normalise(`${att.apprenantNom} ${att.apprenantPrenom}`));
            nomsSignes.add(normalise(`${att.apprenantPrenom} ${att.apprenantNom}`));
        });

        // FIX : Comparaison améliorée — cherche une correspondance partielle
        // pour gérer les noms composés (CRESCENCE Thomas Jean Christophe)
        const absents = listeApprenants.filter(nom => {
            const nomNorm = normalise(nom);
            if (nomsSignes.has(nomNorm)) return false;

            // Vérification partielle : le nom de la liste contient-il un nom signé ?
            for (const signe of nomsSignes) {
                if (signe.length > 3 && (nomNorm.includes(signe) || signe.includes(nomNorm))) {
                    return false;
                }
            }
            return true;
        });

        renderAttendance(attendances, absents);

    } catch (error) {
        console.error('Erreur chargement présences cross-session:', error);
    }
}

// FIX : Garder aussi l'ancienne fonction pour compatibilité (non utilisée en refresh)
async function loadSessionAttendance(sessionCode) {
    // Redirige vers la nouvelle fonction cross-session
    return loadAllAttendance();
}

function renderAttendance(presents, absents) {
    const total = presents.length + absents.length;
    const pct   = total > 0 ? Math.round((presents.length / total) * 100) : 0;

    let html = `
        <div class="attendance-header">
            <div class="attendance-stats">
                <span class="stat-present">Présents : <strong>${presents.length}</strong></span>
                <span class="stat-absent">Absents : <strong>${absents.length}</strong></span>
                <span class="stat-total">Total : <strong>${total}</strong></span>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar" style="width:${pct}%"></div>
            </div>
            <div class="progress-label">${pct}% de présence</div>
        </div>`;

    if (presents.length > 0) {
        html += `<div class="attendance-group"><div class="group-title present-title">Présents (${presents.length})</div>`;
        presents.forEach(att => {
            const heure = new Date(att.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            html += `<div class="attendance-item present">
                        <span class="att-nom">${att.apprenantPrenom} ${att.apprenantNom}</span>
                        <span class="att-heure">${heure}</span>
                     </div>`;
        });
        html += '</div>';
    }

    if (absents.length > 0) {
        html += `<div class="attendance-group"><div class="group-title absent-title">Pas encore signé (${absents.length})</div>`;
        absents.forEach(nom => {
            html += `<div class="attendance-item absent">
                        <span class="att-nom">${nom}</span>
                        <span class="att-statut">En attente...</span>
                     </div>`;
        });
        html += '</div>';
    }

    if (presents.length === 0 && absents.length === 0) {
        html = '<div class="attendance-item">En attente de signatures...</div>';
    }

    attendanceList.innerHTML = html;
}

function ouvrirModalSignalement() {
    const modal = document.getElementById('modal-signalement');
    modal.style.display = 'flex';

    const selectApprenant = document.getElementById('signal-apprenant');
    selectApprenant.innerHTML = '<option value="">-- Sélectionner (optionnel) --</option>';
    listeApprenants.forEach(nom => {
        const opt = document.createElement('option');
        opt.value = nom; opt.textContent = nom;
        selectApprenant.appendChild(opt);
    });

    document.getElementById('signal-type').onchange = function () {
        const types = ['retard', 'absence'];
        document.getElementById('signal-apprenant-group').style.display =
            types.includes(this.value) ? 'block' : 'none';
    };
}

function fermerModalSignalement() {
    document.getElementById('modal-signalement').style.display = 'none';
    document.getElementById('signal-type').value = '';
    document.getElementById('signal-message').value = '';
    document.getElementById('signal-apprenant').value = '';
    document.getElementById('signal-apprenant-group').style.display = 'none';
}

function envoyerSignalement() {
    const type      = document.getElementById('signal-type').value;
    const message   = document.getElementById('signal-message').value.trim();
    const apprenant = document.getElementById('signal-apprenant').value;

    if (!type)    { alert('Veuillez sélectionner un type de signalement.'); return; }
    if (!message) { alert('Veuillez rédiger un message ou une observation.'); return; }

    const formationVal = sessionData ? sessionData.formation                                        : 'Non renseignée';
    const formateurVal = sessionData ? `${sessionData.formateurPrenom} ${sessionData.formateurNom}` : 'Non renseigné';
    const dateVal      = sessionData ? sessionData.date                                             : new Date().toISOString().split('T')[0];
    const creneauVal   = sessionData ? sessionData.creneauLabel                                     : 'Non renseigné';

    const typesLabels = {
        retard:           '⏰ Retard apprenant',
        retard_formateur: '⏰ Retard formateur',
        absence:          '🚫 Absence non justifiée',
        observation:      '💬 Observation pédagogique',
        incident:         '⚠️ Incident'
    };
    const typeLabel = typesLabels[type] || type;

    const sujet = encodeURIComponent(`[Signalement] ${typeLabel} – ${formationVal} – ${dateVal}`);
    const corps = encodeURIComponent(
`Bonjour,

Type de signalement : ${typeLabel}
Date : ${dateVal}
Créneau : ${creneauVal}
Formation : ${formationVal}
Formateur : ${formateurVal}${apprenant ? `\nApprenant concerné : ${apprenant}` : ''}

Observation :
${message}

---
Message envoyé depuis l'interface formateur Success Formation`
    );

    const mailLink = document.createElement('a');
    mailLink.href = `mailto:a.successformation@gmail.com?subject=${sujet}&body=${corps}`;
    mailLink.target = '_blank';
    mailLink.rel = 'noopener';
    document.body.appendChild(mailLink);
    mailLink.click();
    document.body.removeChild(mailLink);

    fermerModalSignalement();
}

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

// ── Normalisation pour comparaisons de noms ───────────────────────────────────
function norm(str) {
    return (str || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[-_]/g, ' ')
        .trim();
}

// ── Enregistrer une signature d'apprenant ─────────────────────────────────────
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
            const rowDate       = row[1] || '';
            const rowCreneau    = row[2] || '';
            const rowFormation  = row[4] || '';
            const rowNom        = row[7] || '';
            const rowPrenom     = row[8] || '';

            return rowDate === data.date
                && rowCreneau === data.creneau
                && norm(rowFormation) === norm(data.formation)
                && norm(rowNom)    === norm(data.apprenantNom)
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
        data.sessionCode || ''   // Colonne O
    ];

    await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Signatures!A:O',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',   // FIX : forcer l'insertion de nouvelles lignes
        resource: { values: [row] },
    });

    console.log(`✅ Signature enregistrée: ${data.apprenantPrenom} ${data.apprenantNom} [session: ${data.sessionCode}]`);
    return { duplicate: false };
}

// ── Récupérer les présences filtrées par sessionCode (ancien mode) ────────────
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
            timestamp:      row[0],
            date:           row[1],
            creneau:        row[2],
            creneauLabel:   row[3],
            formation:      row[4],
            formateurNom:   row[5],
            formateurPrenom:row[6],
            apprenantNom:   row[7],
            apprenantPrenom:row[8],
            sessionCode:    row[14] || ''
        }));
}

// ══════════════════════════════════════════════════════════════════════════════
// FIX PRINCIPAL : Nouvelle fonction — présences par formation + date + créneau
// Agrège les signatures de TOUTES les sessions d'une même formation/date
// Déduplique par nom normalisé pour éviter les doublons visuels
// ══════════════════════════════════════════════════════════════════════════════
async function getAttendanceByFormation(date, formation, creneau) {
    const sheets = await getGoogleSheetsClient();

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Signatures!A:O',
    });
    const rows = response.data.values || [];

    const seen = new Set();    // Pour dédupliquer par nom normalisé + créneau
    const results = [];

    rows.slice(1).forEach(row => {
        const rowDate      = row[1] || '';
        const rowCreneau   = row[2] || '';
        const rowFormation = row[4] || '';
        const rowNom       = row[7] || '';
        const rowPrenom    = row[8] || '';

        if (rowDate !== date) return;
        if (norm(rowFormation) !== norm(formation)) return;
        if (creneau && rowCreneau !== creneau) return;

        // Clé de déduplication : nom normalisé + créneau
        const dedupeKey = norm(rowNom) + '|' + norm(rowPrenom) + '|' + rowCreneau;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);

        results.push({
            timestamp:       row[0],
            date:            row[1],
            creneau:         row[2],
            creneauLabel:    row[3],
            formation:       row[4],
            formateurNom:    row[5],
            formateurPrenom: row[6],
            apprenantNom:    row[7],
            apprenantPrenom: row[8],
            sessionCode:     row[14] || ''
        });
    });

    return results;
}

// ── Sauvegarder une session ──────────────────────────────────────────────────
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
        sessionData.signatureMatin     || '',
        sessionData.signatureApresMidi || ''
    ];

    await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Sessions!A:K',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',   // FIX : forcer INSERT au lieu de OVERWRITE
        resource: { values: [row] },
    });

    console.log(`✅ Session sauvegardée: ${sessionData.sessionCode}`);
}

// ── Récupérer une session par son code ───────────────────────────────────────
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
            sessionCode:         sessionRow[0],
            formateurNom:        sessionRow[1],
            formateurPrenom:     sessionRow[2],
            formation:           sessionRow[3],
            date:                sessionRow[4],
            creneau:             sessionRow[5],
            creneauLabel:        sessionRow[6],
            createdAt:           sessionRow[7],
            jour:                sessionRow[8] || null,
            signatureMatin:      sessionRow[9]  || null,
            signatureApresMidi:  sessionRow[10] || null
        };

    } catch (error) {
        console.error('❌ Erreur recherche session:', error.message);
        throw error;
    }
}

// ── Mettre à jour la signature formateur d'une session existante ─────────────
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

// ── Récapitulatif mensuel d'un apprenant ─────────────────────────────────────
async function getMonthlyAttendance(nomComplet, month, year) {
    const sheets = await getGoogleSheetsClient();

    const ncNorm = norm(nomComplet);

    function isInMonth(dateStr) {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        return (d.getMonth() + 1) === parseInt(month) &&
               d.getFullYear()    === parseInt(year);
    }

    // ── 1. Lire toutes les signatures ─────────────────────────────────────────
    const sigResp = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Signatures!A:O',
    });
    const sigRows = (sigResp.data.values || []).slice(1);

    const mySignatures = sigRows.filter(row => {
        const sigNom    = row[7] || '';
        const sigPrenom = row[8] || '';
        const sigFull1  = norm(`${sigNom} ${sigPrenom}`);
        const sigFull2  = norm(`${sigPrenom} ${sigNom}`);
        const dateRow   = row[1] || '';

        const nameMatch =
            ncNorm === sigFull1 ||
            ncNorm === sigFull2 ||
            sigFull1.includes(ncNorm) ||
            sigFull2.includes(ncNorm) ||
            ncNorm.includes(norm(sigNom));

        return nameMatch && isInMonth(dateRow);
    });

    // ── 2. Lire toutes les sessions pour récupérer les signatures formateur ───
    const sessResp = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Sessions!A:K',
    });
    const sessRows = (sessResp.data.values || []).slice(1);

    const sessionsMap = {};
    sessRows.forEach(row => {
        if (row[0]) {
            sessionsMap[row[0]] = {
                sessionCode:        row[0],
                formateurNom:       row[1],
                formateurPrenom:    row[2],
                formation:          row[3],
                date:               row[4],
                creneau:            row[5],
                jour:               row[8] || '',
                signatureMatin:     row[9]  || null,
                signatureApresMidi: row[10] || null
            };
        }
    });

    // ── 3. Construire la map journalière ─────────────────────────────────────
    const dailyMap = {};

    mySignatures.forEach(sig => {
        const date        = sig[1] || '';
        const creneau     = sig[2] || '';
        const timestamp   = sig[0] || '';
        const sessionCode = sig[14] || '';
        const sess        = sessionsMap[sessionCode] || {};

        const dateKey = date.includes('T') ? date.split('T')[0] : date;

        if (!dailyMap[dateKey]) {
            dailyMap[dateKey] = { date: dateKey, matin: null, apresMidi: null };
        }

        const sigData = {
            timestamp,
            formation:          sig[4] || '',
            formateurNom:       sig[5] || sess.formateurNom || '',
            formateurPrenom:    sig[6] || sess.formateurPrenom || '',
            signatureApprenant: sig[9] || null,
            sessionCode,
            signatureFormateur: creneau === 'matin'
                ? (sess.signatureMatin     || null)
                : (sess.signatureApresMidi || null),
            signatureFormateurMatin:     sess.signatureMatin     || null,
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
        mois:  parseInt(month),
        annee: parseInt(year),
        attendances
    };
}

module.exports = {
    appendToSheet,
    getTodayAttendances,
    getAttendanceByFormation,    // NOUVEAU
    saveSessions,
    getSessionByCode,
    updateSessionSignature,
    getMonthlyAttendance
};
