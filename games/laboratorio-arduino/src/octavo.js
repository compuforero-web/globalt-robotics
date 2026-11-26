// Secuencia de laboratorios del vehículo de octavo; los identificadores pertenecen al manifiesto común.
export const fases = [
  'arduino-ultrasonico-distancia',
  'arduino-ultrasonico-alerta',
  'arduino-l298n-dos-motores',
  'arduino-evasor-decision',
  'arduino-evasor-pista',
];

export function disponible(id, superada) {
  const indice = fases.indexOf(id);
  return indice >= 0 && fases.slice(0, indice).every(superada);
}

export const enlaceFase = id => '?grado=8&leccion=' + encodeURIComponent(id);
