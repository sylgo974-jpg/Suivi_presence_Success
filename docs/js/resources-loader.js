/**
 * Module de chargement dynamique des ressources (formateurs/apprenants)
 * depuis l'API backend
 */

const API_BASE_URL = 'https://suivi-presence-success.vercel.app'; // À adapter selon ton déploiement

/**
 * Charge toutes les formations et remplit le select
 */
async function loadFormations() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/resources/formations`);
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        
        const formations = await response.json();
        
        const select = document.getElementById('formation');
        
        if (!select) {
            console.warn('⚠️  Elément #formation non trouvé');
            return;
        }
        
        // Vider les options existantes (sauf la première)
        select.innerHTML = '<option value="">-- Sélectionner --</option>';
        
        // Ajouter les formations dynamiquement
        formations.forEach(formation => {
            const option = document.createElement('option');
            option.value = formation;
            option.textContent = formation;
            select.appendChild(option);
        });
        
        console.log(`✅ ${formations.length} formations chargées`);
        
    } catch (error) {
        console.error('❌ Erreur chargement formations:', error);
        
        // Fallback : garder la liste en dur si l'API échoue
        console.log('🔄 Utilisation de la liste par défaut');
    }
}

/**
 * Charge les formateurs pour une formation donnée
 * @param {string} formation - Nom de la formation
 * @param {string} jour - Jour de la semaine (optionnel)
 * @returns {Promise<string[]>} Liste des noms de formateurs
 */
async function loadFormateurs(formation, jour = null) {
    try {
        let url = `${API_BASE_URL}/api/resources/formateurs?formation=${encodeURIComponent(formation)}`;
        
        if (jour) {
            url += `&jour=${encodeURIComponent(jour)}`;
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        
        const formateurs = await response.json();
        
        console.log(`✅ ${formateurs.length} formateurs trouvés pour ${formation}`);
        
        return formateurs;
        
    } catch (error) {
        console.error('❌ Erreur chargement formateurs:', error);
        return [];
    }
}

/**
 * Charge les apprenants pour une formation donnée
 * @param {string} formation - Nom de la formation
 * @param {string} jour - Jour de la semaine (optionnel)
 * @returns {Promise<string[]>} Liste des noms d'apprenants
 */
async function loadApprenants(formation, jour = null) {
    try {
        let url = `${API_BASE_URL}/api/resources/apprenants?formation=${encodeURIComponent(formation)}`;
        
        if (jour) {
            url += `&jour=${encodeURIComponent(jour)}`;
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        
        const apprenants = await response.json();
        
        console.log(`✅ ${apprenants.length} apprenants trouvés pour ${formation}`);
        
        return apprenants;
        
    } catch (error) {
        console.error('❌ Erreur chargement apprenants:', error);
        return [];
    }
}

/**
 * Charge toutes les ressources filtrées (formateurs + apprenants)
 * @param {string} formation - Nom de la formation
 * @param {string} jour - Jour de la semaine (optionnel)
 * @returns {Promise<Object>} Objet avec formateurs et apprenants
 */
async function loadRessourcesFiltered(formation, jour = null) {
    try {
        let url = `${API_BASE_URL}/api/resources/filter?formation=${encodeURIComponent(formation)}`;
        
        if (jour) {
            url += `&jour=${encodeURIComponent(jour)}`;
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        
        console.log(`✅ Ressources chargées: ${data.total.formateurs} formateurs, ${data.total.apprenants} apprenants`);
        
        return data;
        
    } catch (error) {
        console.error('❌ Erreur chargement ressources filtrées:', error);
        return {
            formateurs: [],
            apprenants: [],
            total: { formateurs: 0, apprenants: 0 }
        };
    }
}

/**
 * Remplit un select avec une liste de noms
 * @param {string} selectId - ID du select à remplir
 * @param {string[]} noms - Liste des noms
 * @param {string} placeholder - Texte du placeholder
 */
function fillSelect(selectId, noms, placeholder = '-- Sélectionner --') {
    const select = document.getElementById(selectId);
    
    if (!select) {
        console.warn(`⚠️  Elément #${selectId} non trouvé`);
        return;
    }
    
    select.innerHTML = `<option value="">${placeholder}</option>`;
    
    noms.forEach(nom => {
        const option = document.createElement('option');
        option.value = nom;
        option.textContent = nom;
        select.appendChild(option);
    });
}

/**
 * Crée un datalist pour l'autocomplétion
 * @param {string} inputId - ID de l'input
 * @param {string[]} suggestions - Liste des suggestions
 */
function createDatalist(inputId, suggestions) {
    const input = document.getElementById(inputId);
    
    if (!input) {
        console.warn(`⚠️  Elément #${inputId} non trouvé`);
        return;
    }
    
    // Créer ou mettre à jour le datalist
    let datalist = document.getElementById(`${inputId}-list`);
    
    if (!datalist) {
        datalist = document.createElement('datalist');
        datalist.id = `${inputId}-list`;
        document.body.appendChild(datalist);
        input.setAttribute('list', datalist.id);
    }
    
    // Vider et remplir
    datalist.innerHTML = '';
    
    suggestions.forEach(suggestion => {
        const option = document.createElement('option');
        option.value = suggestion;
        datalist.appendChild(option);
    });
}

/**
 * Génère un rapport d'absences
 * @param {string} date - Date au format YYYY-MM-DD
 * @param {string} formation - Nom de la formation
 * @param {string} sessionCode - Code de session (optionnel)
 */
async function generateAbsenceReport(date, formation, sessionCode = null) {
    try {
        // 1. Récupérer les apprenants attendus
        const apprenantsAttendus = await loadApprenants(formation);
        
        // 2. Récupérer les signatures du jour
        let url = `${API_BASE_URL}/api/attendance/today?date=${date}`;
        if (sessionCode) {
            url += `&sessionCode=${sessionCode}`;
        }
        
        const response = await fetch(url);
        const signatures = await response.json();
        
        // 3. Extraire les noms des présents
        const apprenantsPresents = [...new Set(
            signatures.map(s => `${s.apprenantPrenom} ${s.apprenantNom}`)
        )];
        
        // 4. Identifier les absents
        const absents = apprenantsAttendus.filter(
            nom => !apprenantsPresents.some(present => 
                present.toLowerCase().includes(nom.toLowerCase()) ||
                nom.toLowerCase().includes(present.toLowerCase())
            )
        );
        
        console.log('\n📊 RAPPORT D\'ABSENCES');
        console.log('========================');
        console.log(`📅 Date: ${date}`);
        console.log(`🏫 Formation: ${formation}`);
        console.log(`👥 Attendus: ${apprenantsAttendus.length}`);
        console.log(`✅ Présents: ${apprenantsPresents.length}`);
        console.log(`❌ Absents: ${absents.length}`);
        console.log('\n🚫 Liste des absents:');
        absents.forEach((nom, index) => {
            console.log(`  ${index + 1}. ${nom}`);
        });
        console.log('========================\n');
        
        return {
            date,
            formation,
            attendus: apprenantsAttendus,
            presents: apprenantsPresents,
            absents: absents,
            stats: {
                nbAttendus: apprenantsAttendus.length,
                nbPresents: apprenantsPresents.length,
                nbAbsents: absents.length,
                tauxPresence: ((apprenantsPresents.length / apprenantsAttendus.length) * 100).toFixed(1) + '%'
            }
        };
        
    } catch (error) {
        console.error('❌ Erreur génération rapport:', error);
        return null;
    }
}

// Export des fonctions pour utilisation globale
if (typeof window !== 'undefined') {
    window.ResourcesLoader = {
        loadFormations,
        loadFormateurs,
        loadApprenants,
        loadRessourcesFiltered,
        fillSelect,
        createDatalist,
        generateAbsenceReport
    };
}
