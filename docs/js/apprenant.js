const API_URL = 'https://suivi-presence-success.vercel.app/api';

const sessionFormateur = document.getElementById('session-formateur');
const sessionFormation = document.getElementById('session-formation');
const sessionDate      = document.getElementById('session-date');
const sessionCreneau   = document.getElementById('session-creneau');
const apprenantNom     = document.getElementById('apprenant-nom');
const apprenantPrenom  = document.getElementById('apprenant-prenom');
const clearBtn         = document.getElementById('clear-signature');
const submitBtn        = document.getElementById('submit-signature');
const successMessage   = document.getElementById('success-message');
const errorMessage     = document.getElementById('error-message');
const errorText        = document.getElementById('error-text');

const canvas       = document.getElementById('signature-pad');
const signaturePad = new SignaturePad(canvas, {
  backgroundColor: 'rgb(255, 255, 255)',
  penColor:        'rgb(0, 0, 139)',
  minWidth:        2.5,
  maxWidth:        4.5
});

// ── Resize securise : sauvegarde + restauration ───────────────────────────────
function resizeCanvas() {
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const data  = signaturePad.toData();
  canvas.width  = canvas.offsetWidth  * ratio;
  canvas.height = canvas.offsetHeight * ratio;
  canvas.getContext('2d').scale(ratio, ratio);
  signaturePad.clear();
  if (data && data.length > 0) {
    signaturePad.fromData(data);
  }
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

// ── Retry fetch : 2 tentatives sur 500/503 ou erreur reseau ──────────────────
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
      console.warn('Reponse ' + res.status + ' - retry ' + (i + 1) + '/' + retries + ' dans ' + (600 * (i + 1)) + 'ms...');
    } catch (networkErr) {
      if (i === retries) throw networkErr;
      console.warn('Erreur reseau - retry ' + (i + 1) + '/' + retries + '...');
    }
    await new Promise(r => setTimeout(r, 600 * (i + 1)));
  }
}

// ── Export signature : JPEG compresse 600x300 ────────────────────────────────
// Reduit le poids (~10x vs PNG) pour eviter la limite 4.5MB Vercel
function exportSignatureCompressed(sourceCanvas) {
  const out = document.createElement('canvas');
  out.width  = 600;
  out.height = 300;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 600, 300);
  ctx.drawImage(sourceCanvas, 0, 0, 600, 300);
  return out.toDataURL('image/jpeg', 0.7);
}

// ─────────────────────────────────────────────────────────────────────────────

let sessionData = {};

document.addEventListener('DOMContentLoaded', () => {
  console.log('Page apprenant chargee');
  loadSessionData();
});

async function loadSessionData() {
  const params      = new URLSearchParams(window.location.search);
  const sessionCode = params.get('code');
  console.log('Code session:', sessionCode);

  if (sessionCode) {
    try {
      const response = await fetch(`${API_URL}/sessions/${sessionCode}`);
      if (!response.ok) throw new Error('Session non trouvee ou expiree');
      sessionData = await response.json();
      console.log('Session recuperee:', sessionData);
    } catch (error) {
      console.error('Erreur recuperation session:', error);
      showError('Le QR code a peut-etre expire (valide 24h). ' + error.message);
      disableForm();
      return;
    }
  } else {
    console.log('Utilisation parametres URL (ancien mode)');
    sessionData = {
      formateurNom:    params.get('formateurNom')    || '',
      formateurPrenom: params.get('formateurPrenom') || '',
      formation:       params.get('formation')       || '',
      date:            params.get('date')            || '',
      creneau:         params.get('creneau')         || '',
      creneauLabel:    params.get('creneauLabel')    || ''
    };
  }

  sessionFormateur.textContent = sessionData.formateurPrenom + ' ' + sessionData.formateurNom;
  sessionFormation.textContent  = sessionData.formation;
  sessionDate.textContent       = new Date(sessionData.date).toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  sessionCreneau.textContent = sessionData.creneauLabel;

  validateSession();
}

function validateSession() {
  const now            = new Date();
  const sessionDateObj = new Date(sessionData.date);
  const today    = new Date(now.getFullYear(),             now.getMonth(),             now.getDate());
  const sessDate = new Date(sessionDateObj.getFullYear(), sessionDateObj.getMonth(), sessionDateObj.getDate());

  if (sessDate.getTime() !== today.getTime()) {
    showError('Ce QR code n est valide que pour le ' + sessionDateObj.toLocaleDateString('fr-FR'));
    disableForm();
    return false;
  }

  const currentSlot = getCurrentSlot();
  if (!currentSlot || currentSlot.id !== sessionData.creneau) {
    const message = sessionData.creneau === 'matin'
      ? 'Le pointage du matin est termine. Ce QR code n est plus valide.'
      : 'Le pointage de l apres-midi est termine. Ce QR code n est plus valide.';
    showError(message);
    disableForm();
    return false;
  }

  console.log('Session valide');
  return true;
}

function getCurrentSlot() {
  const now  = new Date();
  const day  = now.getDay();
  const time = now.getHours() * 60 + now.getMinutes();

  if (day === 0 || day === 6) return null;
  if (time >= 510 && time <= 720) return { id: 'matin',      label: 'Matin (8h30 - 12h00)'      };
  if (time >= 780 && time <= 990) return { id: 'apres-midi', label: 'Apres-midi (13h00 - 16h30)' };
  return null;
}

clearBtn.addEventListener('click', () => {
  signaturePad.clear();
  console.log('Signature effacee');
});

submitBtn.addEventListener('click', async () => {
  console.log('Bouton Valider clique');

  if (!apprenantNom.value.trim() || !apprenantPrenom.value.trim()) {
    alert('Veuillez renseigner votre nom et prenom');
    return;
  }
  if (signaturePad.isEmpty()) {
    alert('Veuillez signer dans le cadre prevu');
    return;
  }
  if (!validateSession()) return;

  submitBtn.disabled = true;
  submitBtn.innerHTML = 'Envoi en cours...';

  try {
    const position = await getLocation();

    // Signature JPEG 600x300 compresse (bien plus legere qu un PNG pleine resolution)
    const signatureB64 = exportSignatureCompressed(canvas);

    const signatureData = {
      ...sessionData,
      apprenantNom:    apprenantNom.value.trim().toUpperCase(),
      apprenantPrenom: apprenantPrenom.value.trim(),
      signature:       signatureB64,
      timestamp:       new Date().toISOString(),
      latitude:        position.coords.latitude,
      longitude:       position.coords.longitude,
      userAgent:       navigator.userAgent
    };

    console.log('Envoi signature avec sessionCode:', signatureData.sessionCode);

    // Retry automatique cote front (2 tentatives sur 500/503 ou perte reseau)
    const response = await postWithRetry(`${API_URL}/attendance/sign`, signatureData, 2);

    console.log('Reponse API:', response.status, response.statusText);

    if (!response.ok) {
      let errJson = null;
      try { errJson = await response.json(); } catch (_) {}

      let msg;
      if (errJson && errJson.message) {
        msg = errJson.message;
      } else if (response.status === 413) {
        msg = 'Signature trop lourde, recommence.';
      } else {
        msg = 'Serveur occupe, reessaie dans quelques secondes.';
      }
      throw new Error(msg);
    }

    console.log('Signature enregistree avec succes');
    showSuccess();

  } catch (error) {
    console.error('Erreur:', error);
    showError(error.message || 'Erreur lors de l enregistrement. Verifie la console (F12).');
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Valider ma Presence';
  }
});

function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ coords: { latitude: null, longitude: null } });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      (error) => {
        console.warn('Geolocalisation refusee:', error.message);
        resolve({ coords: { latitude: null, longitude: null } });
      },
      { timeout: 5000, enableHighAccuracy: true }
    );
  });
}

function showSuccess() {
  document.querySelectorAll('.card').forEach(card => {
    if (card.id !== 'success-message') {
      card.style.display = 'none';
    }
  });
  successMessage.classList.remove('hidden');
  successMessage.scrollIntoView({ behavior: 'smooth' });
}

function showError(message) {
  errorText.textContent = message;
  errorMessage.classList.remove('hidden');
  errorMessage.scrollIntoView({ behavior: 'smooth' });
}

function disableForm() {
  apprenantNom.disabled  = true;
  apprenantPrenom.disabled = true;
  clearBtn.disabled      = true;
  submitBtn.disabled     = true;
  signaturePad.off();
}
