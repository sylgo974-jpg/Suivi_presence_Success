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
let listeApprenants = []; // Liste complète des apprenants attendus
let currentJour = null; // Jour sélectionné (ex: "MARDI", "AFC")

document.addEventListener('DOMContentLoaded', () => {
  console.log('Application Formateur démarrée');
  updateDateTime();
  setInterval(updateDateTime, 60000);
  // Rafraîchissement automatique toutes les 10s si session active
  setInterval(() => {
    if (activeSessionCode) {
      loadSessionAttendance(activeSessionCode);
    }
  }, 10000);
});

function updateDateTime() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  currentDateEl.textContent = now.toLocaleDateString('fr-FR', options);
  const slot = getCurrentSlot();
  if (slot) {
    currentSlotEl.textContent = slot.label;
    currentSlotEl.style.color = 'var(--sf-success)';
  } else {
    currentSlotEl.textContent = 'Hors horaires de pointage';
    currentSlotEl.style.color = 'var(--sf-error)';
  }
}

function getCurrentSlot() {
  const now = new Date();
  const day = now.getDay();
  const time = now.getHours() * 60 + now.getMinutes();
  if (day === 0 || day === 6) return null;
  if (time >= 510 && time <= 735) return { id: 'matin', label: 'Matin (8h30 - 12h00)' };
  if (time >= 780 && time <= 1005) return { id: 'apres-midi', label: 'Après-midi (13h00 - 16h30)' };
  return null;
}

// Fonction appelée depuis index.html quand les apprenants sont chargés
function setListeApprenants(liste) {
  listeApprenants = liste || [];
}

// Fonction appelée depuis index.html pour transmettre le jour sélectionné
function setJourActuel(jour) {
  currentJour = jour || null;
}

generateQRBtn.addEventListener('click', async () => {
  const manualFormation = document.getElementById('manual-formation').value.trim();
  const manualFormateur = document.getElementById('manual-formateur-nom').value.trim();
  
  let finalFormation = formation.value;
  if (document.getElementById('session-select').value === "AUTRE") {
      if (!manualFormation) { alert('Veuillez saisir le nom de la formation'); return; }
      finalFormation = manualFormation;
  }
  
  let finalFormNom = formateurNom.value;
  let finalFormPrenom = formateurPrenom.value;
  
  if (document.getElementById('formateur-select').value === "AUTRE") {
      if (!manualFormateur) { alert('Veuillez saisir votre nom'); return; }
      const parts = manualFormateur.split(' ');
      finalFormNom = parts[0] || '';
      finalFormPrenom = parts.slice(1).join(' ') || parts[0];
  }

  if (!finalFormNom || !finalFormPrenom || !finalFormation) {
    alert('Veuillez remplir tous les champs obligatoires');
    return;
  }

  const slot = getCurrentSlot();
  if (!slot) {
    alert("Le pointage n'est disponible qu'aux horaires de formation");
    return;
  }

  const jourSession = currentJour || "AFC"; // Par défaut AFC si Autre
  sessionData = {
    formateurNom: finalFormNom.toUpperCase(),
    formateurPrenom: finalFormPrenom,
    formation: finalFormation,
    jour: jourSession,
    date: new Date().toISOString().split('T')[0],
    creneau: slot.id,
    creneauLabel: slot.label
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
    const baseURL = window.location.origin + window.location.pathname.replace('index.html', '');
    const signatureURL = `${baseURL}signature.html?code=${sessionCode}`;
    displayQRCode(signatureURL);
    loadSessionAttendance(activeSessionCode);
    generateQRBtn.innerHTML = 'QR Code Généré';
    setTimeout(() => {
      generateQRBtn.innerHTML = 'Mettre à jour le QR Code';
      generateQRBtn.disabled = false;
    }, 3000);
  } catch (error) {
    console.error('Erreur:', error);
    alert(`Erreur: ${error.message}`);
    generateQRBtn.disabled = false;
    generateQRBtn.innerHTML = 'Réessayer';
  }
});

function displayQRCode(url) {
  qrcodeContainer.innerHTML = '';
  const size = Math.min(window.innerWidth - 80, 300);
  qrCodeInstance = new QRCode(qrcodeContainer, {
    text: url,
    width: size,
    height: size,
    colorDark: "#000000",
    colorLight: "#ffffff",
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
  // Afficher la section signalement pédagogique
  document.getElementById('signalement-section').style.display = 'block';
  qrSection.scrollIntoView({ behavior: 'smooth' });
}

downloadQRBtn.addEventListener('click', () => {
  const canvas = qrcodeContainer.querySelector('canvas');
  if (canvas) {
    const link = document.createElement('a');
    link.download = `QR-Success-${sessionData.formation}-${sessionData.date}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }
});

async function loadSessionAttendance(sessionCode) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const response = await fetch(`${API_URL}/attendance/today?date=${today}&sessionCode=${sessionCode}`);
    if (!response.ok) return;
    const attendances = await response.json();
    const normalise = str => str
      ? str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
      : '';
    const nomsSignes = new Set();
    attendances.forEach(att => {
      const prenom = normalise(att.apprenantPrenom);
      const nom = normalise(att.apprenantNom);
      nomsSignes.add(`${prenom} ${nom}`);
      nomsSignes.add(`${nom} ${prenom}`);
    });
    const presents = attendances;
    const absents = listeApprenants.filter(nom => !nomsSignes.has(normalise(nom)));
    renderAttendance(presents, absents);
  } catch (error) {
    console.error('Erreur chargement présences:', error);
  }
}

function renderAttendance(presents, absents) {
  const total = presents.length + absents.length;
  const pct = total > 0 ? Math.round((presents.length / total) * 100) : 0;
  let html = '';
  html += `<div class="attendance-header">
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
      html += `<div class="attendance-item present"><span class="att-nom">${att.apprenantPrenom} ${att.apprenantNom}</span><span class="att-heure">${heure}</span></div>`;
    });
    html += `</div>`;
  }
  if (absents.length > 0) {
    html += `<div class="attendance-group"><div class="group-title absent-title">Pas encore signé (${absents.length})</div>`;
    absents.forEach(nom => {
      html += `<div class="attendance-item absent"><span class="att-nom">${nom}</span><span class="att-statut">En attente...</span></div>`;
    });
    html += `</div>`;
  }
  if (presents.length === 0 && absents.length === 0) {
    html = '<div class="attendance-item">En attente de signatures...</div>';
  }
  attendanceList.innerHTML = html;
}

// =============================================
// === SIGNALEMENT PÉDAGOGIQUE ===
// =============================================

function ouvrirModalSignalement() {
  const modal = document.getElementById('modal-signalement');
  modal.style.display = 'flex';

  // Pré-remplir la liste des apprenants dans la modale
  const selectApprenant = document.getElementById('signal-apprenant');
  selectApprenant.innerHTML = '<option value="">-- Sélectionner (optionnel) --</option>';
  listeApprenants.forEach(nom => {
    const opt = document.createElement('option');
    opt.value = nom;
    opt.textContent = nom;
    selectApprenant.appendChild(opt);
  });

  // Afficher/masquer la sélection d'apprenant selon le type
  const signalTypeEl = document.getElementById('signal-type');
  signalTypeEl.onchange = function() {
    const types = ['retard', 'absence'];
    const group = document.getElementById('signal-apprenant-group');
    group.style.display = types.includes(this.value) ? 'block' : 'none';
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
  const type = document.getElementById('signal-type').value;
  const message = document.getElementById('signal-message').value.trim();
  const apprenant = document.getElementById('signal-apprenant').value;

  if (!type) { alert('Veuillez sélectionner un type de signalement.'); return; }
  if (!message) { alert('Veuillez rédiger un message ou une observation.'); return; }

  // Infos de session courante
  const formationVal = sessionData ? sessionData.formation : 'Non renseignée';
  const formateurVal = sessionData ? `${sessionData.formateurPrenom} ${sessionData.formateurNom}` : 'Non renseigné';
  const dateVal = sessionData ? sessionData.date : new Date().toISOString().split('T')[0];
  const creneauVal = sessionData ? sessionData.creneauLabel : 'Non renseigné';

  const typesLabels = {
    retard: '⏰ Retard apprenant',
    retard_formateur: '⏰ Retard formateur',
    absence: '🚫 Absence non justifiée',
    observation: '💬 Observation pédagogique',
    incident: '⚠️ Incident'
  };

  const sujet = encodeURIComponent(`[Signalement] ${typesLabels[type]} – ${formationVal} – ${dateVal}`);

  const corps = encodeURIComponent(
`Bonjour,

Type de signalement : ${typesLabels[type]}
Date : ${dateVal}
Créneau : ${creneauVal}
Formation : ${formationVal}
Formateur : ${formateurVal}${apprenant ? `\nApprenant concerné : ${apprenant}` : ''}

Observation :
${message}

---
Message envoyé depuis l'interface formateur Success Formation`
  );

  window.location.href = `mailto:pedagogie@successformation.re?subject=${sujet}&body=${corps}`;
  fermerModalSignalement();
}
