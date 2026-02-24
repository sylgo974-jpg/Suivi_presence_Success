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

let sessionData      = null;
let qrCodeInstance   = null;
let activeSessionCode = null;
let listeApprenants  = []; // Liste complète des apprenants attendus
let currentJour      = null; // Jour sélectionné (ex: "MARDI", "AFC")

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
    const now  = new Date();
    const day  = now.getDay();
    const time = now.getHours() * 60 + now.getMinutes();
    if (day === 0 || day === 6) return null;
    if (time >= 510 && time <= 735)  return { id: 'matin',      label: 'Matin (8h30 - 12h00)' };
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
    if (!formateurNom.value.trim() || !formateurPrenom.value.trim() || !formation.value) {
        alert('Veuillez remplir tous les champs obligatoires');
        return;
    }
    const slot = getCurrentSlot();
    if (!slot) {
        alert("Le pointage n'est disponible qu'aux horaires de formation");
        return;
    }

    // Récupérer le jour depuis le select session (stocké dans currentJour)
    const jourSession = currentJour || null;

    sessionData = {
        formateurNom:    formateurNom.value.trim().toUpperCase(),
        formateurPrenom: formateurPrenom.value.trim(),
        formation:       formation.value,
        jour:            jourSession,   // <-- CORRECTION : jour correct (AFC ou LUNDI etc.)
        date:            new Date().toISOString().split('T')[0],
        creneau:         slot.id,
        creneauLabel:    slot.label
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
        colorDark:    "#ce2a45",
        colorLight:   "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });
    qrValidity.innerHTML = `
        <strong>${sessionData.date}</strong><br>
        <strong>${sessionData.creneauLabel}</strong><br>
        <strong>${sessionData.formation}${sessionData.jour ? ' (' + sessionData.jour + ')' : ''}</strong><br>
        <strong>${sessionData.formateurPrenom} ${sessionData.formateurNom}</strong>
    `;
    qrSection.classList.remove('hidden');
    document.getElementById('attendance-section').classList.remove('hidden');
    qrSection.scrollIntoView({ behavior: 'smooth' });
}

downloadQRBtn.addEventListener('click', () => {
    const canvas = qrcodeContainer.querySelector('canvas');
    if (canvas) {
        const link      = document.createElement('a');
        link.download   = `QR-Success-${sessionData.formation}-${sessionData.date}.png`;
        link.href       = canvas.toDataURL("image/png");
        link.click();
    }
});

async function loadSessionAttendance(sessionCode) {
    try {
        const today    = new Date().toISOString().split('T')[0];
        const response = await fetch(`${API_URL}/attendance/today?date=${today}&sessionCode=${sessionCode}`);
        if (!response.ok) return;
        const attendances = await response.json();

        // Normalisation : minuscules, sans accents, sans espaces superflus
        const normalise = str => str
            ? str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
            : '';

        const nomsSignes = new Set();
        attendances.forEach(att => {
            const prenom = normalise(att.apprenantPrenom);
            const nom    = normalise(att.apprenantNom);
            nomsSignes.add(`${prenom} ${nom}`);
            nomsSignes.add(`${nom} ${prenom}`);
        });

        const presents = attendances;
        const absents  = listeApprenants.filter(nom => !nomsSignes.has(normalise(nom)));

        renderAttendance(presents, absents);
    } catch (error) {
        console.error('Erreur chargement présences:', error);
    }
}

function renderAttendance(presents, absents) {
    const total = presents.length + absents.length;
    const pct   = total > 0 ? Math.round((presents.length / total) * 100) : 0;

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
