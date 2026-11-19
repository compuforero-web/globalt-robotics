# Inactividad de cuentas del aula

La migración 0007 registra la apertura y el uso autenticado de sesiones. Las cuentas antiguas empiezan a contar desde su primer acceso observado tras la migración. Las cuentas sin acceso conocido, sin correo verificado y las administrativas quedan fuera del procedimiento. Visitar una práctica pública no identifica a la persona.

El operador ejecuta `python -m app.inactividad` dentro de la API. Sin argumentos muestra cantidades. No se instala ningún calendario ni se envían avisos al desplegar. Las siguientes operaciones son individuales y se usan con la configuración del aula correspondiente.

1. `listar` muestra identificadores internos, referencia opaca y estado. Aparecen estudiantes a los que les faltan como máximo 30 días para cumplir 24 meses naturales de inactividad, incluidos los que han pasado el plazo.
2. `avisar ID` reserva el expediente y envía un correo. Repetir el comando sobre el mismo expediente no vuelve a enviar. Un error SMTP deja el aviso fallido. Una interrupción puede dejarlo reservado incluso si el mensaje salió. Revisar el resultado antes de reintentar.
3. `acreditar REFERENCIA` registra la comprobación de entrega por el operador, por ejemplo mediante confirmación del destinatario o constancia del proveedor. La aceptación SMTP por sí sola es insuficiente. Si no se puede acreditar, se conserva la cuenta. Ante un rebote, `invalidar REFERENCIA` cancela el expediente. Para reintentar un envío revisado, invalidar primero y usar de nuevo `avisar ID`. El nuevo expediente obtiene otra referencia.
4. `eliminar REFERENCIA` exige el registro externo de bajas (sección siguiente) y se niega si no está configurado y operativo. Comprueba las condiciones al preparar la operación y otra vez dentro de la transacción que borra, con la cuenta bloqueada: 24 meses desde el último acceso y 30 días desde la acreditación. Cualquier nuevo acceso autenticado cancela el expediente, también durante la operación. La supresión borra la cuenta y sus filas dependientes de la base activa, incluida su evidencia de autorizaciones, así como solicitudes de registro con el mismo correo. El operador debe resolver cualquier obligación de conservación antes de aplicar la baja.

La operación no modifica copias de respaldo, almacenamiento local del navegador ni registros técnicos. Una restauración puede recuperar un expediente antiguo y datos suprimidos: por eso cada baja deja constancia fuera del servidor y toda copia se reconcilia antes de volver al servicio.

## Registro externo de bajas

**Mecanismo.** Un diario de solo adición en una carpeta montada desde otro equipo (NFS, SMB o SSHFS). Cada operación crea, en exclusiva y sincronizados en disco, `<operación>.pendiente.json` antes de tocar la cuenta y `<operación>.final.json` con el desenlace (`confirmada` o `cancelada`, una sola vez). Cada archivo lleva una suma SHA-256. Solo contiene datos técnicos: identificador de operación, id interno y fecha de alta de la cuenta, identificador de la base, estado, motivo e instante. Sin correos, nombres, contraseñas, tokens ni contenido académico. Se eligió porque no añade servicios, dependencias ni credenciales a la API, se lee desde cualquier equipo nuevo montando la misma carpeta y funciona igual con el almacenamiento que ofrezca el segundo equipo.

**Orden de `eliminar`.** (1) Comprueba el destino: configurado, marca `.aula-registro-bajas`, montaje remoto y escritura sincronizada. (2) Bloquea la cuenta entre procesos (bloqueo consultivo de PostgreSQL; dos ejecuciones en paralelo se serializan y la segunda no hace nada). (3) Cierra cualquier operación incierta anterior de esa cuenta. (4) Anota en la base `bajas_inactividad` como `pendiente` y después fuera como `pendiente`. Si esto falla, la cuenta sigue activa. (5) Una transacción revalida las condiciones y borra la cuenta marcando la operación `aplicada`, o la marca `cancelada` si la persona volvió a entrar. (6) Anota fuera el desenlace.

**Protección del procedimiento anterior.** La acción `eliminar` de `gestionar` ya no borra. Además, la migración 0008 impide en PostgreSQL borrar una cuenta con aviso acreditado si su baja no figura `aplicada` en la misma transacción. Ni el comando anterior ni el SQL directo pueden saltarse el registro.

**Fallos.**
- Destino ausente, sin marca, local o sin escritura: `eliminar` se niega y no prepara nada.
- Falla la anotación externa previa: la cuenta sigue activa y la operación local queda `cancelada`.
- Se pierde la conexión o el proceso cae antes del commit: la cuenta sigue activa. La operación queda incierta fuera.
- El proceso cae entre el commit y la anotación final: la cuenta está borrada y la operación queda incierta fuera.

Una operación incierta impide nuevas bajas de esa cuenta y que cualquier copia se dé por apta. Una anotación pendiente nunca autoriza por sí sola un borrado.

**Recuperación con la base original.** `python -m app.inactividad resolver` consulta `bajas_inactividad` en esa base. Con `aplicada` confirma; con `pendiente` o `cancelada` anota `cancelada` (`no_aplicada`). Solo actúa si la base es la misma donde se ejecutó la operación; contra una copia restaurada responde «requiere decisión» y no escribe nada. Ejecutarlo antes de cualquier restauración.

**Si también se perdió la base original.** El resultado es desconocido. Antes de reabrir, el operador revisa la copia restaurada y las pruebas que conserve, como registros de Cloudflare o contacto de la persona después del instante de la anotación pendiente. Si hay indicio de acceso posterior, conservar; si no, la cuenta cumplía las condiciones y se completa la baja. Registrar la decisión con `python -m app.registro_bajas decidir OPERACIÓN --baja --sin-base-original` (o `--conservar`). Queda anotada como `decision_operador`.

`python -m app.registro_bajas comprobar` muestra confirmadas, canceladas, inciertas y problemas. Termina con error si hay inciertas o problemas.

## Reconciliación tras restaurar

En una recuperación supervisada, restaurar en una base nueva llamada `aula_inspeccion_...` inaccesible desde la web. Con `AULA_INSPECCION_URL` apuntando a esa base y `AULA_BAJAS_REGISTRO` al registro montado, ejecutar `python -m app.reconciliar_copia` para contar coincidencias. Revisar el resultado y repetir con `--aplicar`. La reconciliación lee las bajas confirmadas del registro, sin CSV intermedio. Declara la copia **no apta** y no cambia nada si el registro falta, está dañado o incompleto, si tiene operaciones inciertas o si la copia contiene una baja `aplicada` que no figura confirmada fuera. Una discordancia de identidad o rol cancela toda la operación. La pareja id y fecha de alta protege a una cuenta creada después con el mismo correo. Repetir es inocuo. Verificar datos y acceso antes de promover la copia.

El CI lo ensaya en PostgreSQL con `pg_dump -Fc` y `pg_restore`, cuentas ficticias y una carpeta temporal como destino de pruebas (`tests/test_restauracion.py`). Un respaldo anterior incluso al alta puede contener una solicitud pendiente sin cuenta asociada; este procedimiento no identifica esas solicitudes huérfanas. Revisar su caducidad y los enlaces pendientes antes de reabrir.

## Configuración en producción

El registro es **opcional** para el resto del aula. Sin él, `actualizar`, las sesiones, el progreso y la compilación funcionan igual; solo `eliminar` y `resolver` se niegan. `comprobar` y `actualizar` muestran el estado de las bajas sin detenerse por él.

**Lo que prepara el administrador, fuera del script.** Necesita un segundo equipo o almacenamiento fuera del servidor, alcanzable por NetBird, que exporte una carpeta dedicada. Se prefiere NFSv4; también valen SMB o SSHFS. La cuenta del aula, uid 10002 dentro de la API, debe poder escribir en ella. El equipo remoto debe guardar instantáneas o una copia diaria que el servidor no pueda borrar. El montaje se define en el anfitrión, en `/etc/fstab` o en una unidad `.mount`, con arranque automático. Sus credenciales van en un archivo de root con permiso 600, por ejemplo en `/etc/globalt-aula/`. El script no pide ni guarda credenciales: solo guarda en `/var/lib/globalt-robotics-aula/bajas.conf` la ruta, el origen, el tipo y el identificador del registro. La API no recibe más que la carpeta montada en `/bajas`.

```bash
sudo bash deploy/linux/aula-produccion.sh bajas configurar --ruta /mnt/globalt-aula-bajas --fuente equipo:/exports/aula-bajas --tipo nfs4 --inicializar
```

`--inicializar` solo se usa una vez, con un registro **nuevo** en una carpeta vacía. Sin esa opción, el comando exige que la carpeta ya contenga un registro y lo reutiliza con su identificador. El comando sigue estos pasos:

1. Comprueba en el anfitrión que la ruta es exactamente ese montaje remoto, con `findmnt`.
2. Monta la carpeta en la API con propagación `rslave`.
3. Inicializa el registro si se pidió.
4. Habilita las bajas con el identificador escrito en la marca del registro.
5. Comprueba que un archivo creado desde el anfitrión se ve dentro de la API, y que la API puede escribir.

Si algo falla, vuelve a la configuración anterior. Hay que anotar fuera del servidor el identificador que muestra.

```bash
sudo bash deploy/linux/aula-produccion.sh bajas estado          # 0 habilitadas · 1 inciertas · 2 BLOQUEADAS · 3 deshabilitadas
sudo bash deploy/linux/aula-produccion.sh bajas eliminar REFERENCIA
sudo bash deploy/linux/aula-produccion.sh bajas resolver
sudo bash deploy/linux/aula-produccion.sh bajas reconectar      # tras volver a montar el registro
sudo bash deploy/linux/aula-produccion.sh bajas deshabilitar    # quita el volumen y las variables; no toca el registro remoto
```

`bajas eliminar` y `bajas resolver` repiten todas las comprobaciones antes de cada operación. Usar estos comandos en lugar de `docker exec … app.inactividad`. Aun así, la API se protege sola: exige un montaje remoto, la marca y el identificador configurado.

**Pérdida del montaje.** Si la ruta deja de ser el montaje esperado, porque se desmontó, el proceso cayó o se montó otra carpeta u otro registro, `bajas estado` muestra **BLOQUEADAS** y avisa al operador. `eliminar` también se detiene. Debajo puede quedar una carpeta local, vacía o incluso con una copia de la marca. Si la API arranca en ese momento, la API también la rechaza porque no es un sistema remoto. Si la API ya tenía el montaje, conserva su conexión al registro original. Cuando el montaje vuelve, la propagación lo lleva a la API. Si `bajas estado` indica que la API no ve el mismo registro, por ejemplo tras una caída del proceso de montaje, ejecutar `bajas reconectar`. Un montaje NFS «hard» sin servidor puede bloquear los accesos en lugar de fallar. Las comprobaciones del anfitrión tienen un límite de 15 s, pero conviene revisar el equipo remoto antes de reintentar.

**Ensayado en una réplica, no en el servidor real.** El segundo equipo se simuló con SSHFS contra un sshd local, y el compilador con un sustituto. Se probaron:

- la actualización desde a6c7339 sin destino;
- la configuración, incluida la inicialización explícita, y bajas reales;
- el desmontaje con carpeta local vacía y con una marca copiada;
- otro registro con el mismo origen;
- la caída del proceso SSHFS;
- la reconexión al registro original;
- dos actualizaciones repetidas;
- deshabilitar y volver a configurar el mismo registro.

**Falta probar con el almacenamiento real de Edwin:**

- NFSv4 o SMB reales por NetBird, con su origen exacto en `findmnt`;
- permisos para el uid 10002 (`all_squash`/`anonuid` o propietario);
- `O_EXCL` y `fsync` en ese servidor;
- comportamiento `hard`/`soft` ante la caída de red;
- arranque automático tras un reinicio;
- las instantáneas del equipo remoto.

`AULA_BAJAS_REGISTRO_PRUEBAS` es solo para pruebas: admite una carpeta local y no debe definirse en producción.
