// «Chispa», robot guía de GLOBALT. En esta versión usa ayudas deterministas y contenido preparado.
//
// Interfaz extensible: un proveedor es un objeto { id, label, respond(event, context) } que devuelve
// { text, mood } o null (puede ser asíncrono). Un futuro proveedor con IA puede reemplazar o complementar a
// `preparedHelp` sin cambiar el laboratorio: createGuide(root, { providers: [proveedorIA, preparedHelp] }).
import { explainDiagnostic, GENERIC_HELP } from './compiler-help.js';

const HINTS = [
  'Empieza ejecutando el ejemplo tal como está para ver cómo se comporta el LED y qué aparece en el monitor serie.',
  'El ritmo lo deciden los dos delay() dentro de loop(): el primero es el tiempo encendido y el segundo el tiempo apagado.',
  'Encendido 200 ms y apagado 800 ms suman 1000 ms: un latido por segundo.',
  'Para contar latidos necesitas una variable que no se reinicie en cada vuelta: declárala fuera de las funciones, por ejemplo arriba del todo, empezando en 0.',
  'En cada vuelta de loop() súmale 1 a tu contador y escríbelo: Serial.print("Latido "); deja el texto en la misma línea y Serial.println(…) termina la línea con el número.',
];

const CHECK_HINTS = {
  blink: 'Comprueba que D13 esté configurado con pinMode(…, OUTPUT) en setup() y que loop() lo cambie entre HIGH y LOW.',
  on: 'Mide el tiempo encendido: es el delay() que va justo después de digitalWrite(…, HIGH).',
  off: 'Mide el tiempo apagado: es el delay() que va después de digitalWrite(…, LOW). Si escribes algo por serie, tarda unos milisegundos, pero cabe en la tolerancia.',
  baud: 'La velocidad del monitor serie se fija con Serial.begin(…) dentro de setup(). El reto pide 9600.',
  serial: 'Cada línea debe verse exactamente como «Latido 1», «Latido 2»… y salir en el mismo momento en que se enciende el LED: una sola línea por latido, contando desde 1.',
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
          : 'Hola, soy Chispa. Hoy harás que un LED lata a un ritmo exacto y que el Arduino lo cuente por el monitor serie. Lee la lección y pulsa Ejecutar para ver el ejemplo.' };
      case 'hint': {
        const level = Math.min(ctx.level, HINTS.length - 1);
        return { mood: 'idea', text: `Pista ${level + 1} de ${HINTS.length}: ${HINTS[level]}` };
      }
      case 'service-pending':
        return { mood: 'alert', text: 'Compilar y ejecutar estará disponible próximamente. Mientras tanto puedes leer la lección y editar el código; se guarda en este navegador.' };
      case 'compile-error': {
        const first = ctx.diagnostics.find((d) => d.tipo === 'error') || ctx.diagnostics[0];
        if (!first) return { mood: 'alert', text: 'El compilador no aceptó el programa. Revisa el mensaje original en el panel de resultados.' };
        const where = first.linea ? `Mira la línea ${first.linea}. ` : '';
        return { mood: 'alert', text: where + (explainDiagnostic(first.mensaje) || GENERIC_HELP) };
      }
      case 'compile-ok':
        return { mood: 'happy', text: `Compilado sin errores (${ctx.flash} bytes de flash). Que compile no significa que cumpla el reto: ejecútalo y compruébalo.` };
      case 'run-started':
        return ctx.otherPins
          ? { mood: 'idea', text: `Veo actividad en ${ctx.otherPins}, pero el LED del circuito está conectado a D13.` }
          : null;
      case 'eval-fail': {
        const failed = ctx.checks.filter((c) => !c.ok);
        return { mood: 'idea', text: `Casi: ${failed.length} de ${ctx.checks.length} comprobaciones no se cumplen. ${CHECK_HINTS[failed[0].id]}` };
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

export function createGuide(root, { providers = [preparedHelp] } = {}) {
  const state = { ...{ minimized: false, muted: false }, ...prefs() };
  let hintLevel = 0;
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
    if (act === 'hint') { notify('hint', { level: hintLevel }, { direct: true }); hintLevel = Math.min(hintLevel + 1, HINTS.length - 1); }
    if (act === 'mute') { state.muted = !state.muted; apply(); }
    if (act === 'min') { state.minimized = true; apply(); root.querySelector('[data-act="max"]').focus(); }
    if (act === 'max') { state.minimized = false; apply(); root.querySelector('[data-act="hint"]').focus(); }
  });
  apply();
  return { notify };
}
