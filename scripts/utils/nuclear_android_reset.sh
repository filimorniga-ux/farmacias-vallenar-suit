#!/bin/bash
# nuclear_android_reset.sh
# Script de limpieza profunda para errores fantasma de Android/Gradle

echo "💣 INICIANDO LIMPIEZA NUCLEAR DE ANDROID..."

# 1. Matar demonios de Gradle que pueden tener bloqueos
echo "🔪 Matando procesos Java/Gradle..."
pkill -f 'gradle' || true
pkill -f 'java' || true

# 2. Limpiar build folders locales
echo "🧹 Limpiando build folders..."
rm -rf android/.gradle
rm -rf android/.idea
rm -rf android/app/build
rm -rf android/build
rm -rf android/capacitor-cordova-android-plugins

# 3. Limpiar caché global de Gradle (opcional pero recomendado si falla todo)
# echo "🧹 Limpiando caché global de Gradle..."
# rm -rf ~/.gradle/caches

# 4. Sincronizar Capacitor de nuevo
echo "🔄 Re-sincronizando Capacitor..."
npx cap sync android

# 5. Limpiar proyecto desde Gradle wrapper
echo "cleanProject..."
cd android
./gradlew clean
cd ..

echo "✅ LIMPIEZA COMPLETADA."
echo "👉 AHORA: Cierra VS Code completamente y vuélvelo a abrir."
