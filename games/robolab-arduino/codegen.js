// Genera el sketch de Arduino equivalente al programa de bloques.
import { OPS } from './levels.js';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function generateSketch(program, levelName) {
  const body = program.length
    ? program.map(({ op, n }) => (n > 1
      ? `  for (int i = 0; i < ${n}; i++) ${OPS[op].fn}`
      : `  ${OPS[op].fn}`)).join('\n')
    : '  // Agrega bloques para generar el código';

  return `// RoboLab · ${levelName}
// Robot con Arduino Nano + Puente H L298N
#include <Arduino.h>

const int IN1 = 5, IN2 = 6;  // Motor izquierdo
const int IN3 = 9, IN4 = 10; // Motor derecho
const int PASO = 600;        // ms por casilla
const int GIRO = 350;        // ms por giro de 90°

void motores(int a, int b, int c, int d) {
  digitalWrite(IN1, a); digitalWrite(IN2, b);
  digitalWrite(IN3, c); digitalWrite(IN4, d);
}
void detener()        { motores(LOW, LOW, LOW, LOW); delay(150); }
void avanzar()        { motores(HIGH, LOW, HIGH, LOW); delay(PASO); detener(); }
void girarIzquierda() { motores(LOW, HIGH, HIGH, LOW); delay(GIRO); detener(); }
void girarDerecha()   { motores(HIGH, LOW, LOW, HIGH); delay(GIRO); detener(); }

void setup() {
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
}

void loop() {
${body}
  detener();
  while (true) {} // fin de la misión
}`;
}

/** Resaltado de sintaxis sencillo para mostrar en pantalla. */
export function highlight(code) {
  return esc(code)
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('//');
      const src = idx >= 0 ? line.slice(0, idx) : line;
      const comment = idx >= 0 ? `<span class="tok-c">${line.slice(idx)}</span>` : '';
      const colored = src
        .replace(/\b(void|const|int|for|while|true|#include)\b/g, '<span class="tok-k">$1</span>')
        .replace(/\b(avanzar|girarIzquierda|girarDerecha|detener|motores|digitalWrite|pinMode|delay|setup|loop)\b/g, '<span class="tok-f">$1</span>')
        .replace(/\b(HIGH|LOW|OUTPUT|\d+)\b/g, '<span class="tok-n">$1</span>');
      return colored + comment;
    })
    .join('\n');
}
