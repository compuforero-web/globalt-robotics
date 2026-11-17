# Servicio de compilación Arduino Nano para GLOBALT Robotics (solo compila; no ejecuta programas).
FROM ubuntu:24.04@sha256:73b999393d07f2bf65a40373778a44dc9a6d54ad7718d29247d8ff9413c4d6a8 AS nucleo
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      gcc-avr avr-libc binutils-avr git ca-certificates && rm -rf /var/lib/apt/lists/*
# ArduinoCore-avr 1.8.6 (LGPL-2.1), fijado por commit.
ARG NUCLEO_COMMIT=42fa4a1ea1b1b11d1cc0a60298e529d37f9d14bd
RUN git clone --depth 1 --branch 1.8.6 https://github.com/arduino/ArduinoCore-avr /src/core \
 && test "$(git -C /src/core rev-parse HEAD)" = "$NUCLEO_COMMIT"
COPY build-core.sh /usr/local/bin/build-core.sh
RUN sh /usr/local/bin/build-core.sh /src/core /opt/nucleo-nano \
 && cp /usr/share/common-licenses/LGPL-2.1 /opt/nucleo-nano/LICENSE-ArduinoCore-avr-LGPL-2.1.txt
# Librería oficial Servo 1.3.0 (arduino-libraries/Servo, LGPL-2.1), fijada por versión y commit. Solo se compila su
# implementación AVR y se copian Servo.h y avr/ServoTimers.h (ver build-servo.sh). La descarga ocurre al construir;
# el contenedor del servicio sigue sin red.
ARG SERVO_VERSION=1.3.0
ARG SERVO_COMMIT=2862ad9864d0dda5669b264857deafbba624940d
RUN git clone --depth 1 --branch "$SERVO_VERSION" https://github.com/arduino-libraries/Servo /src/servo \
 && test "$(git -C /src/servo rev-parse HEAD)" = "$SERVO_COMMIT" \
 && grep -qx "version=$SERVO_VERSION" /src/servo/library.properties
COPY build-servo.sh /usr/local/bin/build-servo.sh
RUN sh /usr/local/bin/build-servo.sh /src/servo /opt/nucleo-nano \
 && grep -q "commit $SERVO_COMMIT" /opt/nucleo-nano/servo/VERSION

FROM ubuntu:24.04@sha256:73b999393d07f2bf65a40373778a44dc9a6d54ad7718d29247d8ff9413c4d6a8
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      gcc-avr avr-libc binutils-avr python3 util-linux && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin compilador
COPY --from=nucleo /opt/nucleo-nano /opt/nucleo-nano
COPY server.py /opt/compilador/server.py
ENV COMPILADOR_NUCLEO=/opt/nucleo-nano PYTHONDONTWRITEBYTECODE=1 TMPDIR=/tmp
USER 10001:10001
CMD ["python3", "/opt/compilador/server.py"]
