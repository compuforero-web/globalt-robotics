# Plan de despliegue: librería Servo y lecciones 12–13

Contrato de entrega para la fase de servomotores. Es planificación: no instala librerías, no cambia el compilador ni modifica el servidor. Las once lecciones integradas siguen utilizando el servicio actual.

## Reparto

- Claude: implementación, pruebas completas, documentación y herramientas reproducibles de construcción, ensayo, promoción y recuperación.
- ChatGPT: coordinar los pasos en Linux y publicar las lecciones cuando se confirme el servicio.
- Edwin: ejecutar el bloque preparado y compartir únicamente el resultado final o los errores, sin contraseñas ni secretos.

## Lecciones

`arduino-servo-posiciones` y `arduino-servo-barrido`, según los retos de [RUTA_CURSO_ARDUINO.md](RUTA_CURSO_ARDUINO.md), secciones 3.1 y 3.2. Mantener identificadores y borradores de las once lecciones anteriores. Los nuevos identificadores se admiten en la API; no modificar migraciones aplicadas.

El modelo lee los pulsos del programa compilado: periodo, ancho, ángulo objetivo y respuesta mecánica documentada. El barrido y el LED deben funcionar simultáneamente; no se acepta una animación separada del microcontrolador. Las posiciones por defecto de Servo no deben aprobar por sí solas el reto.

D9 es la señal de servo de estas lecciones; D13 es el LED de la segunda. El mapa del futuro evasor queda en [INTEGRACION_PINES_ARDUINO.md](INTEGRACION_PINES_ARDUINO.md). No implementar todavía el evasor.

## Estado del servicio que debe conservarse

- Fuente: `services/compilador-arduino/`.
- Contenedor instalado: `globalt-arduino-compiler`.
- Socket de host: `/var/lib/globalt-robotics-lab/run/compilador.sock`.
- El aula de producción monta esa carpeta y usa el socket dentro de `/compilador/`.
- Los laboratorios privados y el aula comparten este compilador.
- El Compose del directorio del compilador es de desarrollo; no debe sustituir a ciegas la instalación existente.

Verificar el estado real del servidor antes de modificarlo y abortar ante diferencias no contempladas. Mantener usuario/grupo, permisos del socket y rutas existentes; no emplear permisos 777 como arreglo.

## Construcción y aislamiento

1. Añadir la librería oficial Servo con versión y commit fijados; verificar el commit, conservar licencia y documentar el origen. No actualizar de paso el núcleo, avr-gcc o avr8js.
2. La descarga ocurre al construir. Durante la compilación de estudiantes el contenedor sigue sin red y no instala dependencias.
3. Compilar y enlazar la biblioteca para el Nano ATmega328P a 16 MHz. Limitar los directorios de inclusión permitidos a los necesarios; no debilitar los filtros de lectura de archivos, preprocesador o ensamblador.
4. Conservar ejecución sin privilegios, raíz de solo lectura, capacidades eliminadas, límites de CPU/memoria/procesos/tiempo/salida, tmpfs y recogida de procesos huérfanos.
5. No montar el socket de Docker dentro del compilador ni de la API. No abrir puertos ni habilitar el compilador directo en el dominio.
6. La salud del candidato debe identificar qué versión de Servo contiene, de manera compatible con los clientes existentes.

## Orden de despliegue

1. **Preparar sin cambiar producción:** exportar un commit concreto, construir una imagen nueva con etiqueta propia y conservar la referencia exacta de la imagen actual y la configuración.
2. **Ensayar candidato:** ejecutar temporalmente con socket propio y el mismo aislamiento, sin reemplazar el socket compartido ni publicar puertos. Probar compilación real del núcleo y Servo y los controles del servicio.
3. **Promover compilador:** mediante un procedimiento explícito y reversible. Documentar qué ocurre con peticiones en curso y la posible interrupción breve. Verificar el socket nuevo y su acceso desde el aula y laboratorios privados. Una carpeta o un socket existente no prueban que responda HTTP.
4. **Actualizar API:** admitir las dos lecciones con el mecanismo de producción existente y su respaldo comprobado. Conservar cerrado el registro.
5. **Publicar frontend:** solo después de confirmar compilador y API. Fusionar la PR; el publicador estático de main lleva los archivos web. La fusión por sí sola no actualiza el compilador ni la API.
6. **Comprobar recorrido:** las lecciones antiguas siguen compilando y conservan borradores; las nuevas compilan, simulan, evalúan y guardan por separado. Actualizar entonces la tarjeta pública a trece prácticas.

Si una etapa falla, detener la secuencia. Cada herramienta debe informar qué componentes se restauraron y cuáles quedaron actualizados. No ejecutar cambios en Linux desde el entorno de desarrollo.

## Recuperación y datos

- Conservar la imagen anterior y configuración hasta confirmar la entrega.
- Disponer de un comando probado para restaurar el compilador y su socket sin afectar proyectos ajenos.
- La API conserva su recuperación independiente con las herramientas existentes.
- No borrar volúmenes, imágenes anteriores o carpetas de respaldo para resolver un fallo.
- Nunca restaurar automáticamente PostgreSQL para revertir una actualización de código.
- Los borradores se conservan aunque se retire temporalmente una lección.

## Evidencia requerida en la PR

- Compilación real de programas con Servo y regresión del compilador para las once lecciones existentes.
- Soluciones que aprueban y fallos que suspenden: tiempos, posiciones, pin equivocado, servo inmóvil, barrido bloqueante o LED detenido.
- Regresión de seguridad del compilador, límites y rechazo de lecturas de archivos, incluyendo el preprocesado con la librería añadida.
- Modelo alimentado por pulsos reales; validación del periodo y ancho, ángulos y convivencia de temporizadores/PWM. Explicar las limitaciones del modelo didáctico.
- Cuenta, borradores separados, selector y navegación de lecciones.
- Ensayo con Docker real de candidato, promoción y vuelta a la imagen anterior; demostrar que un fallo no deja roto el servicio anterior. Declarar expresamente si no puede ensayarse.
- Navegador escritorio/móvil, comprobaciones de GitHub y resultados exactos, diferenciando réplica local de Linux y Cloudflare reales.

No fusionar la PR de esta fase antes de coordinar el despliegue. Entregar bloques separados: preparar/ensayar, promover/actualizar y recuperar.
