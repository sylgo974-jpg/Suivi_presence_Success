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

// ── sessionCode actif : on ne charge les présences QUE pour cette session ──
let activeSessionCode = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Application démarrée');
    updateDateTime();
    setInterval(updateDateTime, 60000);
    // Pas de chargement automatique au démarrage : attend le QR généré
    setInterval(() => {
        if (activeSessionCode) {
            loadSessionAttendance(activeSessionCode);
        }
    }, 30000);
});

function updateDateTime() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    currentDateEl.textContent = now.toLocaleDateString('fr-FR', options);
    
    const slot = getCurrentSlot();
    if (slot) {
        currentSlotEl.textContent = slot.label;
        currentSlotEl.style.color = '#11998e';
        generateQRBtn.disabled = false;
        generateQRBtn.textContent = '🔗 Générer QR Code de Pointage';
    } else {
        currentSlotEl.textContent = '⚠️ Hors horaires de pointage';
        currentSlotEl.style.color = '#eb3349';
        generateQRBtn.disabled = true;
        generateQRBtn.textContent = '❌ Hors horaires de pointage';
    }
}

function getCurrentSlot() {
    const now = new Date();
    const day = now.getDay();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const time = hours * 60 + minutes;
    
    if (day === 0 || day === 6) return null;
    
    if (time >= 510 && time <= 720) {
        return { id: 'matin', label: '🌅 Matin (8h30 - 12h00)' };
    }
    
    if (time >= 780 && time <= 990) {
        return { id: 'apres-midi', label: '🌆 Après-midi (13h00 - 16h30)' };
    }
    
    return null;
}

generateQRBtn.addEventListener('click', async () => {
    console.log('🔘 Bouton Générer QR cliqué');
    
    if (!formateurNom.value.trim() || !formateurPrenom.value.trim() || !formation.value) {
        alert('⚠️ Veuillez remplir tous les champs obligatoires');
        return;
    }
    
    const slot = getCurrentSlot();
    if (!slot) {
        alert('⚠️ Le pointage n\'est pas disponible en dehors des horaires de formation');
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
    
    console.log('📤 Données session:', sessionData);
    
    try {
        generateQRBtn.disabled = true;
        generateQRBtn.innerHTML = '<span class="loading"></span> Génération...';
        
        console.log('🌐 Appel API:', `${API_URL}/sessions`);
        
        const response = await fetch(`${API_URL}/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sessionData)
        });
        
        console.log('📡 Réponse API:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ Erreur API:', errorData);
            throw new Error(errorData.error || 'Erreur création session');
        }
        
        const { sessionCode } = await response.json();
        console.log('✅ Session créée avec code:', sessionCode);
        
        // ── Mémoriser le code session actif ──
        activeSessionCode = sessionCode;
        
        // Construire l'URL complète pour le QR code
        const baseURL = window.location.origin + window.location.pathname.replace('index.html', '');
        const signatureURL = `${baseURL}signature.html?code=${sessionCode}`;
        
        console.log('🔗 URL signature:', signatureURL);
        
        // Afficher le QR code
        displayQRCode(signatureURL);
        
        // Charger immédiatement les présences de cette session (vide au départ)
        loadSessionAttendance(activeSessionCode);
        
        generateQRBtn.disabled = false;
        generateQRBtn.textContent = '✅ QR Code Généré';
        
    } catch (error) {
        console.error('❌ Erreur génération QR:', error);
        alert(`❌ Erreur: ${error.message}\n\nVérifiez la console (F12) pour plus de détails.`);
        generateQRBtn.disabled = false;
        generateQRBtn.textContent = '🔗 Générer QR Code de Pointage';
    }
});

function displayQRCode(url) {
    // Nettoyer le conteneur
    qrcodeContainer.innerHTML = '';
    
    // Créer le QR code
    qrCodeInstance = new QRCode(qrcodeContainer, {
        text: url,
        width: 300,
        height: 300,
        colorDark: '#667eea',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });
    
    // Afficher les informations
    qrValidity.innerHTML = `
        <strong>📅 ${sessionData.date}</strong><br>
        <strong>${sessionData.creneauLabel}</strong><br>
        <strong>📚 ${sessionData.formation}</strong><br>
        <strong>👨‍🏫 ${sessionData.formateurPrenom} ${sessionData.formateurNom}</strong>
    `;
    
    // Afficher la section QR
    qrSection.classList.remove('hidden');
    qrSection.scrollIntoView({ behavior: 'smooth' });
    
    console.log('✅ QR Code affiché');
}

downloadQRBtn.addEventListener('click', () => {
    try {
        const canvas = qrcodeContainer.querySelector('canvas');
        if (!canvas) {
            const img = qrcodeContainer.querySelector('img');
            if (img) {
                const link = document.createElement('a');
                link.download = `QR-Pointage-${sessionData.formation}-${sessionData.date}-${sessionData.creneau}.png`;
                link.href = img.src;
                link.click();
            }
        } else {
            canvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = `QR-Pointage-${sessionData.formation}-${sessionData.date}-${sessionData.creneau}.png`;
                link.href = url;
                link.click();
                URL.revokeObjectURL(url);
            });
        }
        console.log('💾 QR Code téléchargé');
    } catch (error) {
        console.error('❌ Erreur téléchargement:', error);
        alert('Erreur lors du téléchargement du QR code');
    }
});

// ── Chargement des présences UNIQUEMENT pour la session active ──
async function loadSessionAttendance(sessionCode) {
    try {
        const today = new Date().toISOString().split('T')[0];
        console.log(`📊 Chargement présences session ${sessionCode} du ${today}`);
        
        // On passe le sessionCode en paramètre → le backend filtre
        const response = await fetch(`${API_URL}/attendance/today?date=${today}&sessionCode=${sessionCode}`);
        
        if (!response.ok) {
            console.warn('⚠️ Erreur chargement présences:', response.status);
            return;
        }
        
        const attendances = await response.json();
        console.log(`✅ ${attendances.length} présence(s) pour la session ${sessionCode}`);
        
        if (attendances.length === 0) {
            attendanceList.innerHTML = '<p class="info-text">⏳ En attente de signatures pour cette session...</p>';
            return;
        }
        
        attendanceList.innerHTML = attendances.map((att, index) => `
            <div class="attendance-item">
                <p><strong>👤 ${att.apprenantPrenom} ${att.apprenantNom}</strong></p>
                <p>📚 ${att.formation}</p>
                <p>🕐 ${att.creneauLabel}</p>
                <p>⏰ ${new Date(att.timestamp).toLocaleTimeString('fr-FR')}</p>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('❌ Erreur chargement présences:', error);
        attendanceList.innerHTML = '<p class="info-text">Erreur de chargement des présences</p>';
    }
}
