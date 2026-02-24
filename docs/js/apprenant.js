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
  penColor: 'rgb(0, 0, 139)',
  minWidth: 2.5,
  maxWidth: 4.5
});
let sessionData = {};
let listeApprenants = []; // Liste complète des apprenants attendus
let monNomComplet = ''; // Nom de l'apprenant connecté (après sélection)
let intervalId = null;

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

// ── Normalisation pour comparaison noms ───────────────────────────────────────
function normalise(str) {
  return str ? str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() : '';
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
  // Afficher infos session
  sessionFormateur.textContent = sessionData.formateurPrenom + ' ' + sessionData.formateurNom;
  sessionFormation.textContent = sessionData.formation;
  sessionDate.textContent = new Date(sessionData.date).toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  sessionCreneau.textContent = sessionData.creneauLabel;
  if (!validateSession()) return;
  // Charger la liste des apprenants attendus pour cette formation
  await chargerApprenants();
  // Démarrer la mise à jour automatique de la liste
  intervalId = setInterval(rafraichirPresences, 8000);
  rafraichirPresences(); // premier chargement immédiat
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
      
      // Ajouter l'option "Autre"
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

// ── Rafraîchir la liste présents/absents ──────────────────────────────────────
async function rafraichirPresences() {
  if (!sessionData || !sessionData.sessionCode) return;
  try {
    const today = new Date().toISOString().split('T')[0];
    const response = await fetch(`${API_URL}/attendance/today?date=${today}&sessionCode=${sessionData.sessionCode}`);
    if (!response.ok) return;
    const attendances = await response.json();
    
    const nomsSignes = new Set(attendances.map(att => normalise(`${att.apprenantPrenom} ${att.apprenantNom}`)));
    const presents = attendances;
    const absents = listeApprenants.filter(nom => !nomsSignes.has(normalise(nom)));
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

    if (monNomComplet && nomsSignes.has(normalise(monNomComplet))) {
      document.getElementById('form-card').style.display = 'none';
      document.getElementById('signature-card').style.display = 'none';
      if (!document.getElementById('success-message').classList.contains('hidden')) return;
      document.getElementById('success-nom').textContent = monNomComplet;
      successMessage.classList.remove('hidden');
      clearInterval(intervalId);
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
  if (time >= 510 && time <= 720) return { id: 'matin', label: 'Matin (8h30 - 12h00)' };
  if (time >= 780 && time <= 990) return { id: 'apres-midi', label: 'Après-midi (13h00 - 16h30)' };
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
