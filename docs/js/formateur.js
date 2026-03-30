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

// ── Expose l’activeSessionCode pour les autres scripts (ex: index.html) ───────
window.getActiveSessionCode = () => activeSessionCode;

document.addEventListener('DOMContentLoaded', () => {
    console.log('Application Formateur démarrée');
    updateDateTime();
    setInterval(updateDateTime, 60000);

    // Rafraîchissement automatique toutes les 10 s si session active
    setInterval(() => {
        if (activeSessionCode) loadSessionAttendance(activeSessionCode);
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

// Appelé depuis index.html quand les apprenants sont chargés
function setListeApprenants(liste) { listeApprenants = liste || []; }

// Appelé depuis index.html pour transmettre le jour sélectionné
function setJourActuel(jour) { currentJour = jour || null; }

// ── Générer le QR Code ────────────────────────────────────────────────────
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

    const slot = getCurrentSlot();
    if (!slot) {
        alert("Le pointage n'est disponible qu'aux horaires de formation");
        return;
    }

    const jourSession = currentJour || 'AFC';

    // ── Récupérer les signatures déjà enregistrées ──────────────────────────────────
    const sigMatin     = window.getSignatureFormateur ? window.getSignatureFormateur('matin')      : null;
    const sigApresMidi = window.getSignatureFormateur ? window.getSignatureFormateur('apres-midi') : null;

    sessionData = {
        formateurNom:       finalFormNom.toUpperCase(),
        formateurPrenom:    finalFormPrenom,
        formation:          finalFormation,
        jour:               jourSession,
        date:               new Date().toISOString().split('T')[0],
        creneau:            slot.id,
        creneauLabel:       slot.label,
        signatureMatin:     sigMatin     || '',
        signatureApresMidi: sigApresMidi || ''
    };

    try {
        generateQRBtn.disabled = true;
        generateQRBtn.innerHTML = 'Génération...';

        const response = await fetch(`${API_URL}/sessions`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(sessionData)
        });
        if (!response.ok) throw new Error('Erreur lors de la création de la session');

        const { sessionCode } = await response.json();
        activeSessionCode = sessionCode;
        window.getActiveSessionCode = () => activeSessionCode; // Rafraîchir l’exposition

        const baseURL      = window.location.origin + window.location.pathname.replace('index.html', '');
        const signatureURL = `${baseURL}signature.html?code=${sessionCode}`;

        displayQRCode(signatureURL);
        loadSessionAttendance(activeSessionCode);

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

// ── Mettre à jour la signature formateur après coup (PATCH) ────────────────────
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

// Exposer pour index.html
window.patchSignatureFormateur = patchSignatureFormateur;

// ── Affichage du QR Code ──────────────────────────────────────────────────────
function displayQRCode(url) {
    qrcodeContainer.innerHTML = '';
    const size = Math.min(window.innerWidth - 80, 300);

    qrCodeInstance = new QRCode(qrcodeContainer, {
        text:          url,
        width:         size,
        height:        size,
        colorDark:     '#000000',
        colorLight:    '#ffffff',
        correctLevel:  QRCode.CorrectLevel.H
    });

    qrValidity.innerHTML = `
        <strong>${sessionData.date}</strong>
        <strong>${sessionData.creneauLabel}</strong>
        <strong>${sessionData.formation}${sessionData.jour ? ' (' + sessionData.jour + ')' : ''}</strong>
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
        const link      = document.createElement('a');
        link.download   = `QR-Success-${sessionData.formation}-${sessionData.date}.png`;
        link.href       = canvas.toDataURL('image/png');
        link.click();
    }
});

// ── Chargement des présences ──────────────────────────────────────────────────
async function loadSessionAttendance(sessionCode) {
    try {
        const today    = new Date().toISOString().split('T')[0];
        const response = await fetch(`${API_URL}/attendance/today?date=${today}&sessionCode=${sessionCode}`);
        if (!response.ok) return;
        const attendances = await response.json();

        const normalise = str => str
            ? str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
            : '';

        const nomsSignes = new Set();
        attendances.forEach(att => {
            const p = normalise(att.apprenantPrenom);
            const n = normalise(att.apprenantNom);
            nomsSignes.add(`${p} ${n}`);
            nomsSignes.add(`${n} ${p}`);
        });

        const absents = listeApprenants.filter(nom => !nomsSignes.has(normalise(nom)));
        renderAttendance(attendances, absents);

    } catch (error) {
        console.error('Erreur chargement présences:', error);
    }
}

function renderAttendance(presents, absents) {
    const total = presents.length + absents.length;
    const pct   = total > 0 ? Math.round((presents.length / total) * 100) : 0;

    let html = `
        <div class="attendance-stats">
            <div class="stat-card present">
                <span class="stat-number">${presents.length}</span>
                <span class="stat-label">Présents</span>
            </div>
            <div class="stat-card absent">
                <span class="stat-number">${absents.length}</span>
                <span class="stat-label">Absents</span>
            </div>
            <div class="stat-card total">
                <span class="stat-number">${pct}%</span>
                <span class="stat-label">Taux</span>
            </div>
        </div>
    `;

    if (presents.length > 0) {
        html += '<h4>✅ Présents</h4><ul class="attendance-ul">';
        presents.forEach(att => {
            html += `<li>🟢 ${att.apprenantPrenom} ${att.apprenantNom} <span class="time">${new Date(att.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span></li>`;
        });
        html += '</ul>';
    }

    if (absents.length > 0) {
        html += '<h4>❌ Absents</h4><ul class="attendance-ul">';
        absents.forEach(nom => {
            html += `<li>🔴 ${nom}</li>`;
        });
        html += '</ul>';
    }

    attendanceList.innerHTML = html;
}

// ── Signalement ───────────────────────────────────────────────────────────────────────
function ouvrirModalSignalement() {
    document.getElementById('modal-signalement').classList.add('active');
}
function fermerModalSignalement() {
    document.getElementById('modal-signalement').classList.remove('active');
    document.getElementById('signalement-form').reset();
}

function envoyerSignalement() {
    const typeSignalement = document.getElementById('type-signalement').value;
    const descSignalement = document.getElementById('desc-signalement').value.trim();
    const nomApprenant    = document.getElementById('nom-apprenant-signalement').value.trim();

    if (!descSignalement) {
        alert('Veuillez décrire le problème');
        return;
    }

    const formation_sig = sessionData ? sessionData.formation : 'Inconnue';
    const date_sig      = sessionData ? sessionData.date      : new Date().toISOString().split('T')[0];
    const formateur_sig = sessionData
        ? `${sessionData.formateurPrenom} ${sessionData.formateurNom}`
        : 'Formateur inconnu';

    const sujet = encodeURIComponent(
        `[Signalement ${typeSignalement}] ${formation_sig} - ${date_sig}`
    );
    const corps = encodeURIComponent(
        `Type : ${typeSignalement}\n` +
        `Formation : ${formation_sig}\n` +
        `Date : ${date_sig}\n` +
        `Formateur : ${formateur_sig}\n` +
        `Apprenant concerné : ${nomApprenant || 'Non précisé'}\n\n` +
        `Description :\n${descSignalement}\n\n` +
        `---\nMessage envoyé depuis l'interface formateur Success Formation`
    );

    window.location.href = `mailto:pedagogie@successformation.re?subject=${sujet}&body=${corps}`;
    fermerModalSignalement();
}
