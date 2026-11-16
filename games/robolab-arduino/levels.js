// Niveles de RoboLab. Leyenda: S inicio (mirando a la derecha) · G meta · # obstáculo · B batería · . libre
export const LEVELS = [
  {
    name: 'Primer movimiento', tier: 'Básico',
    hint: 'Usa el bloque AVANZAR para llevar el robot hasta la meta verde.',
    map: ['......', '......', 'S...G.', '......', '......', '......'],
  },
  {
    name: 'Giro con puente H', tier: 'Básico',
    hint: 'Para girar, el puente H hace que una rueda vaya adelante y la otra atrás. Prueba GIRAR DERECHA.',
    map: ['......', '.S....', '.###..', '...#..', '...#G.', '......'],
  },
  {
    name: 'Laberinto en zigzag', tier: 'Básico',
    hint: 'Planea la ruta antes de programar. Toca ×1 en un bloque para repetirlo (ciclo for).',
    map: ['S.#...', '..#.#.', '..#.#.', '....#G', '###.#.', '......'],
  },
  {
    name: 'Recarga de baterías', tier: 'Intermedio',
    hint: 'Recoge TODAS las baterías antes de llegar a la meta.',
    map: ['S..#..', '.#.#B.', '.#....', '.###.#', 'B....G', '......'],
  },
  {
    name: 'Sensor ultrasónico', tier: 'Intermedio',
    hint: 'Si el robot choca, el HC-SR04 lo detiene. Evita los obstáculos con giros precisos.',
    map: ['S.....#', '####..#', '...#...', '.#.###.', '.#...#.', '.###.#.', 'G....B.'],
  },
  {
    name: 'Misión final', tier: 'Proyecto Final',
    hint: 'Combina todo: rutas, ciclos y baterías. Intenta usar la menor cantidad de bloques.',
    map: ['S...#..B', '.##.#.#.', '.#..#.#.', '.#.##.#.', 'B#....#.', '.####.#.', '......#.', '.B##...G'],
  },
];

export const OPS = {
  F: { label: 'Avanzar', fn: 'avanzar();', icon: '▲' },
  L: { label: 'Girar izq.', fn: 'girarIzquierda();', icon: '⟲' },
  R: { label: 'Girar der.', fn: 'girarDerecha();', icon: '⟳' },
};
