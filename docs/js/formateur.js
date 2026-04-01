const API_URL = 'https://suivi-presence-success.vercel.app/api';

const formateurNom = document.getElementById('formateur-nom');
const formateurPrenom = document.getElementById('formateur-prenom');
const formation = document.getElementById('formation');
const currentDateEl = document.getElementById('current-date');
const currentSlotEl = document.getElementById('current-slot');
const generateQRBtn = document.getElementById('generate-qr');
const qrSection = document.getElementById('qr-section');
const qrcodeContainer = document.getElementById('qrcode-container');
const qrValidity = document.getElementById('qr-validity');
const downloadQRBtn = document.getElementById('download-qr');
const attendanceList = document.getElementById('attendance-list');

let sessionData = null;
let qrCodeInstance = null;
let activeSessionCode = null;
let listeApprenants = [];
let currentJour = null;

// ═════════════════════════════════════════════════════════════════════════════════
// FIX : Variables pour stocker la formation et le jour de la session active
// Utilisées pour charger les présences cross-sessions
// ═════════════════════════════════════════════════════════════════════════════════
let activeFormation = null;
let activeDate = null;

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
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  if (currentDateEl) currentDateEl.textContent = now.toLocaleDateString('fr-FR', options);

  const isAFC = currentJour === 'AFC';
  const slot = getCurrentSlot(isAFC) || getCurrentSlot(!isAFC);

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
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Indian/Reunion' }));
  const day = now.getDay();
  const time = now.getHours() * 60 + now.getMinutes();

  if (day === 0 || day === 6) return null;

  if (isAFC) {
    if (time >= 480 && time <= 720) return { id: 'matin', label: 'Matin (8h00 - 12h00)' };
    if (time >= 780 && time <= 1005) return { id: 'apres-midi', label: 'Après-midi (13h00 - 16h30)' };
  } else {
    if (time >= 510 && time <= 735) return { id: 'matin', label: 'Matin (8h30 - 12h15)' };
    if (time >= 780 && time <= 1005) return { id: 'apres-midi', label: 'Après-midi (13h00 - 16h45)' };
  }
  return null;
}

function setListeApprenants(liste) { listeApprenants = liste || []; }
function setJourActuel(jour) {
  currentJour = jour || null;
  updateDateTime();
}

// ── Normalisation robuste pour comparaison de noms ──────────────────────────────────
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

  let finalFormNom = formateurNom.value;
  let finalFormPrenom = formateurPrenom.value;

  if (document.getElementById('formateur-select').value === 'AUTRE') {
    if (!manualFormateur) { alert('Veuillez saisir votre nom'); return; }
    const parts = manualFormateur.split(' ');
    finalFormNom = parts[0] || '';
    finalFormPrenom = parts.slice(1).join(' ') || parts[0];
  }

  if (!finalFormNom || !finalFormPrenom || !finalFormation) {
    alert('Veuillez remplir tous les champs obligatoires');
    return;
  }

  const jourSession = currentJour || 'AFC';
  const isAFC = jourSession === 'AFC' || finalFormation.toUpperCase().trim().startsWith('AFC');
  const slot = getCurrentSlot(isAFC);

  if (!slot) {
    alert("Le pointage n'est disponible qu'aux horaires de formation");
    return;
  }

  const sigMatin = window.getSignatureFormateur ? window.getSignatureFormateur('matin') : null;
  const sigApresMidi = window.getSignatureFormateur ? window.getSignatureFormateur('apres-midi') : null;

  const todayDate = new Date().toISOString().split('T')[0];

  sessionData = {
    formateurNom: finalFormNom.toUpperCase(),
    formateurPrenom: finalFormPrenom,
    formation: finalFormation,
    jour: jourSession,
    date: todayDate,
    creneau: slot.id,
    creneauLabel: slot.label,
    signatureMatin: sigMatin || '',
    signatureApresMidi: sigApresMidi || ''
  };

  try {
    generateQRBtn.disabled = true;
    generateQRBtn.innerHTML = 'Génération...';

    const response = await fetch(`${API_URL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionData)
    });
    if (!response.ok) throw new Error('Erreur lors de la création de la session');

    const { sessionCode } = await response.json();
    activeSessionCode = sessionCode;
    window.getActiveSessionCode = () => activeSessionCode;

    // FIX : Stocker formation et date pour le chargement cross-session
    activeFormation = finalFormation;
    activeDate = todayDate;

    const baseURL = window.location.origin + window.location.pathname.replace('index.html', '');
    const signatureURL = `${baseURL}signature.html?code=${sessionCode}`;

    displayQRCode(signatureURL);

    // FIX : Charger les présences cross-sessions immédiatement
    loadAllAttendance();

    generateQRBtn.innerHTML = 'QR Code Généré ✅';
    setTimeout(() => {
      generateQRBtn.innerHTML = '🔗 Mettre à jour le QR Code';
      generateQRBtn.disabled = false;
    }, 3000);
  } catch (error) {
    console.error('Erreur:', error);
    alert(`Erreur: ${error.message}`);
    generateQRBtn.disabled = false;
    generateQRBtn.innerHTML = '🔗 Générer QR Code';
  }
});

async function patchSignatureFormateur(creneau, signatureData) {
  if (!activeSessionCode || !signatureData) return;
  try {
    const resp = await fetch(`${API_URL}/sessions/${activeSessionCode}/signature`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creneau, signature: signatureData })
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
    text: url,
    width: size,
    height: size,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });

  qrValidity.innerHTML = `
    <strong>${sessionData.date}</strong>
    <strong>${sessionData.creneauLabel}</strong>
    <strong>${sessionData.formation}${sessionData.jour ? ' (' + sessionData.jour + ')' : ''}</strong>
    <strong>${sessionData.formateurPrenom} ${sessionData.formateurNom}</strong>`;

  qrSection.classList.remove('hidden');
  document.getElementById('attendance-section').classList.remove('hidden');
  document.getElementById('signalement-section').style.display = 'block';
  qrSection.scrollIntoView({ behavior: 'smooth' });
}

downloadQRBtn.addEventListener('click', () => {
  const canvas = qrcodeContainer.querySelector('canvas');
  if (canvas) {
    const link = document.createElement('a');
    link.download = `QR-Success-${sessionData.formation}-${sessionData.date}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
});

// ═════════════════════════════════════════════════════════════════════════════════
// FIX PRINCIPAL : Chargement des présences CROSS-SESSIONS
// Utilise /api/attendance/by-formation au lieu de /api/attendance/today
// Agrège automatiquement toutes les sessions de la même formation/date
// ═════════════════════════════════════════════════════════════════════════════════
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
      const p = normalise(att.apprenantPrenom);
      const n = normalise(att.apprenantNom);
      nomsSignes.add(`${p} ${n}`);
      nomsSignes.add(`${n} ${p}`);
      nomsSignes.add(normalise(`${att.apprenantNom} ${att.apprenantPrenom}`));
      nomsSignes.add(normalise(`${att.apprenantPrenom} ${att.apprenantNom}`));
    });

    // FIX : Comparaison améliorée — cherche une correspondance partielle
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

    renderAttendance(attendances, absents);
  } catch (error) {
    console.error('Erreur chargement présences cross-session:', error);
  }
}

// FIX : Garder aussi l'ancienne fonction pour compatibilité
async function loadSessionAttendance(sessionCode) {
  return loadAllAttendance();
}

function renderAttendance(presents, absents) {
  const total = presents.length + absents.length;
  const pct = total > 0 ? Math.round((presents.length / total) * 100) : 0;

  let html = `
    <div class="attendance-stats">
      <span class="stat-present">✅ ${presents.length} présent(s)</span>
      <span class="stat-absent">⏳ ${absents.length} en attente</span>
      <span class="stat-pct">${pct}%</span>
    </div>
    <div class="attendance-items">`;

  presents.forEach(att => {
    const nomAff = `${att.apprenantPrenom} ${att.apprenantNom}`;
    const heure = new Date(att.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    html += `<div class="attendance-item present"><span class="att-name">${nomAff}</span><span class="att-time">${heure}</span></div>`;
  });

  absents.forEach(nom => {
    html += `<div class="attendance-item absent"><span class="att-name">${nom}</span><span class="att-status">En attente</span></div>`;
  });

  html += '</div>';
  if (attendanceList) attendanceList.innerHTML = html;
}

window.setListeApprenants = setListeApprenants;
window.setJourActuel = setJourActuel;
