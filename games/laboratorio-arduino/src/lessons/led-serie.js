// Lección 1 (existente): reúne su contenido, evaluación, circuito y guía sin cambiar su comportamiento.
import { LESSON, EXAMPLE_CODE, EXAMPLES, STEPS, CHALLENGE, lessonHtml } from '../lesson.js';
import { evaluateChallenge, EVAL_DURATION_MS } from '../challenge.js';
import { createCircuit } from '../circuit.js';
import { chooseTopic, hintText, preparedHelp } from '../guide.js';

export default {
  id: LESSON.id,                       // 'arduino-led-serie': identificador estable (borradores y progreso)
  numero: 1,
  tema: 'Arduino Nano y protoboard',
  titulo: LESSON.title,
  corto: 'LED intermitente y monitor serie',
  kicker: 'Primera lección',
  previas: [],
  baud: LESSON.baud,
  exampleCode: EXAMPLE_CODE,
  examples: EXAMPLES,
  steps: STEPS,
  challenge: CHALLENGE,
  html: lessonHtml,
  circuit: (root) => createCircuit(root, { pin: LESSON.ledPin }),
  pins: [LESSON.ledPin],               // pines del circuito: se miden siempre
  evaluation: {
    durationMs: EVAL_DURATION_MS,
    evaluate: evaluateChallenge,
    note: 'La comprobación ejecuta tu programa 5 segundos simulados y mide el LED y el monitor serie.',
  },
  guide: { chooseTopic, hintText, help: preparedHelp },
};
