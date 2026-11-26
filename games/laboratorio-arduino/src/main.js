// Arranque del laboratorio: elige la lección de la URL (?leccion=<id>; sin parámetro, la lección 1).
// Con un identificador desconocido no se monta ninguna lección ni se crea o sobrescribe ningún borrador.
import { resolveLesson } from './lessons/index.js';
import { startLab, renderUnknown } from './lab.js';

import { fases, disponible, enlaceFase } from './octavo.js';
import * as cuenta from './cuenta.js';
import { getLesson } from './progress.js';
import { claveCuenta, combinar, pendientes } from './progreso-cuenta.js';

async function accesoOctavo() {
  try {
    const { usuario } = await cuenta.sesion();
    const clave = await claveCuenta(usuario.correo);
    const mapa = combinar(await cuenta.progresoCurso(), pendientes(clave));
    return id => mapa.get(id)?.estado === 'completada';
  } catch (error) {
    if ([-1, 401, 404].includes(error.status)) return id => Boolean(getLesson(id).completedAt);
    throw error;
  }
}

function aviso(mensaje, href, etiqueta) {
  const principal = document.querySelector('main');
  const titulo = document.createElement('h1');
  titulo.textContent = 'Laboratorio de octavo';
  const texto = document.createElement('p');
  texto.textContent = mensaje;
  const enlace = document.createElement('a');
  enlace.href = href;
  enlace.textContent = etiqueta;
  principal.replaceChildren(titulo, texto, enlace);
}

const { lesson, requested } = resolveLesson(location.search);
if (new URLSearchParams(location.search).get('grado') === '8') {
  try {
    const aprobada = await accesoOctavo();
    const siguiente = fases.find(id => !aprobada(id)) || fases[0];
    if (lesson && disponible(lesson.id, aprobada)) startLab(lesson);
    else aviso('Completa las fases en orden con el botón «Comprobar reto».',
               enlaceFase(siguiente), 'Abrir mi fase disponible');
  } catch (error) {
    aviso(error.message, '../../aula/index.html', 'Volver al Aula');
  }
} else if (lesson) startLab(lesson);
else renderUnknown(requested);
