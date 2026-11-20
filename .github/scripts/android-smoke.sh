#!/usr/bin/env bash
# Roda dentro do emulador (android-emulator-runner): instala o APK, abre o app,
# confere que o processo segue vivo e captura a tela. Uso: android-smoke.sh <apk>
set -u
apk="$1"
pkg=io.github.joaogabrielot.nexocheck
status=0

adb install -r "$apk" || status=1
if [ "$status" -eq 0 ]; then
  adb shell monkey -p "$pkg" -c android.intent.category.LAUNCHER 1 || status=1
  sleep 25
  if [ -z "$(adb shell pidof "$pkg" | tr -d '\r')" ]; then
    echo "O app não está em execução depois de 25 s."
    adb logcat -d -t 300 | tail -n 200
    status=1
  fi
fi
# A captura sai mesmo quando o app falha, para facilitar o diagnóstico.
adb exec-out screencap -p > android-smoke.png
exit "$status"
