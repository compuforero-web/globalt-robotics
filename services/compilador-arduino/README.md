# Servicio de compilación Arduino (GLOBALT)

Compila C++ de Arduino para **Arduino Nano (ATmega328P, 16 MHz)** y devuelve un HEX. **Solo compila**: nunca ejecuta el programa del estudiante. La ejecución es una emulación en el navegador (`games/laboratorio-arduino`, avr8js).

No está desplegado. Este directorio no se publica en la web (`deploy/linux/update.py` solo copia `assets`, `styles`, `src`, `games`, `data`). Mientras no exista, el laboratorio muestra «Servicio de compilación pendiente».

## Componentes y licencias

| Componente | Versión | Licencia | Origen |
|---|---|---|---|
| Ubuntu (imagen base) | 24.04, fijada por digest | varias (paquetes Debian/Ubuntu) | Docker Hub `ubuntu` |
| gcc-avr / binutils-avr / avr-libc | 7.3.0 / Ubuntu 24.04 | GPL-3 (compilador) · licencia BSD modificada (avr-libc) | apt de Ubuntu |
| ArduinoCore-avr | 1.8.6, commit `42fa4a1e…` | LGPL-2.1 | github.com/arduino/ArduinoCore-avr |
| `server.py` | — | código de GLOBALT, solo biblioteca estándar de Python 3 | este repositorio |

El HEX enlaza el núcleo Arduino (LGPL-2.1), como hace el IDE de Arduino. Se copia el texto de la LGPL en la imagen (`/opt/nucleo-nano/`).

## API (mismo origen, detrás del proxy en `/api/arduino/`)

`GET /api/arduino/salud` → `200 {"ok": true, "version": {...}}` o `503` si falta el núcleo.

`POST /api/arduino/compilar` con `Content-Type: application/json`:

```json
{ "placa": "nano", "codigo": "void setup() {}\nvoid loop() {}" }
```

Respuesta `200` (también cuando el código tiene errores o lo rechaza el control decisivo, con un único diagnóstico genérico y sin salida del compilador):

```json
{
  "ok": false,
  "diagnosticos": [{ "linea": 3, "columna": 1, "tipo": "error", "mensaje": "expected ';' before '}' token" }],
  "salida": "sketch.ino:3:1: error: …   (salida original de avr-gcc, sin rutas internas)",
  "hex": ":100000000C94…   (solo si ok)",
  "memoria": { "flash": 2404, "flashMax": 30720, "ram": 188, "ramMax": 2048 },
  "version": { "placa": "…", "compilador": "avr-gcc 7.3.0", "nucleo": "ArduinoCore-avr 1.8.6" },
  "duracionMs": 60
}
```

Errores: `400` (JSON o código no válido, directivas no permitidas por el filtro de texto), `413` (más de 64 KB), `415`, `429` (cola llena), `503` (ocupado más de 10 s).

Las líneas de los diagnósticos corresponden al código del estudiante (`#line 1 "sketch.ino"`). Como el IDE de Arduino, el servicio añade `#include <Arduino.h>` y declara antes del programa las funciones de nivel superior con tipos básicos.

## Límites y aislamiento

El aislamiento lo da el **contenedor**; los filtros de código solo reducen lo que puede intentarse dentro de él y no sustituyen esos límites.

- Contenedor `network_mode: none`: sin red de ningún tipo. Atiende por un **socket Unix** en un volumen.
- `init: true`: un init mínimo recoge los procesos huérfanos tras un timeout (sin él quedarían zombis que agotan `pids_limit`).
- Sistema de archivos de solo lectura; `/tmp` en tmpfs de 64 MB con `noexec`. La imagen no contiene secretos ni variables sensibles.
- Usuario sin privilegios (UID 10001), `cap_drop: ALL`, `no-new-privileges`, sin socket de Docker.
- `mem_limit` 768 MB, `cpus` 1, `pids_limit` 64.
- Por paso del compilador: `prlimit` aplica CPU = tiempo restante, 1 GB de memoria virtual, 16 MB por archivo, 64 descriptores y sin volcados; el proceso se lanza con `start_new_session` (sin `preexec_fn`, que no es seguro en un servidor multihilo) y al vencer los 20 s de reloj se mata a **todo su grupo de procesos**.
- Salida: se lee mientras se genera; se conservan 64 KB (con aviso «salida recortada») y, si supera 4 MB, se detiene el proceso.
- Carpeta temporal propia por compilación que se borra siempre.
- Concurrencia: 2 compilaciones a la vez, hasta 8 en espera; el resto recibe 429.

### Lectura de archivos y ensamblador (dos capas)

1. **Filtro de texto** (`validar`, mensaje rápido): trabaja sobre una forma canónica (une líneas con `\` final, convierte el dígrafo `%:` en `#`, quita comentarios). Solo admite `#include <nombre.h>` o `"nombre.h"` sin rutas ni macros; rechaza `#import`, `#include_next`, `#embed`, `#pragma GCC dependency/system_header/poison`, `_Pragma`, `__has_include`, `asm`/`__asm__` y las directivas de GNU as `.incbin`, `.include`, `.macro`, `.irp`, `.rept`, `.altmacro`.
2. **Control decisivo** (`compilar`): se preprocesa con `avr-g++ -E` y, antes de devolver ningún mensaje, se comprueba que todos los archivos de las marcas de línea y de los diagnósticos estén dentro de las carpetas de cabeceras de avr-gcc o del núcleo (rutas reales, `realpath`). Después se compila ese texto ya revisado a ensamblador (`-S`) y se rechaza si el `.s` generado contiene las directivas anteriores (así se detectan `asm` formado con `##`, escapes `\x..`, cadenas concatenadas o inyecciones en `section(...)`). Solo entonces se ensambla y se enlaza.

Consecuencia conocida: un texto como `Serial.println(".incbin")` también se rechaza.

## Desarrollo local

```bash
cd services/compilador-arduino
docker compose build
mkdir -p run && sudo chown 10001 run && chmod 770 run
COMPILADOR_GID=$(id -g) docker compose up -d
cd ../..
COMPILADOR_SOCKET=$PWD/services/compilador-arduino/run/compilador.sock npm start
```

Abrir `http://localhost:8080/games/laboratorio-arduino/index.html`. Sin `COMPILADOR_SOCKET`, el servidor de desarrollo responde «Servicio de compilación pendiente».

Sin Docker (solo desarrollo, compila en el equipo local, no ejecuta programas): instalar `gcc-avr avr-libc binutils-avr`, generar el núcleo con `./build-core.sh <ArduinoCore-avr-1.8.6> /tmp/nucleo-nano` y lanzar `COMPILADOR_NUCLEO=/tmp/nucleo-nano python3 server.py` (escucha en `127.0.0.1:8090`; usar `COMPILADOR_URL=http://127.0.0.1:8090 npm start`).

Pruebas: `COMPILADOR_NUCLEO=/tmp/nucleo-nano python3 -m unittest tests.test_laboratorio -v` (la compilación real se omite sin avr-gcc).

## Pendiente para la instalación en Linux (IA principal)

No realizado en esta entrega; no se tocaron `deploy/`, nginx, puertos, temporizadores ni servicios.

1. Construir la imagen en el servidor (`docker compose build`) y crear el directorio del socket, p. ej. `/run/globalt-compilador`, propiedad de UID 10001 y del grupo de nginx (`COMPILADOR_GID`), modo 0770. Ajustar el volumen `./run` de `compose.yaml` a esa ruta.
2. Arrancarlo con un servicio propio (systemd o `restart: unless-stopped`), independiente del temporizador de publicación.
3. Añadir a nginx, dentro del `server` existente:

```nginx
limit_req_zone $binary_remote_addr zone=compilador:1m rate=20r/m;   # en el bloque http
location /api/arduino/ {
    limit_req zone=compilador burst=5 nodelay;
    client_max_body_size 64k;
    proxy_read_timeout 40s;
    proxy_pass http://unix:/run/globalt-compilador/compilador.sock;
}
```

4. Comprobar: `curl http://localhost/api/arduino/salud` y la prueba de extremo a extremo `tests/e2e/laboratorio.e2e.mjs`.
5. Opcional: añadir `/api/arduino/salud` a las comprobaciones de salud solo después de instalarlo (hoy `update.py` no lo exige, para no bloquear despliegues).
