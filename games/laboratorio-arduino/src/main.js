// Arranque del laboratorio: elige la lección de la URL (?leccion=<id>; sin parámetro, la lección 1).
// Con un identificador desconocido no se monta ninguna lección ni se crea o sobrescribe ningún borrador.
import { resolveLesson } from './lessons/index.js';
import { startLab, renderUnknown } from './lab.js';

const { lesson, requested } = resolveLesson(location.search);
if (lesson) startLab(lesson);
else renderUnknown(requested);
