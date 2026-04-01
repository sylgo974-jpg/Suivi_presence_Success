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
  penColor: 'rgb(0, 0, 0)',
  minWidth: 1.5,
  maxWidth: 3.5
});

let sessionData = {};
let listeApprenants = [];
let monNomComplet = '';
let intervalId = null;
// FIX : Flag — seule une soumission POST réussie peut déclencher le message succès
let signatureSoumise = false;

// ── Normalisation robuste ────────────────────────────────────────────────────
function normalise(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Resize canvas ────────────────────────────────────────────────────────────
function resizeCanvas() {
  var ratio = Math.max(window.devicePixelRatio || 1, 1);
  var data = signaturePad.toData();
  canvas.width = canvas.offsetWidth * ratio;
  canvas.height = canvas.offsetHeight * ratio;
  canvas.getContext('2d').scale(ratio, ratio);
  signaturePad.clear();
  if (data && data.length > 0) signaturePad.fromData(data);
}

var resizeTimer;
window.addEventListener('resize', function() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resizeCanvas, 250);
});
resizeCanvas();

document.getElementById('signature-pad').addEventListener('touchstart', function(e) {
  e.stopPropagation();
}, { passive: false });

// ── Retry fetch ──────────────────────────────────────────────────────────────
async function postWithRetry(url, payload, retries) {
  retries = retries || 2;
  var lastRes = null;
  for (var i = 0; i <= retries; i++) {
    try {
      lastRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (lastRes.ok) return lastRes;
      if ([500, 503].indexOf(lastRes.status) < 0 || i === retries) return lastRes;
    } catch (networkErr) {
      if (i === retries) throw networkErr;
    }
    await new Promise(function(r) { setTimeout(r, 600 * (i + 1)); });
  }
  return lastRes;
}

// ── Export signature JPEG compressé ──────────────────────────────────────────
function exportSignatureCompressed(sourceCanvas) {
  var out = document.createElement('canvas');
  out.width = 600;
  out.height = 300;
  var ctx = out.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 600, 300);
  ctx.drawImage(sourceCanvas, 0, 0, 600, 300);
  return out.toDataURL('image/jpeg', 0.7);
}

// ── Chargement des données session ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  loadSessionData();
});

async function loadSessionData() {
  var params = new URLSearchParams(window.location.search);
  var sessionCode = params.get('code');

  if (sessionCode) {
    try {
      var response = await fetch(API_URL + '/sessions/' + sessionCode);
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

  sessionFormateur.textContent = sessionData.formateurPrenom + ' ' + sessionData.formateurNom;
  sessionFormation.textContent = sessionData.formation;
  sessionDate.textContent = new Date(sessionData.date).toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  sessionCreneau.textContent = sessionData.creneauLabel;

  if (!validateSession()) return;

  await chargerApprenants();

  intervalId = setInterval(rafraichirPresences, 8000);
  rafraichirPresences();
}

// ── Charger la liste des apprenants attendus ─────────────────────────────────
async function chargerApprenants() {
  if (!sessionData.formation) return;
  try {
    var jour = sessionData.jour;
    if (!jour && sessionData.date) {
      var joursSemaine = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'];
      jour = joursSemaine[new Date(sessionData.date).getDay()];
    }

    var url = API_URL + '/resources/apprenants?formation=' + encodeURIComponent(sessionData.formation)
            + (jour ? '&jour=' + encodeURIComponent(jour) : '');
    var res = await fetch(url);
    listeApprenants = await res.json();

    var sel = document.getElementById('apprenant-select');
    if (sel) {
      sel.innerHTML = '<option value="">-- Choisir mon nom --</option>';
      listeApprenants.forEach(function(nom) {
        var opt = document.createElement('option');
        opt.value = nom;
        opt.textContent = nom;
        sel.appendChild(opt);
      });

      var optAutre = document.createElement('option');
      optAutre.value = 'AUTRE';
      optAutre.textContent = "➕ Mon nom n'est pas dans la liste...";
      sel.appendChild(optAutre);

      document.getElementById('select-apprenant-group').style.display = 'block';
      document.getElementById('saisie-manuelle-group').style.display = 'none';
      document.getElementById('saisie-prenom-group').style.display = 'none';

      sel.addEventListener('change', function() {
        var val = this.value;
        var manualNomGroup = document.getElementById('saisie-manuelle-group');
        var manualPrenomGroup = document.getElementById('saisie-prenom-group');

        if (val === 'AUTRE') {
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
          var parts = val.split(' ');
          document.getElementById('apprenant-nom').value = parts[0] || '';
          document.getElementById('apprenant-prenom').value = parts.slice(1).join(' ') || parts[0];
          // FIX : NE PAS appeler rafraichirPresences() ici
          // L'apprenant doit d'abord SIGNER avant toute validation
        }
      });
    }
    document.getElementById('presence-card').style.display = 'block';
  } catch(e) {
    console.warn('Impossible de charger la liste des apprenants:', e);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Rafraîchir les présences — AFFICHAGE UNIQUEMENT
//
// FIX CRITIQUE : Ne masque le formulaire de signature que si
// signatureSoumise === true (POST /sign réussi dans cette session navigateur)
// ══════════════════════════════════════════════════════════════════════════════
async function rafraichirPresences() {
  if (!sessionData || !sessionData.formation || !sessionData.date) return;

  try {
    var dateToday = sessionData.date.indexOf('T') >= 0
      ? sessionData.date.split('T')[0]
      : sessionData.date;

    var attendances = [];

    // Nouvel endpoint cross-session
    try {
      var urlNew = API_URL + '/attendance/by-formation?date=' + encodeURIComponent(dateToday)
                 + '&formation=' + encodeURIComponent(sessionData.formation);
      var respNew = await fetch(urlNew);
      if (respNew.ok) {
        attendances = await respNew.json();
      }
    } catch (_) { /* endpoint pas encore déployé */ }

    // Fallback par sessionCode
    if (attendances.length === 0 && sessionData.sessionCode) {
      try {
        var urlOld = API_URL + '/attendance/today?date=' + encodeURIComponent(dateToday)
                   + '&sessionCode=' + encodeURIComponent(sessionData.sessionCode);
        var respOld = await fetch(urlOld);
        if (respOld.ok) {
          attendances = await respOld.json();
        }
      } catch (_) { /* pas de connectivité */ }
    }

    // Construire le Set de noms — CORRESPONDANCE STRICTE uniquement
    var nomsSignes = new Set();
    attendances.forEach(function(att) {
      var p = normalise(att.apprenantPrenom);
      var n = normalise(att.apprenantNom);
      nomsSignes.add(p + ' ' + n);
      nomsSignes.add(n + ' ' + p);
    });

    var presents = attendances;

    // FIX : Correspondance STRICTE — plus de includes()
    var absents = listeApprenants.filter(function(nom) {
      return !nomsSignes.has(normalise(nom));
    });

    var total = presents.length + absents.length;
    var pct = total > 0 ? Math.round((presents.length / total) * 100) : 0;

    document.getElementById('count-present').textContent = presents.length;
    document.getElementById('count-absent').textContent = absents.length;
    document.getElementById('progress-bar').style.width = pct + '%';
    document.getElementById('progress-label').textContent = pct + '% de présence';

    var listEl = document.getElementById('presence-list');
    var html = '';

    presents.forEach(function(att) {
      var nomAff = att.apprenantPrenom + ' ' + att.apprenantNom;
      var heure = new Date(att.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      var estMoi = monNomComplet && normalise(monNomComplet) === normalise(nomAff);
      html += '<div class="presence-item present' + (estMoi ? ' moi' : '') + '">' +
              '<span>✅ ' + nomAff + (estMoi ? ' (vous)' : '') + '</span>' +
              '<span class="time">⏰ ' + heure + '</span></div>';
    });

    absents.forEach(function(nom) {
      var estMoi = monNomComplet && normalise(monNomComplet) === normalise(nom);
      html += '<div class="presence-item absent' + (estMoi ? ' moi' : '') + '">' +
              '<span>⏳ ' + nom + (estMoi ? ' (vous)' : '') + '</span>' +
              '<span class="status">En attente</span></div>';
    });

    if (!html) html = '<div class="empty-list">⏳ En attente de signatures...</div>';
    listEl.innerHTML = html;

    // FIX CRITIQUE : Masquer le formulaire UNIQUEMENT après soumission réussie
    if (signatureSoumise && monNomComplet) {
      var monNomNorm = normalise(monNomComplet);
      if (nomsSignes.has(monNomNorm)) {
        document.getElementById('form-card').style.display = 'none';
        document.getElementById('signature-card').style.display = 'none';
        if (!successMessage.classList.contains('hidden')) return;
        document.getElementById('success-nom').textContent = monNomComplet;
        successMessage.classList.remove('hidden');
        clearInterval(intervalId);
      }
    }
  } catch(e) {
    console.warn('Erreur rafraîchissement présences:', e);
  }
}

// ── Validation session ───────────────────────────────────────────────────────
function validateSession() {
  var now = new Date();
  var sessionDateObj = new Date(sessionData.date);
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var sessDate = new Date(sessionDateObj.getFullYear(), sessionDateObj.getMonth(), sessionDateObj.getDate());

  if (sessDate.getTime() !== today.getTime()) {
    showError('Ce QR code n\'est valide que pour le ' + sessionDateObj.toLocaleDateString('fr-FR'));
    disableForm();
    return false;
  }

  var currentSlot = getCurrentSlot();
  if (!currentSlot || currentSlot.id !== sessionData.creneau) {
    var message = sessionData.creneau === 'matin'
      ? 'Le pointage du matin est terminé.'
      : 'Le pointage de l\'après-midi est terminé.';
    showError(message);
    disableForm();
    return false;
  }
  return true;
}

function getCurrentSlot() {
  var now = new Date();
  var day = now.getDay();
  var time = now.getHours() * 60 + now.getMinutes();
  if (day === 0 || day === 6) return null;
  if (time >= 420 && time <= 750) return { id: 'matin', label: 'Matin (8h30 - 12h00)' };
  if (time >= 720 && time <= 1080) return { id: 'apres-midi', label: 'Après-midi (13h00 - 16h30)' };
  return null;
}

clearBtn.addEventListener('click', function() { signaturePad.clear(); });

// ── Soumettre la signature ───────────────────────────────────────────────────
submitBtn.addEventListener('click', async function() {
  var nomVal = document.getElementById('apprenant-nom').value.trim();
  var prenomVal = document.getElementById('apprenant-prenom').value.trim();

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
    var position = await getLocation();
    var signatureB64 = exportSignatureCompressed(canvas);

    var signatureData = {
      date:            sessionData.date,
      creneau:         sessionData.creneau,
      creneauLabel:    sessionData.creneauLabel,
      formation:       sessionData.formation,
      formateurNom:    sessionData.formateurNom,
      formateurPrenom: sessionData.formateurPrenom,
      sessionCode:     sessionData.sessionCode || '',
      apprenantNom:    nomVal.toUpperCase(),
      apprenantPrenom: prenomVal,
      signature:       signatureB64,
      timestamp:       new Date().toISOString(),
      latitude:        position.coords.latitude,
      longitude:       position.coords.longitude,
      userAgent:       navigator.userAgent
    };

    var response = await postWithRetry(API_URL + '/attendance/sign', signatureData, 2);

    // FIX : Un seul appel response.json()
    var result = null;
    try {
      result = await response.json();
    } catch (_) {
      result = {};
    }

    if (!response.ok) {
      throw new Error(result.message || (response.status === 413 ? 'Signature trop lourde.' : 'Erreur serveur.'));
    }

    if (result.duplicate) {
      console.log('ℹ️ Signature déjà enregistrée — pas de doublon créé');
    }

    // FIX : Marquer la signature comme soumise AVANT showSuccess
    monNomComplet = prenomVal + ' ' + nomVal.toUpperCase();
    signatureSoumise = true;

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
  return new Promise(function(resolve) {
    if (!navigator.geolocation) {
      resolve({ coords: { latitude: null, longitude: null } });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      function() { resolve({ coords: { latitude: null, longitude: null } }); },
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
  var selApp = document.getElementById('apprenant-select');
  if (selApp) selApp.disabled = true;
  clearBtn.disabled = true;
  submitBtn.disabled = true;
  signaturePad.off();
}
