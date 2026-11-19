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

## Requisitos para producción (pendientes)

Hasta completarlos, `api.env` no define `AULA_BAJAS_REGISTRO` y **las bajas siguen bloqueadas**.

1. Un segundo equipo o almacenamiento fuera del servidor, alcanzable por NetBird. Debe exportar una carpeta dedicada por NFSv4 (preferido), SMB o SSHFS, escribible solo por la cuenta del aula. También debe guardar instantáneas o una copia diaria que el servidor no pueda borrar. Requiere el equipo y las credenciales de Edwin. Las credenciales del montaje viven solo en el servidor, en un archivo de root, nunca en el repositorio.
2. Montarla en el anfitrión con arranque automático y llevarla a la API como volumen. Definir `AULA_BAJAS_REGISTRO` con la ruta dentro del contenedor. `deploy/linux/aula-produccion.sh` todavía no lo hace; es un cambio posterior.
3. Ejecutar `python -m app.registro_bajas inicializar` una vez y comprobar con `comprobar`. Ensayar una baja ficticia y una restauración antes de la primera baja real.
4. `AULA_BAJAS_REGISTRO_PRUEBAS` es solo para pruebas: admite una carpeta local y no debe definirse en producción.
