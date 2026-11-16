import { esc, safeUrl, normalize } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import { waLink, waMsg } from '../utils/whatsapp.js';

const LEVEL_CLASS = { 'Básico': 'lvl-basic', 'Intermedio': 'lvl-mid', 'Avanzado': 'lvl-final' };

export function courseCard(course, index) {
  const topics = Array.isArray(course.topics) ? course.topics : [];
  const isArduino = course.id === 'course-arduino';
  const link = safeUrl(course.link);
  const external = /^https?:/i.test(link);
  const search = normalize(`${course.title} ${course.description} ${course.category} ${topics.join(' ')}`);
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
    ${isArduino ? '<p class="card__text"><strong>Primera lección disponible.</strong> El resto del curso se incorporará por etapas. Accede con una cuenta habilitada.</p>' : ''}
    ${topics.length ? `<details class="syllabus">
      <summary>${icon('book')} ${isArduino ? 'Ruta del curso' : 'Temario'} (${topics.length} temas)</summary>
      <ol>${topics.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
    </details>` : ''}
    <div class="card__actions">
      ${isArduino
        ? `<a class="btn btn--primary" href="aula/" data-aula-link hidden>Entrar al Aula</a>
          <a class="btn btn--outline" href="${waLink('Hola, quiero solicitar una cuenta para acceder a la primera lección del curso de Arduino en GLOBALT ROBOTICS.')}" target="_blank" rel="noopener">Solicitar acceso</a>`
        : `${link ? `<a class="btn btn--outline" href="${esc(link)}" ${external ? 'target="_blank" rel="noopener"' : ''}>${icon('external')} Material y práctica</a>` : ''}
          <a class="btn btn--wa" href="${waLink(waMsg.course(course.title))}" target="_blank" rel="noopener">Inscribirme</a>`}
    </div>
  </article>`;
}

export function renderCourses(container, courses) {
  container.innerHTML = courses.length
    ? courses.map(courseCard).join('')
    : '<p class="empty">Pronto publicaremos nuevos cursos en esta ruta.</p>';
}
