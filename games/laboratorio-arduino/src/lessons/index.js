// Manifiesto de lecciones del curso «Electrónica y C++ con Arduino».
// Los identificadores son definitivos: con ellos se guardan los borradores (cuenta y navegador) y el progreso.
// Deben coincidir con LECCIONES de services/aula-api/app/main.py (lo comprueba tests/test_laboratorio.py).
import ledSerie from './led-serie.js';
import semaforo from './semaforo.js';
import pwmBrillo from './pwm-brillo.js';
import botonEntrada from './boton-entrada.js';
import botonFlanco from './boton-flanco.js';

export const DEFAULT_LESSON_ID = 'arduino-led-serie';
export const LESSONS = [ledSerie, semaforo, pwmBrillo, botonEntrada, botonFlanco];
export const ID_PATTERN = /^[a-z0-9-]{3,60}$/;

/** Datos públicos de cada lección: orden, tema, título y lecciones previas recomendadas (no bloquean). */
export const MANIFEST = LESSONS.map(({ id, numero, tema, titulo, corto, previas }) => ({ id, numero, tema, titulo, corto, previas }));

export const findLesson = (id) => LESSONS.find((l) => l.id === id) || null;

/**
 * Lección pedida en la URL (?leccion=<id>). Sin parámetro (o vacío) → la lección 1, para que los enlaces
 * existentes sigan abriendo lo mismo. Un identificador desconocido devuelve lesson = null: la página no
 * debe crear ni sobrescribir ningún borrador con él.
 */
export function resolveLesson(search) {
  const requested = new URLSearchParams(search).get('leccion');
  if (requested === null || requested === '') return { lesson: findLesson(DEFAULT_LESSON_ID), requested: null };
  return { lesson: findLesson(requested), requested };
}

/** Enlace a una lección desde la página del laboratorio. */
export const lessonHref = (id) => `?leccion=${encodeURIComponent(id)}`;
