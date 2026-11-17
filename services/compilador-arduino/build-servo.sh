#!/bin/sh
# Precompila la librería oficial Servo (arduino-libraries/Servo) para Arduino Nano (ATmega328P, 16 MHz).
# Uso: build-servo.sh <Servo> <núcleo ya construido por build-core.sh>
# Resultado, dentro del núcleo:
#   servo/servo.a                       solo el código AVR (src/avr/Servo.cpp)
#   servo/include/Servo.h               cabecera pública
#   servo/include/avr/ServoTimers.h     única cabecera de arquitectura que usa el Nano
#   servo/VERSION                       versión y commit (lo informa /salud)
#   LICENSE-Servo-LGPL-2.1.txt          licencia original de la librería
# No copia ejemplos, documentación ni las implementaciones de otras arquitecturas: el compilador solo podrá
# incluir esas dos cabeceras.
set -eu
SRC="$1"; NUCLEO="$2"
VERSION=$(sed -n 's/^version=//p' "$SRC/library.properties")
COMMIT=$(git -C "$SRC" rev-parse HEAD)
OUT="$NUCLEO/servo"
COMMON="-c -Os -w -mmcu=atmega328p -DF_CPU=16000000L -DARDUINO=10819 -DARDUINO_AVR_NANO -DARDUINO_ARCH_AVR -ffunction-sections -fdata-sections"
mkdir -p "$OUT/obj" "$OUT/include/avr"
cp "$SRC/src/Servo.h" "$OUT/include/Servo.h"
cp "$SRC/src/avr/ServoTimers.h" "$OUT/include/avr/ServoTimers.h"
avr-g++ $COMMON -std=gnu++11 -fpermissive -fno-exceptions -fno-threadsafe-statics \
  -I"$NUCLEO/include" -I"$NUCLEO/include/variant" -I"$OUT/include" \
  "$SRC/src/avr/Servo.cpp" -o "$OUT/obj/Servo.cpp.o"
avr-gcc-ar rcs "$OUT/servo.a" "$OUT/obj/Servo.cpp.o"
rm -rf "$OUT/obj"
cp "$SRC/LICENSE.txt" "$NUCLEO/LICENSE-Servo-LGPL-2.1.txt"
printf 'Servo %s (arduino-libraries/Servo, commit %s)\n' "$VERSION" "$COMMIT" > "$OUT/VERSION"
echo "Servo $VERSION listo en $OUT"
