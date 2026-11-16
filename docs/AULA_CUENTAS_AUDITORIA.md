# Aula: cuentas e inscripción — auditoría breve

Alcance: registro, acceso/cierre de sesión, «Mis cursos» e inscripción a `course-arduino` (`aula/`, `services/aula-api/`). Fecha: 2026-11-16. Revisión propia; no sustituye una auditoría externa.

## Controles implementados

- Contraseñas: Argon2id (argon2-cffi, 64 MiB, t=3, p=4), 10–128 caracteres, distinta del correo; rehash automático si cambian los parámetros. Máximo 4 cálculos Argon2 simultáneos por proceso.
- Sesiones de servidor: token aleatorio en cookie HttpOnly/SameSite=Strict/Secure; solo su SHA-256 en la base; revocación al cerrar; caducidad por inactividad y absoluta; purga de sesiones viejas.
- CSRF: token por sesión en cabecera + validación de `Origin`/`Referer` contra lista blanca + JSON obligatorio.
- Entradas: Pydantic con `extra='forbid'`; correo normalizado; nombre sin caracteres de control/bidireccionales; 422 sin devolver los valores recibidos; cuerpo ≤ 16 KB.
- SQL siempre parametrizado (psycopg 3). Restricciones en la base (`rol` por defecto `estudiante`, hash `$argon2id$`, inscripción con clave primaria compuesta).
- Autorización: ninguna ruta acepta identificadores de usuario; el registro inserta `rol='estudiante'` literal; no existen rutas administrativas.
- Acceso: mensaje idéntico para correo inexistente y contraseña incorrecta, con hash ficticio para igualar tiempos; límites por correo, por IP y de registros por IP.
- Frontend sin localStorage/sessionStorage/cookies accesibles; el CSRF solo en memoria; el laboratorio solo se enlaza si existe en el servidor.
- Contenedor de la API: solo lectura, usuario sin privilegios, `cap_drop: ALL`; Postgres sin puertos publicados.

## Problemas encontrados y corregidos durante la revisión

1. Un 401 al iniciar sesión se mostraba como «sesión caducada» en lugar de «credenciales incorrectas» (frontend).
2. Argon2 sin límite de concurrencia: una ráfaga podía agotar memoria → semáforo de 4.
3. Las sesiones caducadas no se purgaban → limpieza al abrir sesión.
4. La validación 422 por defecto de FastAPI devuelve los valores recibidos (incluida la contraseña) → manejador propio.

## Pruebas

Ejecutadas (2026-11-16): `python3 scripts/check.py`; `python3 -m unittest discover -s tests` (incluye `tests/test_aula.py`, estático); `pytest` de `services/aula-api/tests` contra PostgreSQL 16.6 real (13 pruebas: registro, duplicados, datos inválidos, rol administrativo rechazado, contraseña incorrecta, límites por correo/IP/registro, cierre y reutilización de cookie, caducidad por inactividad y absoluta, CSRF y origen, inscripción repetida, separación entre estudiantes, persistencia con nueva instancia, cabeceras); `tests/e2e/aula.e2e.mjs` en Chromium con el Compose completo (móvil Pixel 7, escritorio, reinicio de API y PostgreSQL, almacenamiento del navegador vacío, cookie HttpOnly).

Omitidas: CI no ejecuta las pruebas con PostgreSQL ni la prueba de navegador (no hay servicio de base en el flujo actual); no se probó con HTTPS real ni detrás del proxy de producción; sin pruebas de carga.

## Riesgos pendientes

- **IP detrás de proxy:** si en producción Uvicorn no confía exactamente en el proxy (`FORWARDED_ALLOW_IPS`), todos los clientes comparten IP y el límite por IP bloquearía el acceso a todos; si confía en cualquiera, el límite se evade.
- Bloqueo dirigido: 5 fallos bloquean un correo 15 min (también para su dueño).
- El registro revela si un correo ya existe (409).
- Sin recuperación de contraseña, verificación de correo ni gestión de cuentas (fuera de alcance).
- Sin límite de sesiones por usuario ni registro de auditoría de accesos.
- `GET /sesion` devuelve el CSRF a quien tenga la cookie (mismo origen); depende de no habilitar CORS.

## Antes de recibir menores o datos reales (no cumplido)

No se ha obtenido ningún consentimiento ni se afirma cumplimiento legal. Pendiente, con asesoría: base legal y autorización de padres o tutores para menores (en Colombia, Ley 1581 de 2012 y Decreto 1377 de 2013); política de tratamiento y aviso de privacidad; finalidades, retención y borrado de cuentas; derechos de acceso/rectificación/supresión; responsable y encargado del tratamiento; cifrado y copias de seguridad de la base; registro de incidentes. Mientras tanto la interfaz indica «Versión de prueba: usa solo datos ficticios».

## Pasos para Linux (IA principal)

1. Base PostgreSQL dedicada (usuario propio, sin acceso externo, copias de seguridad cifradas).
2. API con `requirements.lock` o la imagen de `Dockerfile`, usuario sin privilegios, solo escuchando en 127.0.0.1 o socket; variables: `AULA_DATABASE_URL`, `AULA_ORIGENES=https://<dominio>`, `AULA_COOKIE_SEGURA=true`, `FORWARDED_ALLOW_IPS=<IP del proxy>`.
3. Migraciones: `python -m app.migraciones` antes de arrancar (idempotente).
4. Nginx: `location /api/aula/ { client_max_body_size 16k; proxy_pass http://127.0.0.1:<puerto>; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; }`, solo HTTPS.
5. Publicar `aula/` (hoy `deploy/linux/update.py` no la copia: añadirla a `PUBLIC_DIRS` es decisión de la IA principal).
6. El enlace «Abrir laboratorio» aparece solo cuando `games/laboratorio-arduino/index.html` (PR #1) exista en el servidor.
7. Comprobar con `curl https://<dominio>/api/aula/salud` y la prueba e2e apuntando al dominio de pruebas.
