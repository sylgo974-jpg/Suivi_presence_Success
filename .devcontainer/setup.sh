#!/bin/bash

# Script de setup automatique pour GitHub Codespaces
# Ce script s'exécute automatiquement à la création du Codespace

echo "🚀 Démarrage du setup Suivi Presence Success..."
echo ""

# Vérifier Node.js
echo "🔍 Vérification de Node.js..."
node --version
npm --version
echo ""

# Installer les dépendances backend
echo "📦 Installation des dépendances backend..."
cd backend
npm install
echo ""

echo "✅ Setup terminé !"
echo ""
echo "💡 Pour remplir Google Sheets avec les données :"
echo "   node scripts/populate-ressources.js"
echo ""
echo "💡 Pour démarrer le serveur local :"
echo "   npm start"
echo ""
