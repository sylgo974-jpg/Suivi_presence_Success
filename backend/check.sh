#!/bin/bash

# Script de vérification de l'environnement
# Usage: bash check.sh

echo "🔍 VÉRIFICATION DE L'ENVIRONNEMENT"
echo "=========================================="
echo ""

# 1. Vérifier Node.js
echo "1️⃣ Vérification de Node.js..."
if command -v node &> /dev/null
then
    NODE_VERSION=$(node --version)
    echo "   ✅ Node.js installé : $NODE_VERSION"
else
    echo "   ❌ Node.js NON installé"
    exit 1
fi
echo ""

# 2. Vérifier npm
echo "2️⃣ Vérification de npm..."
if command -v npm &> /dev/null
then
    NPM_VERSION=$(npm --version)
    echo "   ✅ npm installé : $NPM_VERSION"
else
    echo "   ❌ npm NON installé"
    exit 1
fi
echo ""

# 3. Vérifier node_modules
echo "3️⃣ Vérification des dépendances..."
if [ -d "node_modules" ]; then
    echo "   ✅ node_modules existe"
    
    # Compter les packages
    PACKAGE_COUNT=$(ls -1 node_modules | wc -l)
    echo "   📦 $PACKAGE_COUNT packages installés"
else
    echo "   ⚠️  node_modules NON trouvé"
    echo "   🔧 Exécutez : npm install"
fi
echo ""

# 4. Vérifier les fichiers importants
echo "4️⃣ Vérification des fichiers..."

FILES=(
    "package.json"
    "index.js"
    "config/sheets.js"
    "config/resources.js"
    "routes/attendance.js"
    "routes/resources.js"
    "scripts/populate-ressources.js"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "   ✅ $file"
    else
        echo "   ❌ $file MANQUANT"
    fi
done
echo ""

# 5. Vérifier les credentials Google
echo "5️⃣ Vérification des credentials Google..."
if [ -f "config/suivi-pointage-486908-ca78da824d02.json" ]; then
    echo "   ✅ Fichier credentials présent"
elif [ -n "$GOOGLE_CREDENTIALS" ]; then
    echo "   ✅ Variable GOOGLE_CREDENTIALS définie"
else
    echo "   ⚠️  Credentials Google non trouvés"
    echo "   🔑 Ajoutez le fichier JSON dans config/ ou définissez GOOGLE_CREDENTIALS"
fi
echo ""

# 6. Résumé
echo "=========================================="
echo "✨ Vérification terminée !"
echo ""
echo "🚀 Pour remplir Google Sheets :"
echo "   node scripts/populate-ressources.js"
echo ""
echo "🌍 Pour démarrer le serveur :"
echo "   npm start"
echo ""
