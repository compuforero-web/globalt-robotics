# Atención de privacidad y apertura para adultos

Guía de trabajo para GLOBALT E.U. El borrador de política no activa el registro. Mantener las cuentas de menores para una segunda fase. No subir a GitHub expedientes de titulares, copias del RUT, credenciales, tokens ni volcados de datos.

## Atender una solicitud

1. Registrar en un medio restringido el número de caso, fecha de recepción, tipo, correo de respuesta, responsable y vencimiento. Acusar recibo. No pedir una contraseña. Si actúa un tercero, verificar su legitimación y recoger únicamente la evidencia necesaria.
2. Para consultas, contar diez días hábiles desde su recepción. Si se necesita más tiempo, comunicar antes del vencimiento los motivos y la nueva fecha, con hasta cinco días hábiles adicionales.
3. Para reclamos, contar quince días hábiles desde el día siguiente a la recepción, con prórroga motivada de hasta ocho días hábiles. Si llega incompleto, pedir subsanación dentro de cinco días desde su recepción. Si pasan dos meses desde ese requerimiento sin respuesta, documentar el desistimiento. Si quien lo recibe carece de competencia, trasladarlo e informar al titular dentro de dos días hábiles.
4. Una vez recibido el reclamo completo, incorporar en la base en un máximo de dos días hábiles la leyenda «reclamo en trámite» y el motivo. Conservarla hasta resolver. Definir antes de abrir el mecanismo restringido para hacerlo.
5. Para acceso o corrección, localizar por identificador de cuenta, verificar el alcance, aplicar la corrección y entregar la respuesta por canal verificado. Para revocatoria o supresión, identificar qué se elimina, qué debe conservarse y por qué; revocar sesiones si se cierra la cuenta. Explicar al titular cómo borrar también sus copias locales.
6. Tras una supresión, documentar lo mínimo para impedir que una restauración reactive los datos. Ensayar en réplica la restauración, la reaplicación de supresiones y la revisión antes de poner la copia en servicio. Evitar borrar respaldos compartidos de otros usuarios para atender una sola solicitud.
7. Cerrar el caso con fecha, decisión y evidencia mínima de respuesta. Facilitar la vía de reclamación ante la SIC tras agotar el trámite.

## Decisiones y comprobaciones antes de publicar

| Tema | Evidencia o decisión pendiente |
|---|---|
| Identificación | Contacto confirmado en la política. Edwin atiende directamente el buzón de privacidad. Establecer suplencia y control de acceso. |
| Oferta educativa | Documentar la revisión del objeto social y la gestión territorial que corresponda para la oferta de educación informal. |
| Datos y proveedores | Revisar las migraciones 0001–0008 y el registro externo de bajas previsto. Gmail está confirmado como proveedor SMTP. Inventariar servidor, Cloudflare, buzón y proveedor SMTP efectivo, tratamiento fuera de Colombia si aplica, contratos, registros y retención configurada. |
| Conservación | Inactividad aprobada: 24 meses desde el último acceso y aviso al menos 30 días antes de eliminar. PR #28 integrada. El ensayo con cuentas ficticias cubrió plazos, acceso posterior, fallos de aviso y restauración. En producción las bajas están deshabilitadas hasta configurar y probar el destino externo. Mantener en revisión los casos sin fecha fiable de acceso o sin aviso acreditado. Fijar aparte los plazos de registros técnicos y evidencias. Comprobar la rotación efectiva y distinguir la baja por inactividad de una solicitud de supresión del titular. Esta última necesita su propio trámite. |
| Texto aprobado | Completar datos pendientes, fecha de vigencia y versión. Archivar cada versión exacta del aviso, términos y autorización. Publicar enlaces accesibles antes de recoger datos reales. |
| Correo y registro | Entrega del mensaje de prueba de Linux a Gmail confirmada. Ensayar aún verificación de cuenta, caducidad, reenvío y recuperación de contraseña a través del dominio. Registrar solo el resultado. Ensayar el cierre de nuevas altas conservando acceso de las cuentas existentes. |
| Derechos | Resolver un caso ficticio de consulta y uno de supresión, incluyendo identidad, plazos, constancia del reclamo, respuesta y respaldo. Asignar un responsable de incidentes y canal de escalamiento. |
| Invitados y menores | Comprobar desde móvil la salida al laboratorio sin remitir el formulario ni crear cuenta. Revisar almacenamiento local y registros técnicos también en juegos utilizados por menores. |
| Apertura | Aprobar por separado documentos, versión técnica y activación del registro para adultos. Los documentos de esta rama son material de revisión. |

## Secuencia para esta entrega

1. Con el registro cerrado, comprobar que una persona sin sesión puede leer la política y las versiones exactas de términos y autorización antes de enviar datos. Las dos clases que admite la API son `terminos` y `datos`. La política necesita un enlace público propio o una incorporación íntegra claramente identificada en el texto consultable.
2. En una réplica con correo de prueba, usar versiones ficticias distintas de las que se aprobarán. Ensayar la activación con registro cerrado, el acceso de una cuenta previa, la apertura, el alta desde un curso, la recuperación y el cierre de nuevas altas. Guardar resultados sin direcciones, claves ni enlaces de un solo uso.
3. Entregar al responsable el texto exacto, el título, la finalidad, la versión, la fecha propuesta y el enlace de cada documento. Dejar resueltas las decisiones de la tabla anterior que afecten a lo que se promete a estudiantes. Conservar constancia de aprobación separada del commit técnico.
4. Solo después de la aprobación, cargar y activar en Linux los documentos definitivos y comprobar versiones, enlaces y estado desde el dominio. Activar documentos también puede exigir aceptación a cuentas existentes. Abrir nuevas altas es una decisión posterior y explícita. Probar con un buzón controlado y mantener disponible el cierre de altas.

## Referencias

- Ley 1581 de 2012, en particular artículos 8, 9, 12 y 14 a 17. https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981
- Decreto 1074 de 2015, capítulo 25, en particular políticas y avisos de privacidad. https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1074_2015_pr025.htm
- SIC, políticas de tratamiento y avisos de privacidad. https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/politicas-de-tratamiento-de-datos-personales
