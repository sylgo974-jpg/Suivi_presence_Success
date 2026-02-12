const API_URL = 'https://suivi-presence-success.vercel.app/api';

const sessionFormateur = document.getElementById('session-formateur');
const sessionFormation = document.getElementById('session-formation');
const sessionDate = document.getElementById('session-date');
const sessionCreneau = document.getElementById('session-creneau');
const apprenantNom = document.getElementById('apprenant-nom');
const apprenantPrenom = document.getElementById('apprenant-prenom');
const clearBtn = document.getElementById('clear-signature');
const submitBtn = document.getElementById('submit-signature');
const successMessage = document.getElementById('success-message');
const errorMessage = document.getElementById('error-message');
const errorText = document.getElementById('error-text');

const canvas = document.getElementById('signature-pad');
const signaturePad = new SignaturePad(canvas, {
    backgroundColor: 'rgb(255, 255, 255)',
    penColor: 'rgb(0, 0, 0)'
});

function resizeCanvas() {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d').scale(ratio, ratio);
    signaturePad.clear();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let sessionData = {};

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Page apprenant chargée');
    loadSessionData();
});

async function loadSessionData() {
    const params = new URLSearchParams(window.location.search);
    const sessionCode = params.get('code');
    
    console.log('🔑 Code session:', sessionCode);
    
    if (sessionCode) {
        // Nouvelle méthode: Récupérer la session depuis MongoDB via le code
        try {
            console.log('🌐 Récupération session depuis API...');
            const response = await fetch(`${API_URL}/sessions/${sessionCode}`);
            
            if (!response.ok) {
                throw new Error('Session non trouvée ou expirée');
            }
            
            sessionData = await response.json();
            console.log('✅ Session récupérée:', sessionData);
            
        } catch (error) {
            console.error('❌ Erreur récupération session:', error);
            showError(`❌ ${error.message}. Le QR code a peut-être expiré (valide 24h).`);
            disableForm();
            return;
        }
    } else {
        // Ancienne méthode: Paramètres dans l'URL (fallback)
        console.log('🔙 Utilisation paramètres URL (ancien mode)');
        sessionData = {
            formateurNom: params.get('formateurNom') || '',
            formateurPrenom: params.get('formateurPrenom') || '',
            formation: params.get('formation') || '',
            date: params.get('date') || '',
            creneau: params.get('creneau') || '',
            creneauLabel: params.get('creneauLabel') || ''
        };
    }
    
    // Afficher les données de session
    sessionFormateur.textContent = `${sessionData.formateurPrenom} ${sessionData.formateurNom}`;
    sessionFormation.textContent = sessionData.formation;
    sessionDate.textContent = new Date(sessionData.date).toLocaleDateString('fr-FR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    sessionCreneau.textContent = sessionData.creneauLabel;
    
    // Valider la session
    validateSession();
}

function validateSession() {
    const now = new Date();
    const sessionDate = new Date(sessionData.date);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sessDate = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());
    
    console.log('📅 Vérification date - Session:', sessDate, 'Aujourd\'hui:', today);
    
    if (sessDate.getTime() !== today.getTime()) {
        showError('❌ Ce QR code n\'est valide que pour le ' + sessionDate.toLocaleDateString('fr-FR'));
        disableForm();
        return false;
    }
    
    const currentSlot = getCurrentSlot();
    console.log('🕐 Créneau actuel:', currentSlot, '- Créneau session:', sessionData.creneau);
    
    if (!currentSlot || currentSlot.id !== sessionData.creneau) {
        const message = sessionData.creneau === 'matin' 
            ? '❌ Le pointage du matin est terminé. Ce QR code n\'est plus valide.'
            : '❌ Le pointage de l\'après-midi est terminé. Ce QR code n\'est plus valide.';
        showError(message);
        disableForm();
        return false;
    }
    
    console.log('✅ Session valide');
    return true;
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

clearBtn.addEventListener('click', () => {
    signaturePad.clear();
    console.log('🧽 Signature effacée');
});

submitBtn.addEventListener('click', async () => {
    console.log('🔘 Bouton Valider cliqué');
    
    if (!apprenantNom.value.trim() || !apprenantPrenom.value.trim()) {
        alert('⚠️ Veuillez renseigner votre nom et prénom');
        return;
    }
    
    if (signaturePad.isEmpty()) {
        alert('⚠️ Veuillez signer dans le cadre prévu');
        return;
    }
    
    if (!validateSession()) {
        return;
    }
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading"></span> Envoi en cours...';
    
    try {
        const position = await getLocation();
        
        const signatureData = {
            ...sessionData,
            apprenantNom: apprenantNom.value.trim().toUpperCase(),
            apprenantPrenom: apprenantPrenom.value.trim(),
            signature: signaturePad.toDataURL(),
            timestamp: new Date().toISOString(),
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            userAgent: navigator.userAgent
        };
        
        console.log('📤 Envoi signature:', {
            ...signatureData,
            signature: '[DATA]' // Ne pas logger la signature complète
        });
        
        const response = await fetch(`${API_URL}/attendance/sign`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(signatureData)
        });
        
        console.log('📡 Réponse API:', response.status, response.statusText);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Erreur lors de l\'enregistrement');
        }
        
        console.log('✅ Signature enregistrée avec succès');
        showSuccess();
        
    } catch (error) {
        console.error('❌ Erreur:', error);
        showError(error.message || '❌ Erreur lors de l\'enregistrement. Vérifiez la console (F12).');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '✅ Valider ma Présence';
    }
});

function getLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            console.warn('⚠️ Géolocalisation non supportée');
            resolve({ coords: { latitude: null, longitude: null } });
            return;
        }
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                console.log('📍 Position obtenue:', position.coords.latitude, position.coords.longitude);
                resolve(position);
            },
            (error) => {
                console.warn('⚠️ Géolocalisation refusée:', error.message);
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
    apprenantNom.disabled = true;
    apprenantPrenom.disabled = true;
    clearBtn.disabled = true;
    submitBtn.disabled = true;
    signaturePad.off();
}
