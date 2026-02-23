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

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Application Formateur démarrée');
    updateDateTime();
    setInterval(updateDateTime, 60000);

    // Chargement auto des présences toutes les 20s si session active
    setInterval(() => {
        if (activeSessionCode) {
            loadSessionAttendance(activeSessionCode);
        }
    }, 20000);
});

function updateDateTime() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    currentDateEl.textContent = now.toLocaleDateString('fr-FR', options);

    const slot = getCurrentSlot();
    if (slot) {
        currentSlotEl.textContent = slot.label;
        currentSlotEl.style.color = 'var(--sf-success)';
        generateQRBtn.disabled = false;
    } else {
        currentSlotEl.textContent = '⚠️ Hors horaires de pointage';
        currentSlotEl.style.color = 'var(--sf-error)';
        generateQRBtn.disabled = true;
    }
}

function getCurrentSlot() {
    const now = new Date();
    const day = now.getDay();
    const time = now.getHours() * 60 + now.getMinutes();

    if (day === 0 || day === 6) return null;

    if (time >= 510 && time <= 735) { // 8h30 - 12h15
        return { id: 'matin', label: '🌅 Matin (8h30 - 12h00)' };
    }
    if (time >= 780 && time <= 1005) { // 13h00 - 16h45
        return { id: 'apres-midi', label: '🌆 Après-midi (13h00 - 16h30)' };
    }
    return null;
}

generateQRBtn.addEventListener('click', async () => {
    if (!formateurNom.value.trim() || !formateurPrenom.value.trim() || !formation.value) {
        alert('⚠️ Veuillez remplir tous les champs obligatoires');
        return;
    }

    const slot = getCurrentSlot();
    if (!slot) {
        alert('⚠️ Le pointage n\'est disponible qu\'aux horaires de formation');
        return;
    }

    sessionData = {
        formateurNom: formateurNom.value.trim().toUpperCase(),
        formateurPrenom: formateurPrenom.value.trim(),
        formation: formation.value,
        date: new Date().toISOString().split('T')[0],
        creneau: slot.id,
        creneauLabel: slot.label
    };

    try {
        generateQRBtn.disabled = true;
        generateQRBtn.innerHTML = '<span class="loading"></span> Génération...';

        const response = await fetch(`${API_URL}/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sessionData)
        });

        if (!response.ok) throw new Error('Erreur lors de la création de la session');

        const { sessionCode } = await response.json();
        activeSessionCode = sessionCode;

        // URL pour le QR Code
        const baseURL = window.location.origin + window.location.pathname.replace('index.html', '');
        const signatureURL = `${baseURL}signature.html?code=${sessionCode}`;

        displayQRCode(signatureURL);
        loadSessionAttendance(activeSessionCode);

        generateQRBtn.innerHTML = '✅ QR Code Généré';
        setTimeout(() => {
            generateQRBtn.innerHTML = '<span>🔗</span> Mettre à jour le QR Code';
            generateQRBtn.disabled = false;
        }, 3000);

    } catch (error) {
        console.error('Erreur:', error);
        alert(`❌ Erreur: ${error.message}`);
        generateQRBtn.disabled = false;
        generateQRBtn.innerHTML = '<span>🔗</span> Réessayer';
    }
});

function displayQRCode(url) {
    qrcodeContainer.innerHTML = '';
    
    // Taille dynamique selon l'écran (max 300px)
    const size = Math.min(window.innerWidth - 80, 300);

    qrCodeInstance = new QRCode(qrcodeContainer, {
        text: url,
        width: size,
        height: size,
        colorDark: "#ce2a45", // Couleur Success Formation
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });

    qrValidity.innerHTML = `
        <strong>📅 ${sessionData.date}</strong><br>
        <strong>${sessionData.creneauLabel}</strong><br>
        <strong>📚 ${sessionData.formation}</strong><br>
        <strong>👨‍🏫 ${sessionData.formateurPrenom} ${sessionData.formateurNom}</strong>
    `;

    qrSection.classList.remove('hidden');
    attendanceList.closest('.card').classList.remove('hidden');
    
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
        
        if (attendances.length === 0) {
            attendanceList.innerHTML = '<div class="info-text">⏳ En attente de signatures...</div>';
            return;
        }

        attendanceList.innerHTML = attendances.map(att => `
            <div class="attendance-item">
                <p><strong>👤 ${att.apprenantPrenom} ${att.apprenantNom}</strong></p>
                <p>⏰ Signé à : ${new Date(att.timestamp).toLocaleTimeString('fr-FR')}</p>
            </div>
        `).join('');

    } catch (error) {
        console.error('Erreur chargement présences:', error);
    }
}
