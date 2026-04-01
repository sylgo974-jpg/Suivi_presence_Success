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

// ── Normalisation robuste (même logique que backend et formateur.js) ────────────
function normalise(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Resize canvas ───────────────────────────────────────────────────────────────
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

// ── Retry fetch ─────────────────────────────────────────────────────────────────
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

// ── Export signature JPEG compressé ─────────────────────────────────────────────
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

// ── Chargement des données session ────────────────────────────────────────────────
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

// ── Charger la liste des apprenants attendus depuis l'API ─────────────────────────
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
      sel.innerHTML = '';
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

// ═════════════════════════════════════════════════════════════════════════════════
// FIX PRINCIPAL : Rafraîchir les présences via /by-formation (cross-session)
// Au lieu de filtrer par sessionCode uniquement, on filtre par formation+date
// Cela permet de voir TOUTES les signatures, même celles d'autres sessions
// ═════════════════════════════════════════════════════════════════════════════════
async function rafraichirPresences() {
  if (!sessionData || !sessionData.formation || !sessionData.date) return;
  try {
    const dateToday = sessionData.date.includes('T') ? sessionData.date.split('T')[0] : sessionData.date;
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
      html += `<div class="presence-item present${classMoi}"><span class="presence-name">${nomAff}${estMoi ? ' (vous)' : ''}</span><span class="presence-time">${heure}</span></div>`;
    });
    absents.forEach(nom => {
      html += `<div class="presence-item absent"><span class="presence-name">${nom}</span><span class="presence-status">En attente</span></div>`;
    });
    if (listEl) listEl.innerHTML = html || '<div class="empty-list">Aucune présence pour l\'instant</div>';
  } catch(e) {
    console.warn('Erreur rafraîchirPresences:', e);
  }
}

// ── Validation de la session ──────────────────────────────────────────────────────
function validateSession() {
  if (!sessionData.formation || !sessionData.date || !sessionData.creneau) {
    showError('Les informations de session sont incomplètes.');
    disableForm();
    return false;
  }
  return true;
}

// ── Gestion du formulaire de signature ───────────────────────────────────────────
if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    signaturePad.clear();
  });
}

if (submitBtn) {
  submitBtn.addEventListener('click', async () => {
    const nomEl = document.getElementById('apprenant-nom');
    const prenomEl = document.getElementById('apprenant-prenom');
    const nom = (nomEl ? nomEl.value : '').trim().toUpperCase();
    const prenom = (prenomEl ? prenomEl.value : '').trim();
    if (!nom || !prenom) {
      showError('Veuillez renseigner votre nom et prénom.');
      return;
    }
    if (signaturePad.isEmpty()) {
      showError('Veuillez signer avant de valider.');
      return;
    }
    const signatureData = exportSignatureCompressed(canvas);
    const payload = {
      ...sessionData,
      apprenantNom: nom,
      apprenantPrenom: prenom,
      signature: signatureData,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    };
    submitBtn.disabled = true;
    submitBtn.textContent = 'Envoi en cours...';
    try {
      const res = await postWithRetry(`${API_URL}/attendance/sign`, payload);
      const data = await res.json();
      if (res.ok) {
        if (data.duplicate) {
          showSuccess('Vous avez déjà signé pour ce créneau.');
        } else {
          showSuccess('Signature enregistrée avec succès !');
        }
        if (intervalId) clearInterval(intervalId);
        rafraichirPresences();
        disableForm();
      } else {
        showError(data.message || 'Erreur lors de l\'envoi.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Valider ma signature';
      }
    } catch (err) {
      showError('Erreur réseau. Vérifiez votre connexion.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Valider ma signature';
    }
  });
}

function showSuccess(msg) {
  if (successMessage) {
    successMessage.textContent = msg;
    successMessage.style.display = 'block';
  }
  if (errorMessage) errorMessage.style.display = 'none';
}

function showError(msg) {
  if (errorText) errorText.textContent = msg;
  if (errorMessage) errorMessage.style.display = 'block';
  if (successMessage) successMessage.style.display = 'none';
}

function disableForm() {
  if (submitBtn) submitBtn.disabled = true;
  if (clearBtn) clearBtn.disabled = true;
  if (signaturePad) signaturePad.off();
}
