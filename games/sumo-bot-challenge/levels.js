// Sumo Bot Challenge · Definición de parámetros y niveles
// Hardware: Arduino Nano + L298N + 2× TCRT5000 (borde) + HC-SR04 (radar)

export const PARAMS = {
  edgeAction: { label: 'Reacción al borde (TCRT5000)', type: 'select', options: [
    ['back_turn', 'Retroceder + girar'], ['back', 'Solo retroceder'], ['turn', 'Solo girar'], ['none', 'Ignorar el borde']] },
  backMs:    { label: 'Tiempo de retroceso', type: 'range', min: 100, max: 900, step: 20, unit: 'ms' },
  turnDeg:   { label: 'Ángulo de giro de evasión', type: 'range', min: 30, max: 180, step: 5, unit: '°' },
  range:     { label: 'Umbral de ataque HC-SR04', type: 'range', min: 10, max: 120, step: 5, unit: 'cm' },
  pwmPatrol: { label: 'PWM patrulla · analogWrite(ENA/ENB)', type: 'range', min: 40, max: 255, step: 5, unit: '' },
  pwmAttack: { label: 'PWM ataque · analogWrite(ENA/ENB)', type: 'range', min: 40, max: 255, step: 5, unit: '' },
  priority:  { label: 'Orden de reglas en loop()', type: 'select', options: [
    ['attack', '1º ataque · 2º borde · 3º búsqueda'], ['edge', '1º borde · 2º ataque · 3º búsqueda']] },
};

export const BASE = {
  edgeAction: 'back_turn', backMs: 300, turnDeg: 120, range: 30,
  pwmPatrol: 140, pwmAttack: 180, priority: 'edge',
};

export const LEVELS = [
  {
    id: 1, title: 'Sensores de borde TCRT5000', time: 15, search: 'forward', winBy: 'survive', radar: false,
    brief: 'El robot patrulla en línea recta dentro del Dohyo negro. Los dos TCRT5000 apuntan al suelo: sobre negro leen HIGH y sobre la línea blanca leen LOW.',
    goal: 'Sobrevive 15 s sin salirte del Dohyo configurando la evasión cuando digitalRead(IR) == LOW.',
    tip: 'Solo girar en el borde puede sacar las ruedas traseras; retroceder primero te da margen.',
    editable: ['edgeAction', 'backMs', 'turnDeg'],
    defaults: { edgeAction: 'none', backMs: 200, turnDeg: 60, pwmPatrol: 150 },
    foe: null,
  },
  {
    id: 2, title: 'Búsqueda y radar de oponente', time: 20, search: 'spin', winBy: 'push', radar: true,
    brief: 'El robot gira sobre su eje escaneando con el HC-SR04 (eco / 58 = cm). Hay un objetivo estático a más de 40 cm.',
    goal: 'Ajusta el umbral de distancia para detectar el objetivo, embestirlo y sacarlo del círculo.',
    tip: 'Si el umbral es menor que la distancia real, el robot nunca pasará al modo ataque.',
    editable: ['range', 'edgeAction'],
    defaults: { range: 20, edgeAction: 'back_turn', pwmPatrol: 120, pwmAttack: 170 },
    foe: { kind: 'can', dist: 48 },
  },
  {
    id: 3, title: 'Control de velocidad PWM (L298N)', time: 25, search: 'forward', winBy: 'push', radar: true,
    brief: 'El L298N regula la velocidad con analogWrite(ENA/ENB, 0–255). Más PWM = más empuje, pero también más inercia al frenar en la línea blanca.',
    goal: 'Saca el bloque pesado (1,4 kg) sin derrapar fuera del borde: equilibra PWM de patrulla y de ataque.',
    tip: 'A PWM alto el robot necesita más distancia para detenerse: la línea blanca solo mide 5 cm.',
    editable: ['pwmPatrol', 'pwmAttack'],
    defaults: { pwmPatrol: 250, pwmAttack: 90, range: 60, edgeAction: 'back_turn', backMs: 260, turnDeg: 140 },
    foe: { kind: 'block', dist: 40 },
  },
  {
    id: 4, title: 'Duelo contra rival ágil', time: 45, search: 'spin', winBy: 'push', radar: true,
    brief: 'El rival esquiva de lado cuando te ve venir y vuelve al centro si se acerca al borde. Perseguirlo a ciegas te llevará fuera.',
    goal: 'Combina: if (borde) evadir · else if (distancia < umbral) atacar · else girar. Expulsa al rival.',
    tip: 'Pon el borde antes que el ataque, usa un umbral de 40–60 cm (no persigas fantasmas lejanos) y PWM de ataque ≥ 220 para ganar el empuje.',
    editable: ['priority', 'range', 'pwmAttack', 'turnDeg'],
    defaults: { priority: 'attack', range: 100, pwmAttack: 150, turnDeg: 45, pwmPatrol: 130, backMs: 280, edgeAction: 'back_turn' },
    foe: { kind: 'agile', dist: 90 },
  },
  {
    id: 5, title: 'Torneo final Sumo Bot', time: 40, search: 'spin', winBy: 'push', radar: true,
    brief: 'Rival pesado (1,8 kg) con empuje frontal brutal: de frente pierdes. Sus ruedas agarran poco de lado y su inercia lo hace frenar tarde.',
    goal: 'Optimiza giro, PWM de empuje y retroceso para esquivar su carga o golpearlo de costado y sacarlo del Dohyo.',
    tip: 'De frente necesitas PWM de ataque > 200 para superar su masa; un PWM de patrulla alto (≈ 200) lo encuentra antes de que te gire.',
    editable: ['turnDeg', 'pwmAttack', 'backMs', 'range', 'pwmPatrol'],
    defaults: { turnDeg: 60, pwmAttack: 150, backMs: 160, range: 40, pwmPatrol: 120, priority: 'edge', edgeAction: 'back_turn' },
    foe: { kind: 'heavy', dist: 55 },
  },
];

export const levelParams = (lv, saved = {}) => ({ ...BASE, ...lv.defaults, ...saved });
