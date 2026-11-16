#!/bin/sh
# Precompila el núcleo Arduino AVR para Arduino Nano (ATmega328P, 16 MHz) en core.a.
# Uso: build-core.sh <ArduinoCore-avr> <destino>
set -eu
SRC="$1"; OUT="$2"
CORE="$SRC/cores/arduino"; VARIANT="$SRC/variants/eightanaloginputs"
COMMON="-c -Os -w -mmcu=atmega328p -DF_CPU=16000000L -DARDUINO=10819 -DARDUINO_AVR_NANO -DARDUINO_ARCH_AVR -ffunction-sections -fdata-sections -I$CORE -I$VARIANT"
mkdir -p "$OUT/obj" "$OUT/include/variant" "$OUT/include/standard"
for f in "$CORE"/*.c; do avr-gcc $COMMON -std=gnu11 "$f" -o "$OUT/obj/$(basename "$f").o"; done
for f in "$CORE"/*.cpp; do avr-g++ $COMMON -std=gnu++11 -fpermissive -fno-exceptions -fno-threadsafe-statics "$f" -o "$OUT/obj/$(basename "$f").o"; done
for f in "$CORE"/*.S; do avr-gcc $COMMON -x assembler-with-cpp "$f" -o "$OUT/obj/$(basename "$f").o"; done
avr-gcc-ar rcs "$OUT/core.a" "$OUT"/obj/*.o
rm -rf "$OUT/obj"
cp -r "$CORE"/. "$OUT/include/"
cp "$VARIANT/pins_arduino.h" "$OUT/include/variant/"
cp "$SRC/variants/standard/pins_arduino.h" "$OUT/include/standard/"
find "$OUT/include" -type f ! -name '*.h' ! -name 'new' -delete
echo "Núcleo listo en $OUT"
