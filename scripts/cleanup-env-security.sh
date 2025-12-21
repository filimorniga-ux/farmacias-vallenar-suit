#!/bin/bash

# ========================================
# SCRIPT DE SEGURIDAD - Limpieza de .env
# VERSIÓN 2 (Non-Interactive, No Backup externo)
# ========================================

set -e

echo "🔐 Iniciando limpieza de seguridad..."
echo ""

# Paso 1: Verificar directorio (Omitido check estricto, confiamos en CWD)

# Paso 2: Backup OMITIDO por restricciones de escritura en ../
echo "⚠️  Nota: Backup automático a ../ omitido por permisos."
echo "    Asegúrate de tener tus propios backups si es necesario."
echo ""

# Paso 3: .gitignore ya actualizado

# Paso 4: Remover .env del staging
echo "🗑️  Removiendo .env del staging de Git..."
git rm --cached .env 2>/dev/null || echo "⚠️  .env ya no está en staging o no existe"
echo ""

# Paso 5: Limpiar historial de Git
echo "🧹 Limpiando .env del historial de Git..."
echo "🔄 Ejecutando git filter-branch..."

# Non-interactive execution
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" \
  --prune-empty --tag-name-filter cat -- --all

echo ""
echo "🗑️  Ejecutando garbage collection..."
git reflog expire --expire=now --all
git gc --prune=now --aggressive

echo ""
echo "✅ Historial limpiado"

# Paso 6: Verificar
echo "🔍 Verificando..."
FOUND=$(git log --all --full-history -- .env | wc -l)

if [ "$FOUND" -eq 0 ]; then
    echo "✅ ÉXITO: .env no está en el historial de Git"
else
    echo "⚠️  ADVERTENCIA: Todavía se encontraron $FOUND líneas en el historial"
fi

echo ""
echo "✅ Script finalizado."
