// Análisis del circuito LED + 220Ω a partir de los cables del estudiante.
export const SOURCES = ['D2', 'D3', 'D5', 'D13', '5V'];
const PWM_OK = ['D3', 'D5'];

function makeRoot(wires) {
  const parent = {};
  const find = (x) => {
    if (parent[x] === undefined) parent[x] = x;
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  wires.forEach(([a, b]) => { parent[find(a)] = find(b); });
  return find;
}

const res = (kind, title, msg, pin = null) => ({ ok: kind === 'ok', kind, title, msg, pin });

/** Devuelve { ok, kind: ok|warn|err|info, title, msg, pin }. */
export function analyze(wires) {
  if (!wires.length) {
    return res('info', 'Sin cables', 'Toca un punto de conexión y luego otro para tender un cable.');
  }
  const find = makeRoot(wires);
  const same = (a, b) => find(a) === find(b);
  const srcOf = (n) => SOURCES.filter((s) => same(s, n));

  const shorted = SOURCES.find((s) => same(s, 'GND'));
  if (shorted) {
    return res('err', '¡Cortocircuito!', `${shorted} está unido directamente a GND. La corriente iría sin `
      + 'freno por el cable y podría dañar la placa. Retira ese cable: siempre debe haber un componente en medio.');
  }
  const tied = SOURCES.find((s) => srcOf(s).length > 1);
  if (tied) {
    return res('err', 'Pines unidos entre sí', `Has unido ${srcOf(tied).join(' y ')}. Si uno da 5 V y otro 0 V `
      + 'se produce un cortocircuito. Usa un solo pin para controlar el LED.');
  }
  if (same('A', 'K')) {
    return res('warn', 'LED puenteado', 'Sus dos patas están en el mismo punto: la corriente lo rodea y nunca se enciende.');
  }
  if (same('R1', 'R2')) {
    return res('warn', 'Resistencia puenteada', 'Los dos extremos de la resistencia están unidos: es como si no '
      + 'existiera y no limita la corriente.');
  }

  const reach = (t) => {
    const other = same(t, 'R1') ? 'R2' : same(t, 'R2') ? 'R1' : null;
    return {
      dSrc: srcOf(t)[0], dGnd: same(t, 'GND'),
      vSrc: other ? srcOf(other)[0] : undefined, vGnd: other ? same(other, 'GND') : false,
    };
  };
  const a = reach('A');
  const k = reach('K');
  const aSrc = a.dSrc || a.vSrc;
  const kSrc = k.dSrc || k.vSrc;
  const aGnd = a.dGnd || a.vGnd;
  const kGnd = k.dGnd || k.vGnd;

  if (kSrc && aGnd) {
    return res('warn', 'LED al revés', 'Un LED es un diodo: la corriente solo pasa del ánodo (+, pata larga) '
      + 'al cátodo (−, pata corta, lado plano). Así conectado queda bloqueado y no se enciende. Dale la vuelta.');
  }
  if (aSrc && kGnd) {
    if (a.dSrc && k.dGnd) {
      return res('err', 'Falta la resistencia', 'Sin la resistencia de 220 Ω la corriente sube a más de 60 mA: '
        + 'el LED y el pin se sobrecalientan. La resistencia limita la corriente a unos 14 mA (I = (5 V − 2 V) / 220 Ω). '
        + 'Colócala en serie, antes o después del LED.');
    }
    if (aSrc === '5V') {
      return res('warn', 'Siempre encendido', 'El LED luce, pero el pin 5V da energía fija: tu programa no puede '
        + 'apagarlo ni regular su brillo. Conéctalo a un pin digital con PWM, como D3~ o D5~.');
    }
    if (!PWM_OK.includes(aSrc)) {
      return res('warn', `${aSrc} no tiene PWM`, `Con ${aSrc} el LED puede parpadear con digitalWrite(), pero `
        + 'analogWrite() no puede regular el brillo porque el pin no tiene la marca ~. Usa D3~ o D5~.');
    }
    return res('ok', '¡Circuito correcto!', `${aSrc}~ → 220 Ω y LED en serie → GND. La resistencia protege `
      + 'al LED y el pin PWM permite controlar su brillo.', aSrc);
  }
  if (!aSrc && !kSrc) {
    return res('info', 'Circuito incompleto', 'El LED aún no recibe señal de ningún pin del Arduino.');
  }
  return res('info', 'Circuito incompleto', 'Falta cerrar el circuito: la corriente debe volver a GND.');
}
