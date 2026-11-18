import { esc, safeUrl, normalize } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import { SEED } from '../data/seed.js';

const LEVEL_CLASS = { 'Básico': 'lvl-basic', 'Intermedio': 'lvl-mid', 'Avanzado': 'lvl-final' };

// Mantener esta lista alineada con las lecciones publicadas y admitidas por la API.
const ARDUINO_PUBLIC_LESSONS = [
  'LED y monitor serie',
  'Semáforo y protoboard',
  'Brillo con PWM',
  'Lectura de un pulsador',
  'Pulsaciones y antirrebote',
  'Potenciómetro y control de brillo',
  'Medir distancia con el sensor ultrasónico',
  'Alertas de cercanía y ausencia de eco',
  'Sentido de giro con L298N',
  'Velocidad de un motor con PWM',
  'Dos motores y maniobras',
  'Posiciones del servo',
  'Barrido del servo sin bloquear',
  'Evasor: decidir ante un obstáculo',
  'Evasor: recorrer tres pistas',
];

export function courseCard(course, index) {
  const topics = Array.isArray(course.topics) ? course.topics : [];
  const original = SEED.courses.find(c => c.id === course.id) ||
    SEED.courses.find(c => normalize(c.category) === normalize(course.category) &&
      normalize(c.title).trim() === normalize(course.title).trim());
  const isArduino = original?.id === 'course-arduino';
  const isWeb = original?.id === 'course-web';
  const isPython = original?.id === 'course-python';
  const lab = isWeb ? {path: 'games/laboratorio-web/', name: 'web'}
    : isPython ? {path: 'games/laboratorio-python/', name: 'Python'} : null;
  const link = safeUrl(course.link);
  const external = /^https?:/i.test(link);
  const search = normalize(`${course.title} ${course.description} ${course.category} ${topics.join(' ')}${isArduino ? ` ${ARDUINO_PUBLIC_LESSONS.join(' ')}` : ''}`);
  return `<article class="card course-card" data-cat="${esc(course.category)}" data-search="${esc(search)}">
    <div class="course-card__head">
      <span class="course-card__icon">${icon(course.icon || (course.track === 'ia' ? 'brain' : 'code'))}</span>
      <span class="course-card__step">Módulo ${index + 1}</span>
    </div>
    <h3 class="card__title">${esc(course.title)}</h3>
    <div class="card__tags">
      <span class="tag ${LEVEL_CLASS[course.level] || ''}">${esc(course.level)}</span>
      ${course.duration ? `<span class="tag tag--soft">${icon('clock')} ${esc(course.duration)}${isArduino ? ' previstas' : ''}</span>` : ''}
    </div>
    <p class="card__text">${esc(course.description)}</p>
    ${isArduino ? `<p class="card__text"><strong>${ARDUINO_PUBLIC_LESSONS.length} lecciones disponibles.</strong> Desde el LED hasta un robot evasor programado por ti. Puedes explorar la guía como invitado. Para compilar y guardar tu avance, inscríbete.</p>
    <details class="syllabus">
      <summary>${icon('book')} Qué puedes practicar ahora</summary>
      <ol>${ARDUINO_PUBLIC_LESSONS.map((title) => `<li>${esc(title)}</li>`).join('')}</ol>
    </details>` : ''}
    ${topics.length ? `<details class="syllabus">
      <summary>${icon('book')} ${isArduino ? 'Ruta completa prevista' : 'Temario'} (${topics.length} temas)</summary>
      <ol>${topics.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
      ${lab && link ? `<a href="${esc(link)}" ${external ? 'target="_blank" rel="noopener"' : ''}>Lectura complementaria</a>` : ''}
    </details>` : ''}
    <div class="card__actions">
      ${lab ? `<a class="btn btn--primary" href="${lab.path}">Material y práctica · Abrir laboratorio ${lab.name}</a>` : ''}
      ${isArduino ? '<a class="btn btn--primary" href="games/laboratorio-arduino/index.html">Explorar laboratorio Arduino</a>'
        : link && !lab ? `<a class="btn btn--outline" href="${esc(link)}" ${external ? 'target="_blank" rel="noopener"' : ''}>${icon('external')} Material y práctica</a>` : ''}
      <a class="btn btn--wa" href="aula/${original ? '?curso=' + encodeURIComponent(original.id) : ''}">${original ? 'Inscribirme' : 'Ver cursos en el Aula'}</a>
    </div>
  </article>`;
}

export function renderCourses(container, courses) {
  container.innerHTML = courses.length
    ? courses.map(courseCard).join('')
    : '<p class="empty">Pronto publicaremos nuevos cursos en esta ruta.</p>';
}
