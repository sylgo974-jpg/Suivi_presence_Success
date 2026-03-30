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

window.getActiveSessionCode = () => activeSessionCode;

document.addEventListener('DOMContentLoaded', () => {
    console.log('Application Formateur démarrée');
    updateDateTime();
    setInterval(updateDateTime, 60000);
    setInterval(() => {
        if (activeSessionCode) loadSessionAttendance(activeSessionCode);
    }, 10000);
});

// ✅ FIX #1 : protège currentDateEl/currentSlotEl contre null
// ✅ FIX #2 : passe isAFC basé sur currentJour OU fallback 'two-slot'
function updateDateTime() {
    const now     = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    if (currentDateEl) currentDateEl.textContent = now.toLocaleDateString('fr-FR', options);

    // Tente AFC d'abord, puis standard — affiche le premier créneau trouvé
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

// ✅ FIX #3 : accepte isAFC en paramètre + fuseau Réunion explicite
function getCurrentSlot(isAFC = false) {
    // Force l'heure locale de La Réunion (UTC+4)
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
    updateDateTime(); // ✅ FIX #4 : re-calcule le créneau dès que le jour change
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

    // ✅ FIX #5 : calcule isAFC depuis le jour ET le nom de formation
    const jourSession = currentJour || 'AFC';
    const isAFC = jourSession === 'AFC' || finalFormation.toUpperCase().trim().startsWith('AFC');
    const slot  = getCurrentSlot(isAFC);

    if (!slot) {
        alert("Le pointage n'est disponible qu'aux horaires de formation");
        return;
    }

    const sigMatin     = window.getSignatureFormateur ? window.getSignatureFormateur('matin')      : null;
    const sigApresMidi = window.getSignatureFormateur ? window.getSignatureFormateur('apres-midi')  : null;

    sessionData = {
        formateurNom:       finalFormNom.toUpperCase(),
        formateurPrenom:    finalFormPrenom,
        formation:          finalFormation,
        jour:               jourSession,
        date:               new Date().toISOString().split('T')[0],
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

async function loadSessionAttendance(sessionCode) {
    try {
        const today    = new Date().toISOString().split('T')[0];
        const response = await fetch(`${API_URL}/attendance/today?date=${today}&sessionCode=${sessionCode}`);
        if (!response.ok) return;

        const attendances = await response.json();
        const normalise   = str => str
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

    // ✅ FIX #3 : tous les types présents + valeur par défaut si inconnu
    const typesLabels = {
        retard:           '⏰ Retard apprenant',
        retard_formateur: '⏰ Retard formateur',     // ← manquait dans ancienne version
        absence:          '🚫 Absence non justifiée',
        observation:      '💬 Observation pédagogique',
        incident:         '⚠️ Incident'
    };
    const typeLabel = typesLabels[type] || type; // fallback = la valeur brute

    const sujet = encodeURIComponent(`[Signalement] ${typeLabel} – ${formationVal} – ${dateVal}`);
    // ✅ FIX #2 : \n correct (pas \\n), et ouverture dans nouvel onglet via <a> pour éviter freeze
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

    // ✅ FIX #2 : utilise un <a> temporaire avec target="_blank" au lieu de window.location.href
    // évite le freeze sur Android Chrome
    const mailLink = document.createElement('a');
    mailLink.href = `mailto:a.successformation@gmail.com?subject=${sujet}&body=${corps}`;
    mailLink.target = '_blank';
    mailLink.rel = 'noopener';
    document.body.appendChild(mailLink);
    mailLink.click();
    document.body.removeChild(mailLink);

    fermerModalSignalement();
}
