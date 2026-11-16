# API del aula (cuentas e inscripciones)

FastAPI + PostgreSQL. Registro de estudiantes, sesión de servidor revocable e inscripción al curso `course-arduino`. Frontend: `aula/`. No desplegado; el Compose de esta carpeta es **solo para desarrollo local**.

## Dependencias (versiones fijadas)

`requirements.txt` (directas) y `requirements.lock` (todas, `pip freeze` en `python:3.12-slim-bookworm`): FastAPI 0.163.1 (MIT), Uvicorn 0.54.0 (BSD-3), psycopg 3.3.9 y psycopg-pool 3.3.3 (LGPL-3), argon2-cffi 25.1.0 (MIT), Pydantic 2.14.3 (MIT), email-validator 2.4.0 (Unlicense). Pruebas: pytest 9.2.0 (MIT), httpx 0.28.1 (BSD-3). Imágenes fijadas por digest: `python:3.12-slim-bookworm`, `postgres:16.6-alpine`, `nginx:1.27-alpine`.

## API (`/api/aula`, mismo origen)

| Método y ruta | Sesión | CSRF | Descripción |
|---|---|---|---|
| `GET /salud` | — | — | `{"ok": true}` si hay base de datos |
| `POST /registro` `{nombre, correo, clave}` | — | origen | Crea **estudiante** y abre sesión. 201 · 409 correo existente · 422 · 429 |
| `POST /sesion` `{correo, clave}` | — | origen | Inicia sesión. 200 · 401 · 429 (`Retry-After`) |
| `GET /sesion` | sí | — | `{usuario, csrf}` |
| `DELETE /sesion` | sí | sí | Revoca la sesión en el servidor. 204 |
| `GET /cursos` | — | — | Catálogo activo |
| `GET /mis-cursos` | sí | — | Cursos del estudiante de la sesión |
| `POST /inscripciones` `{curso_id}` | sí | sí | 201 nueva · 200 ya existía · 404 curso inexistente |
| `GET /borradores/{leccion}` | sí | — | `{borrador: {codigo, version, actualizado_en} \| null}` del estudiante de la sesión. 403 sin inscripción · 404 lección desconocida |
| `PUT /borradores/{leccion}` `{codigo, version_base}` | sí | sí | Guarda el borrador (≤ 12 000 caracteres, cuerpo ≤ 16 KB). `version_base` = versión conocida (`null` si no había copia); si otro navegador guardó antes responde 409 con la versión actual y no sobrescribe |

| `GET /compilador/salud` | sí + inscripción | — | Estado del compilador existente. 503 si no responde |
| `POST /compilar` `{codigo, placa?}` | sí + inscripción | sí | Reenvía al compilador existente y devuelve su respuesta. 429 límite por estudiante o compilación en curso · 503 ocupado/no disponible (`Retry-After`) · 504 tiempo agotado |

Compilación (migración `0003_compilaciones.sql`): la API usa el servicio `services/compilador-arduino` ya instalado por su socket Unix (`AULA_COMPILADOR_SOCKET`; carpeta montada en solo lectura y grupo del socket). No crea otro compilador ni cambia su aislamiento. Límites (variables `AULA_COMPILAR_*`): 1 compilación del aula a la vez (deja turno a los laboratorios), 4 en espera hasta 8 s, 45 s de respuesta, y por estudiante (no por sesión) 1 en curso, 6 por minuto y 60 por hora. Solo se registra la hora de cada compilación; ni el código ni los resultados. Compilar o superar el reto en el navegador no queda registrado como aprobación en el servidor.

Borradores (migración `0002_borradores.sql`): un borrador por estudiante y lección (`arduino-led-serie`, curso `course-arduino`). La identidad sale siempre de la sesión; no hay parámetros de usuario. Guardar código no aprueba retos: el progreso del reto sigue siendo local del navegador y no es un certificado. En el laboratorio, el guardado local sigue siendo el respaldo: si la cuenta y el navegador tienen versiones distintas, el estudiante elige cuál usar y la otra queda en `backupCode` del almacenamiento local.

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

¡La base de pruebas se vacía! Prueba de navegador (desde la raíz, con el Compose levantado): `AULA_REINICIO=1 node tests/e2e/aula.e2e.mjs`. Borrador en la cuenta: `AULA_SITIO=http://127.0.0.1:8180 node tests/e2e/aula-borrador.e2e.mjs`. Recorrido completo con compilación real (necesita el compilador): `AULA_SITIO=… node tests/e2e/aula-compilar.e2e.mjs` (`AULA_PARAR_COMPILADOR=1` también detiene y rearranca el compilador; solo en pruebas). Cada una registra 3 cuentas; respeta `AULA_MAX_REGISTROS_IP`.
