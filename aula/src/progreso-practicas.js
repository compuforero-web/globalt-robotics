// Panel de progreso de las prácticas de Desarrollo Web (course-web) y Python desde Cero (course-python) para
// «Mis cursos». Uso: contenedor.append(panelPracticas(curso)), con «curso» tal como lo devuelve
// GET /api/aula/mis-cursos (o solo su id). Devuelve un elemento DOM al instante y lo completa al cargar.
//
// - Estado por práctica: «Sin comenzar», «En curso», «Completada» y «Sin enviar» si el avance de ESTA cuenta
//   espera en este navegador; «Continuar» lleva a la práctica correcta del laboratorio.
// - Antes de pintar se envía el avance pendiente de la cuenta con sesión (nunca el de otra cuenta ni el de invitado).
// - El progreso es DECLARATIVO: el reto lo evalúa el navegador; no es una evaluación verificada por el servidor.
// El almacenamiento de la cola vive en el laboratorio (games/laboratorio-web/progreso-cuenta.js), que se carga
// bajo demanda: el aula no guarda nada en el navegador.
const MODULO = '../../games/laboratorio-web/progreso-cuenta.js';
export const CURSOS_PRACTICAS = ['course-web', 'course-python'];
const ESTADOS = { 'sin-comenzar': 'Sin comenzar', 'en-curso': 'En curso', completada: 'Completada' };
let modulo = null;

const cargar = () => (modulo ||= import(MODULO).catch((e) => { modulo = null; throw e; }));

/** ¿Tiene este curso panel de prácticas? */
export const tienePanel = (curso) => CURSOS_PRACTICAS.includes(typeof curso === 'string' ? curso : curso?.id);

function nodo(etiqueta, atributos = {}, ...hijos) {
  const n = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(atributos)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'texto') n.textContent = v;
    else if (k in n && typeof v !== 'string') n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  n.append(...hijos.filter(Boolean));
  return n;
}

/**
 * Elemento <article> con el progreso del curso. data-estado: 'cargando' | 'listo' | 'sin-progreso' | 'error'.
 * Opciones: { alCambiar(elemento) } se llama cada vez que el panel se vuelve a pintar.
 */
export function panelPracticas(curso, { alCambiar = () => {} } = {}) {
  const id = typeof curso === 'string' ? curso : curso?.id;
  const panel = nodo('article', { class: 'curso curso--progreso curso--practicas', 'data-curso': id, 'data-estado': 'cargando' },
    nodo('h3', { texto: (typeof curso === 'object' && curso?.titulo) || 'Prácticas' }),
    nodo('p', { class: 'muted', texto: 'Cargando tu progreso…', role: 'status' }));
  rellenar(panel, id, typeof curso === 'object' ? curso : null, alCambiar).catch(() => {
    panel.dataset.estado = 'error';
    panel.replaceChildren(nodo('h3', { texto: panel.querySelector('h3')?.textContent || 'Prácticas' }),
      nodo('p', { class: 'muted', texto: 'No se pudo cargar el progreso de este curso.' }),
      nodo('button', { type: 'button', class: 'btn btn--ghost btn--sm', texto: 'Reintentar',
        onclick: () => panel.replaceWith(panelPracticas(curso, { alCambiar })) }));
  });
  return panel;
}

async function rellenar(panel, id, dato, alCambiar) {
  const pc = await cargar();
  const def = pc.CURSOS[id];
  if (!def) throw new Error('Curso sin prácticas');
  // Cuenta con sesión: se envía antes su cola pendiente (solo la suya) y se lee el progreso actualizado.
  const { usuario } = await pc.api.sesion();
  const clave = await pc.claveCuenta(usuario?.correo);
  let envio = null;
  if (Object.keys(pc.pendientes(clave)).length) envio = await pc.enviar(clave).catch(() => null);
  let curso = dato;
  try {
    const { cursos } = await pc.api.misCursos();
    curso = (cursos || []).find((c) => c.id === id) || null;
  } catch (e) {
    if (!curso || e.status === 401) throw e;   // sin red: se pinta con lo que trajo «Mis cursos»
  }
  if (!curso) throw new Error('No inscrito');
  pintar(panel, pc, def, curso, clave, envio);
  alCambiar(panel);
}

function pintar(panel, pc, def, curso, clave, envio) {
  const titulo = curso.titulo || def.titulo;
  const inscrito = curso.inscrito_en ? nodo('p', { class: 'muted',
    texto: 'Inscrito el ' + new Date(curso.inscrito_en).toLocaleDateString('es-CO', { dateStyle: 'long' }) }) : null;
  const total = def.practicas.length;
  if (!curso.progreso || !Array.isArray(curso.progreso.lecciones)) {   // API anterior: sin progreso de este curso
    panel.dataset.estado = 'sin-progreso';
    panel.replaceChildren(nodo('h3', { texto: titulo }), inscrito,
      nodo('a', { class: 'btn btn--primary btn--sm', href: pc.urlPractica(curso.id, def.practicas[0]), texto: 'Abrir laboratorio' }),
      nodo('p', { class: 'nota', texto: 'Este servidor aún no guarda el avance de este curso.' }));
    return;
  }
  const mapa = pc.combinar(curso.progreso, pc.pendientes(clave));
  const estadoDe = (p) => mapa.get(p.id)?.estado || 'sin-comenzar';
  const hechas = def.practicas.filter((p) => estadoDe(p) === 'completada').length;
  const siguiente = pc.continuarCon(def.practicas, mapa);
  const sinEnviar = def.practicas.filter((p) => mapa.get(p.id)?.pendiente).length;

  const filas = def.practicas.map((p) => {
    const e = estadoDe(p);
    return nodo('li', { class: 'leccion', 'data-leccion': p.id, 'data-estado': e },
      nodo('a', { href: pc.urlPractica(curso.id, p) },
        nodo('span', { class: 'leccion__n', texto: String(p.numero) }),
        nodo('span', { class: 'leccion__t', texto: p.corto }),
        nodo('span', { class: 'leccion__e' }, nodo('span', { class: `chip chip--${e}`, texto: ESTADOS[e] }),
          mapa.get(p.id)?.pendiente ? nodo('small', { class: 'leccion__pend', texto: 'Sin enviar' }) : null)));
  });

  const sincro = nodo('p', { class: 'sincro', hidden: !sinEnviar },
    nodo('span', { class: 'sincro__texto', texto: `${sinEnviar} práctica(s) con avance sin enviar a tu cuenta (guardado en este navegador solo para tu cuenta).`
      + (envio && envio.estado !== 'al-dia' ? ' ' + ({ 'otra-cuenta': 'La sesión cambió: no se envió nada.',
        'no-disponible': 'Este servidor aún no guarda el avance de este curso.' }[envio.estado] || 'No se pudo enviar ahora; pulsa Reintentar.') : '') }),
    nodo('button', { type: 'button', class: 'btn btn--ghost btn--sm', texto: 'Reintentar', onclick: async (ev) => {
      ev.currentTarget.disabled = true;
      panel.dataset.estado = 'cargando';
      try { await rellenar(panel, curso.id, curso, () => {}); } catch { panel.dataset.estado = 'listo'; }
    } }));

  panel.dataset.estado = 'listo';
  panel.replaceChildren(
    nodo('h3', { texto: titulo }), inscrito,
    nodo('div', { class: 'progreso' },
      nodo('p', { class: 'progreso__resumen' }, nodo('strong', { texto: `${hechas} de ${total}` }), ' prácticas completadas'),
      nodo('progress', { max: String(total), value: String(hechas), 'aria-label': 'Prácticas completadas', texto: `${hechas} de ${total}` })),
    nodo('div', { class: 'continuar' },
      nodo('a', { class: 'btn btn--primary btn-continuar', 'data-continuar': siguiente.id, href: pc.urlPractica(curso.id, siguiente), texto: 'Continuar' }),
      nodo('span', { class: 'continuar__dest', texto: `Práctica ${siguiente.numero} · ${siguiente.corto}` })),
    nodo('details', { class: 'lecciones-box', open: true }, nodo('summary', { texto: `Las ${total} prácticas` }), nodo('ol', { class: 'lecciones' }, ...filas)),
    sincro,
    nodo('p', { class: 'nota nota--progreso', texto: 'Tu código (borrador) se guarda solo en el navegador donde lo escribes. A tu cuenta se envía el avance: la práctica visitada y el reto superado. '
      + 'Ese estado lo declara el laboratorio de tu navegador al aprobar su comprobación: no es una evaluación verificada por el servidor ni sirve como certificado, nota o requisito.' }));
}

/** Envía el avance pendiente de las prácticas de la cuenta con sesión (p. ej., antes de cerrar sesión). */
export async function enviarPendientesPracticas() {
  const pc = await cargar();
  const { usuario } = await pc.api.sesion();
  return pc.enviar(await pc.claveCuenta(usuario?.correo));
}

/** Avance de prácticas que queda en este navegador para la cuenta (tras cerrar sesión). */
export async function pendientesPracticas(usuario) {
  const pc = await cargar();
  return Object.keys(pc.pendientes(await pc.claveCuenta(usuario?.correo))).length;
}
