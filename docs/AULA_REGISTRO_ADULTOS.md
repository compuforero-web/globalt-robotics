# Registro de adultos del Aula

Estado: **listo para probar de extremo a extremo en la réplica local**. El registro público sigue **cerrado por defecto** y no puede abrirse en producción sin documentos aprobados y correo de producción. Los textos incluidos son **provisionales, solo para pruebas**: los definitivos (términos de uso y autorización de tratamiento de datos) los coordina y aprueba el responsable del sitio; este paquete no redacta una política ni contiene datos empresariales.

## Recorrido

1. **«Inscribirme»** en la portada lleva a `aula/?curso=<id>`. El Aula muestra el curso elegido, abre «Crear cuenta» si el registro está abierto y ofrece siempre **«Probar sin cuenta»** (el laboratorio del curso, o el catálogo si el curso no tiene laboratorio).
2. **Edad primero.** «¿Tienes 18 años o más?» con dos botones, sin respuesta preseleccionada. «No, soy menor de 18» muestra «Practicar sin cuenta» sin haber mostrado ningún campo y **sin hacer ninguna petición**: no se crea ni se guarda nada.
3. **Datos mínimos (adultos):** nombre visible o alias, correo y contraseña (mínimo 10). No se pide documento de identidad, teléfono ni fecha de nacimiento (la API rechaza campos extra).
4. **Autorización informada:** dos casillas **sin marcar** y separadas: aceptar los términos de uso y autorizar el tratamiento de datos. La casilla de datos enlaza también la **política de tratamiento de datos completa** (tercer documento versionado, `tipo=politica`). Cada enlace abre la versión exacta en otra pestaña (`aula/documento.html?tipo=…&version=…&curso=…`), sin sesión y conservando el curso elegido; la finalidad se muestra junto a la casilla. Sin marcar ambas, el navegador no envía nada; la API exige `mayor_de_edad: true` y las versiones vigentes exactas de los tres documentos. Si se activa una versión nueva con el formulario abierto, responde 409 sin guardar nada: el Aula enlaza la versión nueva, desmarca su casilla y conserva los demás campos hasta que se lea y se acepte.
5. **Correo:** la solicitud no crea la cuenta. Se guarda como alta pendiente y se envía un enlace de un solo uso (24 h). La respuesta es la misma tenga o no cuenta el correo; si ya la tiene, a esa dirección llega un aviso **sin enlace**, con el acceso y la recuperación.
6. **Enlace:** al abrirlo, el Aula pide la contraseña elegida. Así quien registre un correo ajeno no obtiene la cuenta aunque la víctima pulse su enlace. Se crea la cuenta (`origen = registro`, correo verificado), se guarda la evidencia y se inicia sesión. El curso elegido viaja en el enlace (`?curso=`) y aparece primero con «Confirmar inscripción».
7. **Recuperación:** «¿Olvidaste tu contraseña?» envía un enlace de un solo uso (60 min) con el curso; al cambiarla se cierran las demás sesiones. Respuesta idéntica exista o no la cuenta, y sin esperar al envío (el tiempo no revela nada).

WhatsApp solo aparece como ayuda opcional en el texto de registro cerrado; ningún paso lo requiere.

## Evidencia

Tabla `autorizaciones` (solo añadir; la base impide modificarla), una fila por documento (términos, autorización y política): cuenta, documento (`id`, `tipo`, `version`, `sha256` del texto exacto), `finalidad`, `aceptada_en` (momento del envío del formulario), `registrada_en` y `via` (`registro` o `cuenta-existente`). La declaración de mayoría de edad queda en `usuarios.mayor_edad_declarada_en`.

`documentos_legales` guarda el texto exacto de cada versión; la base impide modificar o borrar una versión cargada (solo puede pasar a vigente). Las versiones anteriores siguen consultables por su ruta. Los textos `prueba` solo se usan con `AULA_PERMITIR_TEXTOS_PRUEBA=true` (nunca en producción; ni siquiera se sirven sin esa variable).

## Seguridad de los enlaces y del correo

- Token aleatorio de 256 bits; en la base solo su SHA-256. Un solo uso (marca atómica), vencimiento configurable y sustitución al reenviar.
- El token va en el **fragmento** (`/aula/?curso=…#verificar=…`): el navegador no lo envía al servidor, así que no aparece en registros de nginx ni de la API. El Aula lo quita de la barra y del historial al leerlo y solo lo envía en el cuerpo de un POST. `Referrer-Policy: same-origin`.
- Límites: 3 correos por dirección y hora para altas (registro, reenvío, aviso) y otros 3 para recuperación (por encima, misma respuesta y ningún correo); 10 solicitudes de correo por IP en 15 min (429); registros por IP como antes; intentos con enlaces inválidos por IP; contraseñas equivocadas al confirmar cuentan como intentos de acceso.
- Fallo del envío al registrarse: 503 «No se guardó nada» y se borra el alta pendiente; reintentar funciona. En reenvío y recuperación el fallo solo se anota (tipo de correo y clase del error, nunca el enlace ni la clave SMTP) y se puede volver a pedir.
- Producción: SMTP con STARTTLS o SSL obligatorio; `AULA_SMTP_TLS=ninguno` solo para el buzón de pruebas local.

## Cuentas existentes (transición)

La migración `0006` solo añade tablas y columnas: cuentas, sesiones, inscripciones, borradores y avances no cambian (comprobado con huellas antes/después y por la prueba `test_actualizacion_desde_0005_conserva_cuentas_y_avances`). Las cuentas previas quedan con `origen = anterior`, **sin autorizaciones, verificación ni declaración de edad retroactivas**, y siguen entrando con su contraseña.

- Mientras no haya documentos vigentes (como hoy en producción) todo funciona igual que antes.
- Cuando se activen las versiones definitivas, al entrar se muestra «Revisa los documentos del Aula» con las casillas sin marcar (la política va con la casilla de datos). Las altas pendientes anteriores a la migración `0009` aceptan la política en su primer acceso. Hasta aceptarlas, la API responde 403 en «Mis cursos», inscripciones, borradores, progreso y compilación (la sesión, el cierre y los documentos siguen disponibles). Al aceptar se registra con `via = cuenta-existente` y la fecha de ese momento. Lo mismo ocurre con cualquier versión nueva que se active.
- Una cuenta anterior que recupere su contraseña queda con el correo verificado.

## Configuración

| Variable | Valor por defecto | Uso |
|---|---|---|
| `AULA_REGISTRO_ABIERTO` | `false` | Decisión explícita. Sin correo listo y los tres documentos (términos, autorización y política) vigentes, el registro sigue cerrado aunque sea `true`. |
| `AULA_CORREO_MODO` | `desactivado` | `smtp` para enviar enlaces (también la recuperación). |
| `AULA_SMTP_HOST`, `AULA_SMTP_PUERTO`, `AULA_SMTP_TLS`, `AULA_SMTP_USUARIO`, `AULA_SMTP_CLAVE`, `AULA_CORREO_REMITENTE` | — / 587 / `starttls` | Servidor SMTP. La clave solo en `api.env` del servidor. |
| `AULA_URL_PUBLICA` | — | Base de los enlaces (`https://globalt-robotics.com`). |
| `AULA_ENLACE_VERIFICACION_MIN`, `AULA_ENLACE_RECUPERACION_MIN` | 1440, 60 | Vencimiento de los enlaces. |
| `AULA_CORREOS_POR_HORA`, `AULA_MAX_CORREOS_IP` | 3, 10 | Límites de envío. |
| `AULA_PERMITIR_TEXTOS_PRUEBA` | `false` | Solo pruebas. |

Documentos: `python -m app.documentos cargar|activar|listar|estado [--produccion]` (en producción, mediante `aula-produccion.sh documentos …` y `registro estado`).

## Pruebas locales

```bash
cd services/aula-api && cp .env.example .env   # define AULA_DB_CLAVE
docker compose up -d --build                  # API, PostgreSQL, nginx y buzón de pruebas (dev/buzon/*.eml)
```

`AULA_FASE=cerrado|abierto node tests/e2e/registro-adultos.e2e.mjs` (ver cabecera del archivo). Las pruebas de la API (`services/aula-api/tests/test_registro_adultos.py`) incluyen el SMTP real contra `dev/buzon_pruebas.py`, con fallo simulado (`dev/buzon/FALLAR`).

## Limitaciones conocidas

- Textos de prueba: no son documentos definitivos. Falta cargar y aprobar los definitivos.
- La edad es una **declaración**: no se verifica (por diseño no se piden datos que permitan hacerlo).
- No hay revocación de la autorización ni eliminación de cuenta desde el Aula; si se elimina una cuenta, su evidencia se elimina con ella (`ON DELETE CASCADE`). Ambas decisiones quedan pendientes de revisión legal.
- No se ha probado con un proveedor SMTP real ni con entregabilidad (SPF/DKIM/DMARC del dominio remitente).
- El envío es síncrono al registrarse (hasta 15 s si el SMTP tarda); el reenvío y la recuperación se envían tras responder, sin cola persistente: si el proceso se reinicia en ese instante, el correo se pierde y la persona lo vuelve a pedir.

### Transporte SMTP en Linux

Al actualizar con el registro cerrado se monta una carpeta privada de sockets en la API. Las redes de PostgreSQL y de la API siguen siendo internas. Al configurar el proveedor, el host crea la unidad de socket `globalt-aula-smtp.socket` y el servicio de systemd reenvía los bytes exclusivamente al host y puerto configurados. El cliente SMTP de la API negocia TLS y verifica el certificado del proveedor usando su nombre original. Las credenciales se usan dentro de la API. El socket no se publica por TCP.

Desde Linux, tras configurar, ejecutar `correo probar --a` con un buzón controlado por GLOBALT y comprobar su recepción. La aceptación del mensaje por el SMTP y su llegada a la bandeja son dos comprobaciones distintas. Para diagnosticar el transporte, consultar el estado de las dos unidades con systemctl. Para cerrar el envío y las altas, usar `correo desactivar`. La prueba automatizada usa un certificado temporal, un buzón local y systemd-socket-proxyd; en un runner con Docker también comprueba el envío desde un cliente sin red.
