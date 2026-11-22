#!/usr/bin/env bash
# Bouwt de Android-app (APK) van Rijken van de Vallei.
# Nodig: JDK 17+, Gradle 8.9+, Android SDK (ANDROID_HOME) met "platforms;android-35" en "build-tools;35.0.0".
# De sleutel (keystore/rijken.jks) wordt de eerste keer aangemaakt en staat NIET in git. Bewaar hem goed:
# een nieuwe sleutel = de oude app eerst verwijderen, en de nieuwe vingerafdruk in public/.well-known/assetlinks.json zetten.
set -euo pipefail
cd "$(dirname "$0")"
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
PASS="${RVDV_KEYSTORE_PASS:-rijken-van-de-vallei}"
mkdir -p keystore
if [ ! -f keystore/rijken.jks ]; then
  keytool -genkeypair -keystore keystore/rijken.jks -alias rijken -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$PASS" -keypass "$PASS" -dname "CN=Rijken van de Vallei"
fi
echo "sdk.dir=$ANDROID_HOME" > local.properties
GRADLE="${GRADLE:-$(command -v gradle || echo /opt/gradle/bin/gradle)}"
"$GRADLE" --no-daemon -q assembleRelease
cp app/build/outputs/apk/release/app-release.apk ../public/rijken-van-de-vallei.apk
echo "APK: public/rijken-van-de-vallei.apk"
echo "Vingerafdruk voor public/.well-known/assetlinks.json:"
keytool -list -v -keystore keystore/rijken.jks -storepass "$PASS" -alias rijken 2>/dev/null | grep -E "SHA256:" | sed 's/.*SHA256: //'
