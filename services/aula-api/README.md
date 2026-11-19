# API del aula (cuentas e inscripciones)

FastAPI + PostgreSQL. Registro de adultos con verificación de correo y autorizaciones (ver [docs/AULA_REGISTRO_ADULTOS.md](../../docs/AULA_REGISTRO_ADULTOS.md)), sesión de servidor revocable e inscripción al curso `course-arduino`. Frontend: `aula/`. No desplegado; el Compose de esta carpeta es **solo para desarrollo local**.

## Dependencias (versiones fijadas)

`requirements.txt` (directas) y `requirements.lock` (todas, `pip freeze` en `python:3.12-slim-bookworm`): FastAPI 0.163.1 (MIT), Uvicorn 0.54.0 (BSD-3), psycopg 3.3.9 y psycopg-pool 3.3.3 (LGPL-3), argon2-cffi 25.1.0 (MIT), Pydantic 2.14.3 (MIT), email-validator 2.4.0 (Unlicense). Pruebas: pytest 9.2.0 (MIT), httpx 0.28.1 (BSD-3). Imágenes fijadas por digest: `python:3.12-slim-bookworm`, `postgres:16.6-alpine`, `nginx:1.27-alpine`.

## API (`/api/aula`, mismo origen)

| Método y ruta | Sesión | CSRF | Descripción |
|---|---|---|---|
| `GET /salud` | — | — | `{"ok": true}` si hay base de datos |
| `GET /config` | — | — | `{registro_abierto, recuperacion, documentos: {terminos, datos}}` (registro abierto solo con decisión, correo y ambos documentos vigentes) |
| `GET /documentos/{terminos\|datos}/{version}` | — | — | Texto exacto, finalidad, `sha256` y vigencia. 404 si no existe (o es de prueba sin permiso) |
| `POST /registro` `{nombre, correo, clave, mayor_de_edad: true, terminos, datos, curso?}` | — | origen | Solo adultos y con las versiones vigentes exactas. **No crea la cuenta**: envía el enlace. 202 (misma respuesta exista o no el correo) · 403 cerrado · 409 versiones cambiadas · 422 · 429 · 503 fallo del correo (no se guarda nada) |
| `POST /cuenta/reenviar` `{correo}` | — | origen | Enlace nuevo para un alta pendiente (el anterior deja de servir). 202 siempre · 429 por IP |
| `POST /cuenta/verificar` `{token, clave}` | — | origen | Crea la cuenta con la contraseña elegida, guarda la evidencia y abre sesión. 200 `{usuario, csrf, curso_id, pendientes}` · 401 · 409 · 410 vencido/usado · 429 |
| `POST /cuenta/recuperar` `{correo, curso?}` | — | origen | Enlace de recuperación. 202 siempre (envío tras responder) · 429 · 503 sin correo configurado |
| `POST /cuenta/restablecer` `{token, clave}` | — | origen | Nueva contraseña, cierra las demás sesiones y abre una. 200 · 410 · 422 · 429 |
| `POST /cuenta/autorizar` `{terminos?, datos?}` | sí | sí | Acepta las versiones vigentes pendientes (cuentas anteriores o versión nueva). 200 `{pendientes: []}` · 409 |
| `POST /sesion` `{correo, clave}` | — | origen | Inicia sesión. 200 `{usuario, csrf, pendientes}` · 401 · 429 (`Retry-After`) |
| `GET /sesion` | sí | — | `{usuario, csrf, pendientes}`. Con `pendientes`, las rutas de cursos, borradores, progreso y compilación responden 403 |
| `DELETE /sesion` | sí | sí | Revoca la sesión en el servidor. 204 |
| `GET /cursos` | — | — | Catálogo activo |
| `GET /mis-cursos` | sí | — | Cursos del estudiante de la sesión. Los cursos con lecciones incluyen `progreso: {evaluacion: 'navegador', ultima, lecciones: [{leccion_id, estado, paso, vistos, visto_en, completada_en, superada_en}]}` |
| `POST /mis-cursos` `{leccion_id, paso, vistos?, visto_en?, completada?}` | sí | sí | Registra avance **declarativo** de una lección (403 sin inscripción · 404 lección desconocida · 422 campos extra o fuera de rango). Fusiona: pasos vistos = unión, reto superado permanente, paso = visita más reciente; repetir es idempotente |
| `POST /inscripciones` `{curso_id}` | sí | sí | 201 nueva · 200 ya existía · 404 curso inexistente |
| `GET /borradores/{leccion}` | sí | — | `{borrador: {codigo, version, actualizado_en} \| null}` del estudiante de la sesión. 403 sin inscripción · 404 lección desconocida |
| `PUT /borradores/{leccion}` `{codigo, version_base}` | sí | sí | Guarda el borrador (≤ 12 000 caracteres, cuerpo ≤ 16 KB). `version_base` = versión conocida (`null` si no había copia); si otro navegador guardó antes responde 409 con la versión actual y no sobrescribe |

| `GET /compilador/salud` | sí + inscripción | — | Estado del compilador existente. 503 si no responde |
| `POST /compilar` `{codigo, placa?}` | sí + inscripción | sí | Reenvía al compilador existente y devuelve su respuesta. 429 límite por estudiante o compilación en curso · 503 ocupado/no disponible (`Retry-After`) · 504 tiempo agotado |

Compilación (migración `0003_compilaciones.sql`): la API usa el servicio `services/compilador-arduino` ya instalado por su socket Unix (`AULA_COMPILADOR_SOCKET`; carpeta montada en solo lectura y grupo del socket). No crea otro compilador ni cambia su aislamiento. Límites (variables `AULA_COMPILAR_*`): 1 compilación del aula a la vez (deja turno a los laboratorios), 4 en espera hasta 8 s, 45 s de respuesta, y por estudiante (no por sesión) 1 en curso, 6 por minuto y 60 por hora. Solo se registra la hora de cada compilación; ni el código ni los resultados. Compilar o superar el reto en el navegador no queda registrado como aprobación en el servidor.

Borradores (migración `0002_borradores.sql`): un borrador por estudiante y lección (`arduino-led-serie`, curso `course-arduino`). La identidad sale siempre de la sesión; no hay parámetros de usuario. Guardar código no aprueba retos ni registra progreso. En el laboratorio, el guardado local sigue siendo el respaldo: si la cuenta y el navegador tienen versiones distintas, el estudiante elige cuál usar y la otra queda en `backupCode` del almacenamiento local.

- Cookie `aula_sesion`: aleatoria (256 bits), `HttpOnly`, `SameSite=Strict`, `Path=/api/aula`, `Secure` salvo `AULA_COOKIE_SEGURA=false` (solo desarrollo HTTP). En la base solo se guarda su SHA-256.
- Caducidad: 120 min de inactividad y 168 h como máximo (configurable). El cierre revoca en el servidor.
- CSRF: token por sesión en la cabecera `X-CSRF-Token` (el cliente lo guarda solo en memoria). Toda petición que modifica datos exige `Origin`/`Referer` en `AULA_ORIGENES` y cuerpo JSON (≤ 16 KB).
- Intentos: 5 fallos por correo y 30 por IP en 15 min; 10 registros por IP en 15 min.
- Ninguna ruta recibe un identificador de usuario: todo se resuelve desde la sesión. Campos extra (p. ej. `rol`) → 422.

## Desarrollo local

```bash
cd services/aula-api
cp .env.example .env && sed -i "s/^AULA_DB_CLAVE=.*/AULA_DB_CLAVE=$(openssl rand -hex 24)/" .env
docker compose up -d --build        # db + api + nginx en http://127.0.0.1:8180/aula/
docker compose down                 # añade -v para borrar la base de desarrollo
```

Las migraciones (`migrations/*.sql`) se aplican al arrancar la API (`python -m app.migraciones`), una sola vez, con suma de control y bloqueo consultivo; una migración aplicada que cambie detiene el arranque.

## Pruebas

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
docker run -d --name aula-test-db -e POSTGRES_DB=aula_test -e POSTGRES_USER=aula \
  -e POSTGRES_PASSWORD=solo-pruebas -p 127.0.0.1:55432:5432 postgres:16.6-alpine
AULA_TEST_DATABASE_URL=postgresql://aula:solo-pruebas@127.0.0.1:55432/aula_test .venv/bin/python -m pytest -q
```

El Compose de desarrollo incluye un **buzón SMTP de pruebas** (`dev/buzon_pruebas.py`, mensajes en `dev/buzon/*.eml`, nunca reenvía; `dev/buzon/FALLAR` simula una caída) y carga textos **de prueba** (`documentos/prueba/`). Para muchas altas seguidas, sube `AULA_MAX_REGISTROS_IP` y `AULA_MAX_CORREOS_IP` en `.env`.

¡La base de pruebas se vacía! Prueba de navegador (desde la raíz, con el Compose levantado): `AULA_REINICIO=1 node tests/e2e/aula.e2e.mjs`. Borrador en la cuenta: `AULA_SITIO=http://127.0.0.1:8180 node tests/e2e/aula-borrador.e2e.mjs`. Recorrido completo con compilación real (necesita el compilador): `AULA_SITIO=… node tests/e2e/aula-compilar.e2e.mjs` (`AULA_PARAR_COMPILADOR=1` también detiene y rearranca el compilador; solo en pruebas). Las pruebas de navegador crean cuentas con el alta completa (registro + enlace del buzón, `tests/e2e/cuenta-prueba.mjs`); respetan `AULA_MAX_REGISTROS_IP`. Registro de adultos: `AULA_FASE=cerrado|abierto node tests/e2e/registro-adultos.e2e.mjs`.

Progreso (migración `0004_progreso.sql`, ver `docs/AULA_PROGRESO.md`): última lección visitada, paso y retos superados por estudiante y lección. **Es declarativo**: el evaluador del reto se ejecuta en el navegador y el servidor no puede verificarlo; no usar para certificados, notas ni permisos. Va por `/api/aula/mis-cursos` porque el nginx público solo deja pasar una lista cerrada de rutas.
