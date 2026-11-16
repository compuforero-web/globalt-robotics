// «Chispa», robot guía de GLOBALT. En esta versión usa ayudas deterministas y contenido preparado.
//
// Interfaz extensible: un proveedor es un objeto { id, label, respond(event, context) } que devuelve
// { text, mood } o null (puede ser asíncrono). Un futuro proveedor con IA puede reemplazar o complementar a
// `preparedHelp` sin cambiar el laboratorio: createGuide(root, { providers: [proveedorIA, preparedHelp] }).
import { explainDiagnostic, GENERIC_HELP } from './compiler-help.js';


// Pistas progresivas por tema: cada tema avanza de una idea general a una más concreta, sin entregar el código
// completo del reto. El tema se elige con reglas locales sobre el código, el último resultado y el paso actual.
const TOPICS = {
  'paso-0': { label: 'el circuito', hints: [
    'Mira el circuito en la simulación: sigue el camino de la corriente desde D13, por la resistencia y el LED, hasta GND.',
    'La pata larga del LED (ánodo) va hacia D13 a través de la resistencia; la corta (cátodo), a GND.',
  ] },
  'paso-1': { label: 'setup() y loop()', hints: [
    'Lo que pones en setup() ocurre una sola vez; lo que pones en loop() se repite sin parar.',
    'Ejecuta el ejemplo y cuenta: «Hola, soy tu Arduino Nano» aparece una vez porque está en setup(); «LED encendido» se repite porque está en loop().',
  ] },
  'paso-2': { label: 'modificar el código', hints: [
    'Empieza por un cambio pequeño: modifica un solo delay() y ejecuta para ver la diferencia.',
    'El primer delay() de loop() es el tiempo encendido y el segundo, el tiempo apagado.',
  ] },
  'paso-3': { label: 'compilar', hints: [
    'Pulsa Compilar. Si aparece un error, lee primero el de la línea más alta.',
    'Pulsa el enlace «Línea N» de un mensaje para ir directamente a esa línea del editor.',
  ] },
  'paso-4': { label: 'la simulación', hints: [
    'Pulsa Ejecutar y observa a la vez el LED, el indicador D13 y el monitor serie.',
    'Detener congela el tiempo simulado; Reiniciar vuelve a ejecutar setup() desde el principio.',
  ] },
  compilar: { label: 'el error del compilador', hints: [
    (c) => `Revisa la línea ${c.errorLine || 'indicada'} y también la anterior: ${c.errorHelp}`,
    'Busca parejas: cada «(» necesita su «)», cada «{» su «}», y cada texto entre comillas dobles se cierra.',
    'Si no encuentras el problema, compara esa parte con el ejemplo de la lección: misma ortografía, mismas mayúsculas y «;» al final.',
  ] },
  pinmode: { label: 'el pin del LED', hints: [
    'El LED no se encenderá si D13 no está preparado como salida.',
    'En setup() debe haber un pinMode(…) para el pin 13 con el modo OUTPUT.',
  ] },
  baud: { label: 'el monitor serie', hints: [
    'El monitor serie necesita que el programa lo abra a la velocidad correcta.',
    'Dentro de setup() debe estar Serial.begin(…) con 9600, la velocidad que pide el reto.',
  ] },
  ritmo: { label: 'el ritmo', hints: [
    (c) => `Ahora mismo veo estos tiempos en tus delay(): ${c.delays.join(', ') || 'ninguno'} ms. ¿Cuál es el tiempo encendido y cuál el apagado?`,
    'El reto pide 200 ms encendido y 800 ms apagado: un latido por segundo.',
    'El delay() que va justo después de poner el pin en HIGH mide el encendido; el que va después de LOW mide el apagado.',
  ] },
  texto: { label: 'el mensaje', hints: [
    'El reto pide que cada latido escriba una línea que empiece por «Latido».',
    'Puedes escribir el texto y el número en dos partes: Serial.print(…) deja el texto en la misma línea y Serial.println(…) termina la línea.',
    'Fíjate en el espacio: «Latido 1» lleva un espacio entre la palabra y el número.',
  ] },
  contador: { label: 'el contador', hints: [
    'Para numerar los latidos necesitas un número que aumente en cada vuelta de loop().',
    'Usa una variable entera que empiece en 0 y súmale 1 en cada latido (por ejemplo con ++).',
    'Escribe esa variable con Serial.println(…) justo después del texto.',
  ] },
  alcance: { label: 'dónde vive el contador', hints: [
    'Tu contador parece declararse dentro de loop(): así se vuelve a crear en cada vuelta.',
    'Mueve la declaración del contador fuera de las funciones (arriba del todo) para que conserve su valor entre vueltas.',
  ] },
  momento: { label: 'el momento del mensaje', hints: [
    'Cada línea «Latido N» debe salir cuando el LED se enciende, no al inicio ni durante el apagado.',
    'Coloca la escritura cerca de digitalWrite(…, HIGH), antes del delay() del encendido.',
  ] },
  comprobar: { label: 'comprobar', hints: [
    'Tu código parece tener todas las piezas. Pulsa Comprobar reto: solo la medición de la simulación decide si está bien.',
    'Si la comprobación falla, revisa el primer punto marcado con ✗: muestra lo que se midió realmente.',
  ] },
  superado: { label: 'ir más allá', hints: [
    'Ya superaste el reto. Prueba a cambiar el ritmo a dos latidos rápidos y una pausa, como un corazón real.',
    'Otra idea: escribe también cuántos milisegundos lleva encendida la placa con millis().',
  ] },
};

const CHECK_TOPIC = { blink: 'pinmode', on: 'ritmo', off: 'ritmo', baud: 'baud' };

/** Quita comentarios y textos para analizar la estructura sin falsos positivos. */
function strip(code) {
  return String(code).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

/** Cuerpo de la función `name` (entre sus llaves), o ''. */
function body(src, name) {
  const m = new RegExp(`void\\s+${name}\\s*\\(\\s*\\)\\s*\\{`).exec(src);
  if (!m) return '';
  let depth = 1;
  for (let i = m.index + m[0].length; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(m.index + m[0].length, i);
  }
  return src.slice(m.index + m[0].length);
}

/**
 * Reglas locales sobre el código para orientar la pista. No evalúa el reto (eso lo hace la simulación) y
 * devuelve null cuando no detecta nada concreto.
 */
export function analyzeCode(code) {
  const src = strip(code);
  const loop = body(src, 'loop');
  const delays = [...loop.matchAll(/delay\s*\(\s*(\d+)\s*\)/g)].map((m) => Number(m[1]));
  const usesVarDelay = /delay\s*\(\s*[A-Za-z_]/.test(loop);
  const facts = { delays };
  if (!/pinMode\s*\([^,]+,\s*OUTPUT\s*\)/.test(src)) return { topic: 'pinmode', facts };
  if (!/Serial\s*\.\s*begin\s*\(\s*9600\s*\)/.test(src)) return { topic: 'baud', facts };
  const total = delays.reduce((a, b) => a + b, 0);
  if (!usesVarDelay && !(delays.includes(200) && total === 1000)) return { topic: 'ritmo', facts };
  if (!/"Latido/.test(String(code))) return { topic: 'texto', facts };
  const counter = /(\w+)\s*\+\+|\+\+\s*(\w+)|(\w+)\s*\+=\s*1\b|(\w+)\s*=\s*\4\s*\+\s*1\b/.exec(src);
  if (!counter) return { topic: 'contador', facts };
  const name = counter.slice(1).find(Boolean);
  if (new RegExp(`\\b(int|long|byte|unsigned\\s+int)\\s+${name}\\s*=`).test(loop)
    && !new RegExp(`static\\s+\\w+\\s+${name}\\b`).test(loop)) return { topic: 'alcance', facts };
  if (/"Latido/.test(body(String(code), 'setup'))) return { topic: 'momento', facts };
  return { topic: 'comprobar', facts };
}

/** Elige el tema de la pista según el contexto: error de compilación, última evaluación, paso y código. */
export function chooseTopic(ctx = {}) {
  if (ctx.compileError) return { topic: 'compilar', facts: ctx.compileError };
  const analysis = analyzeCode(ctx.code || '');
  if (ctx.untouched && Number.isInteger(ctx.step) && ctx.step < 5) return { topic: `paso-${ctx.step}`, facts: analysis.facts };
  const failed = ctx.lastChecks?.find((c) => !c.ok);
  if (failed && CHECK_TOPIC[failed.id] && analysis.topic === 'comprobar') return { topic: CHECK_TOPIC[failed.id], facts: analysis.facts };
  if (failed?.id === 'serial' && analysis.topic === 'comprobar') return { topic: 'momento', facts: analysis.facts };
  if (ctx.completed && analysis.topic === 'comprobar') return { topic: 'superado', facts: {} };
  return analysis;
}

/** Texto de la pista `level` (0…) del tema. */
export function hintText(topic, level, facts = {}) {
  const t = TOPICS[topic] || TOPICS.comprobar;
  const i = Math.min(level, t.hints.length - 1);
  const h = t.hints[i];
  return { text: `Pista ${i + 1} de ${t.hints.length} sobre ${t.label}: ${typeof h === 'function' ? h(facts) : h}`, last: i === t.hints.length - 1 };
}

const CHECK_HINTS = {
  blink: ['Comprueba que D13 esté configurado con pinMode(…, OUTPUT) en setup() y que loop() lo cambie entre HIGH y LOW.',
    'Si usas una constante para el pin, comprueba que valga 13: el LED del circuito está en D13.'],
  on: ['Mide el tiempo encendido: es el delay() que va justo después de digitalWrite(…, HIGH).',
    'Mira el detalle de la comprobación: muestra los encendidos medidos en milisegundos. Ajusta ese delay() hasta acercarte a 200.'],
  off: ['Mide el tiempo apagado: es el delay() que va después de digitalWrite(…, LOW). Si escribes algo por serie, tarda unos milisegundos, pero cabe en la tolerancia.',
    'Si hay más de un delay() mientras el LED está apagado, súmalos: el total debe rondar 800 ms.'],
  baud: ['La velocidad del monitor serie se fija con Serial.begin(…) dentro de setup(). El reto pide 9600.',
    'Revisa que solo haya un Serial.begin(…) y que use 9600.'],
  serial: ['Cada línea debe verse exactamente como «Latido 1», «Latido 2»… y salir en el mismo momento en que se enciende el LED: una sola línea por latido, contando desde 1.',
    'Mira el monitor serie al ejecutar: ¿empieza en 1? ¿aparece una línea por cada encendido, cerca del HIGH?'],
};

/** Ayuda preparada: reglas fijas, sin red y sin IA. */
export const preparedHelp = {
  id: 'preparada',
  label: 'Ayuda preparada',
  respond(event, ctx = {}) {
    switch (event) {
      case 'welcome':
        return { mood: 'idle', text: ctx.completed
          ? 'Ya superaste este reto en este navegador. Puedes seguir experimentando con el código.'
          : 'Hola, soy Chispa. Hoy harás que un LED lata a un ritmo exacto y que el Arduino lo cuente por el monitor serie. Recorre los pasos de la lección a tu ritmo y pulsa Ejecutar para ver el ejemplo. Si te atascas, pídeme una pista: se adapta a tu código.' };
      case 'hint':
        return { mood: 'idea', text: hintText(ctx.topic, ctx.level, ctx.facts).text };
      case 'service-pending':
        return { mood: 'alert', text: 'Compilar y ejecutar estará disponible próximamente. Mientras tanto puedes leer la lección y editar el código; se guarda en este navegador.' };
      case 'compile-error': {
        const errors = ctx.diagnostics.filter((d) => d.tipo === 'error');
        const first = errors[0] || ctx.diagnostics[0];
        if (!first) return { mood: 'alert', text: 'El compilador no aceptó el programa. Revisa el mensaje original bajo el editor.' };
        const where = first.linea ? `Mira la línea ${first.linea}. ` : '';
        const more = errors.length > 1 ? ` Hay ${errors.length} errores: corrige primero este y vuelve a compilar.` : '';
        return { mood: 'alert', text: where + (explainDiagnostic(first.mensaje) || GENERIC_HELP) + more };
      }
      case 'compile-ok':
        return { mood: 'happy', text: `Compilado sin errores (${ctx.flash} bytes de flash). Que compile no significa que cumpla el reto: ejecútalo y compruébalo.` };
      case 'run-started':
        return ctx.otherPins
          ? { mood: 'idea', text: `Veo actividad en ${ctx.otherPins}, pero el LED del circuito está conectado a D13.` }
          : null;
      case 'eval-fail': {
        const failed = ctx.checks.filter((c) => !c.ok);
        const tips = CHECK_HINTS[failed[0].id] || ['Revisa el primer punto marcado con ✗ en el panel del reto.'];
        const tip = tips[Math.min(ctx.repeat || 0, tips.length - 1)];
        return { mood: 'idea', text: `Casi: ${failed.length} de ${ctx.checks.length} comprobaciones no se cumplen. ${tip}` };
      }
      case 'eval-pass':
        return { mood: 'party', text: '¡Reto superado! Medí un latido de 200 ms encendido y 800 ms apagado, con su conteo en el monitor serie. Tu avance quedó guardado en este navegador.' };
      default:
        return null;
    }
  },
};

const PREF_KEY = 'globalt.laboratorio.guia.v1';
function prefs() { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; } }
function savePrefs(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* opcional */ } }

const ROBOT_SVG = `<svg viewBox="0 0 64 64" class="guide__robot" aria-hidden="true">
  <line x1="32" y1="10" x2="32" y2="4" class="g-stroke"/><path d="M29 3l4-2-1 3 3-1-4 4 1-3z" class="g-spark"/>
  <rect x="12" y="10" width="40" height="30" rx="12" class="g-head"/>
  <rect x="18" y="17" width="28" height="15" rx="7" class="g-face"/>
  <circle cx="26" cy="24.5" r="3.2" class="g-eye"/><circle cx="38" cy="24.5" r="3.2" class="g-eye"/>
  <path d="M27 35 q5 3 10 0" class="g-stroke g-mouth"/>
  <rect x="20" y="42" width="24" height="16" rx="6" class="g-body"/>
  <circle cx="32" cy="50" r="3" class="g-led"/>
  <rect x="8" y="22" width="4" height="10" rx="2" class="g-ear"/><rect x="52" y="22" width="4" height="10" rx="2" class="g-ear"/>
</svg>`;

/**
 * getContext() devuelve { code, untouched, step, compileError?, lastChecks?, completed } para elegir la pista.
 * Cada tema recuerda su nivel; al llegar a la última pista vuelve a empezar para poder repasarlas.
 */
export function createGuide(root, { providers = [preparedHelp], getContext = () => ({}) } = {}) {
  const state = { ...{ minimized: false, muted: false }, ...prefs() };
  const levels = new Map();
  root.innerHTML = `
    <div class="guide__panel">
      <div class="guide__avatar" data-mood="idle">${ROBOT_SVG}</div>
      <div class="guide__bubble">
        <p class="guide__name">Chispa <span class="guide__badge" title="Mensajes preparados por GLOBALT; no es una conversación con IA">Ayuda preparada</span></p>
        <p class="guide__text" aria-live="polite"></p>
        <div class="guide__actions">
          <button type="button" class="btn btn--ghost btn--sm" data-act="hint">Pedir pista</button>
          <button type="button" class="btn btn--ghost btn--sm" data-act="mute" aria-pressed="false"></button>
          <button type="button" class="btn btn--ghost btn--sm" data-act="min" aria-expanded="true">Minimizar</button>
        </div>
      </div>
    </div>
    <button type="button" class="guide__chip" data-act="max" aria-expanded="false">${ROBOT_SVG}<span>Guía Chispa</span><span class="guide__dot" hidden></span></button>`;
  const text = root.querySelector('.guide__text');
  const avatar = root.querySelector('.guide__avatar');
  const dot = root.querySelector('.guide__dot');
  const muteBtn = root.querySelector('[data-act="mute"]');

  function apply() {
    root.classList.toggle('is-min', state.minimized);
    muteBtn.textContent = state.muted ? 'Activar avisos' : 'Silenciar';
    muteBtn.setAttribute('aria-pressed', String(state.muted));
    root.querySelector('[data-act="min"]').setAttribute('aria-expanded', String(!state.minimized));
    root.querySelector('[data-act="max"]').setAttribute('aria-expanded', String(!state.minimized));
    if (!state.minimized) dot.hidden = true;
    savePrefs({ minimized: state.minimized, muted: state.muted });
  }

  function show(message) {
    if (!message) return;
    text.textContent = message.text;
    avatar.dataset.mood = message.mood || 'idle';
    if (state.minimized) dot.hidden = false;
  }

  /** Notifica un evento. Si está silenciado, solo responde a peticiones directas (pistas). */
  async function notify(event, context = {}, { direct = false } = {}) {
    if (state.muted && !direct) return;
    for (const provider of providers) {
      const answer = await provider.respond(event, context);
      if (answer) { show(answer); return; }
    }
  }

  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'hint') {
      const { topic, facts } = chooseTopic(getContext());
      const level = levels.get(topic) || 0;
      const { last } = hintText(topic, level, facts);
      levels.set(topic, last ? 0 : level + 1);
      notify('hint', { topic, level, facts }, { direct: true });
    }
    if (act === 'mute') { state.muted = !state.muted; apply(); }
    if (act === 'min') { state.minimized = true; apply(); root.querySelector('[data-act="max"]').focus(); }
    if (act === 'max') { state.minimized = false; apply(); root.querySelector('[data-act="hint"]').focus(); }
  });
  apply();
  return { notify };
}
