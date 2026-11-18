# Progreso por cuenta: Desarrollo Web y Python desde Cero

Mismo diseño que Arduino (`docs/AULA_PROGRESO.md`): sesión, CSRF, origen, inscripción, ruta `/api/aula/mis-cursos` (ya en la lista del nginx público) y tabla `progreso_lecciones` (sin migración nueva). **Declarativo**: lo evalúa el navegador; no sirve para certificados, notas ni permisos.

## Identificadores (espacio de nombres por curso)

| Curso | Prácticas (id en la API) | Laboratorio |
|---|---|---|
| `course-web` | `web-estructura`, `web-rejilla`, `web-adaptable`, `web-eventos`, `web-publicacion` | `games/laboratorio-web/index.html#<id sin «web-»>` |
| `course-python` | `python-variables`, `python-condicionales`, `python-funciones`, `python-archivos`, `python-asistente` | `games/laboratorio-python/index.html?practica=<id>` |

`PRACTICAS` en `services/aula-api/app/main.py` solo vale para progreso: los borradores en la cuenta y la compilación siguen siendo solo de Arduino. Los cursos los crea la migración 0005 (otra rama); las pruebas de esta rama los insertan solo en su preparación.

## Borrador local ≠ avance sincronizado

- **Borrador** (código): solo en este navegador. Invitado: claves de siempre (`globalt.taller-web.v1.<id>`, `globalt.laboratorio.python.v1`). Con cuenta inscrita: espacio propio de la cuenta (`….cuenta.<huella>`), así que en un equipo compartido cada estudiante ve solo los suyos. Se puede **copiar a mano** el código de invitado (nunca sus retos).
- **Avance**: visita al abrir la práctica; finalización **solo** cuando el evaluador aprueba, y antes se comprueba que la sesión sigue siendo de la misma cuenta. Lo no enviado queda en `globalt.aula.practicas-pendiente.v1.<huella>` (solo esa cuenta), se reintenta al volver la red, con «Reintentar» y desde el panel del aula. Un envío a la vez (también entre pestañas, Web Locks); el servidor fusiona los reenvíos.
- El historial de invitado nunca se envía ni se atribuye. Con sesión sin inscripción, o sin red y sin cuenta conocida en la pestaña, el laboratorio trabaja como invitado y lo dice.
- Al cerrar sesión o entrar otra cuenta (canal `globalt-aula-sesion`, el mismo que ya usa el aula), las pestañas del laboratorio dejan de registrar y piden recargar.

## Módulos

- `games/laboratorio-web/progreso-cuenta.js`: manifiesto, cliente, cola, «Continuar» y controlador de los dos laboratorios (el almacenamiento vive aquí porque el aula no usa almacenamiento del navegador).
- `aula/src/progreso-practicas.js`: `panelPracticas(curso)` → `<article>` con estado por práctica y «Continuar»; `enviarPendientesPracticas()` para el cierre de sesión.

## Integración en «Mis cursos» (aula/src/main.js, ChatGPT)

1. `import { panelPracticas, tienePanel, enviarPendientesPracticas } from './progreso-practicas.js';`
2. **Obligatorio**: `panelProgreso` (Arduino) solo para `curso.id === 'course-arduino'`; hoy pinta las 15 lecciones de Arduino en cualquier curso con `progreso`.
3. Para `tienePanel(c)`, añadir `panelPracticas(c)` al contenedor (es un elemento DOM, no HTML).
4. En «Cerrar sesión», junto al envío de Arduino: `await Promise.race([enviarPendientesPracticas().catch(() => null), espera5s])`.

## Pruebas

- `AULA_TEST_DATABASE_URL=… python -m pytest -q services/aula-api/tests` (incluye `test_progreso_practicas.py`).
- `python3 -m unittest tests.test_progreso_practicas` (incluye `node --test tests/progreso-practicas.test.mjs`).
- `AULA_SITIO=http://127.0.0.1:8180 node tests/e2e/practicas-progreso.e2e.mjs` en un banco con API, PostgreSQL y los dos cursos.
