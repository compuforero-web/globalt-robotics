// Vista interactiva de la placa "compatible Nano" (SVG generado por código).
import { TOP_ROW, BOTTOM_ROW, infoFor, pinLabel } from './pins.js';

const X0 = 62;
const DX = 26;

function pinSvg(name, i, top) {
  const x = X0 + i * DX;
  const y = top ? 26 : 154;
  const kind = infoFor(name).kind;
  // Etiquetas giradas hacia el interior de la placa.
  const ly = top ? 40 : 140;
  const anchor = top ? 'end' : 'start';
  return `
  <g class="l1-part l1-pin l1-k-${kind}" data-id="${name}" tabindex="0" role="button"
     aria-label="${pinLabel(name)}">
    <rect class="l1-hit" x="${x - 13}" y="${top ? 10 : 106}" width="26" height="64"/>
    <rect class="l1-pad" x="${x - 7}" y="${y - 7}" width="14" height="14" rx="3"/>
    <circle class="l1-hole" cx="${x}" cy="${y}" r="3.5"/>
    <text class="l1-plabel" x="${x}" y="${ly}" text-anchor="${anchor}"
      transform="rotate(-90 ${x} ${ly})">${pinLabel(name)}</text>
  </g>`;
}

function boardSvg() {
  const pins = TOP_ROW.map((p, i) => pinSvg(p, i, true)).join('')
    + BOTTOM_ROW.map((p, i) => pinSvg(p, i, false)).join('');
  return `
<svg class="l1-board" viewBox="0 0 470 180" role="img" aria-label="Placa compatible Nano interactiva">
  <rect x="34" y="6" width="430" height="168" rx="10" class="l1-pcb"/>
  <g class="l1-deco">
    <rect x="296" y="80" width="22" height="10" rx="4"/>
    <circle cx="440" cy="90" r="4" class="l1-pwr"/>
    <text x="440" y="105" text-anchor="middle" class="l1-small">PWR</text>
    <text x="365" y="94" text-anchor="middle" class="l1-brand">NANO compatible</text>
  </g>
  <g class="l1-part" data-id="usb" tabindex="0" role="button" aria-label="Conector USB">
    <rect class="l1-hit" x="0" y="66" width="54" height="48"/>
    <rect x="4" y="70" width="46" height="40" rx="4" class="l1-usb"/>
    <rect x="12" y="80" width="26" height="20" rx="2" class="l1-usb-in"/>
    <text x="26" y="124" text-anchor="middle" class="l1-small l1-on-pcb">USB</text>
  </g>
  <g class="l1-part" data-id="reset" tabindex="0" role="button" aria-label="Botón Reset">
    <rect class="l1-hit" x="140" y="72" width="40" height="40"/>
    <rect x="146" y="78" width="28" height="24" rx="3" class="l1-btn-base"/>
    <circle cx="160" cy="90" r="8" class="l1-btn"/>
    <text x="160" y="112" text-anchor="middle" class="l1-small l1-on-pcb">RESET</text>
  </g>
  <g class="l1-part" data-id="mcu" tabindex="0" role="button" aria-label="Microcontrolador">
    <rect class="l1-hit" x="220" y="70" width="60" height="40"/>
    <rect x="228" y="72" width="44" height="36" rx="3" class="l1-chip"/>
    <circle cx="234" cy="78" r="2" class="l1-chip-dot"/>
    <text x="250" y="94" text-anchor="middle" class="l1-small l1-chip-txt">MCU</text>
  </g>
  ${pins}
</svg>`;
}

function cardHtml(info) {
  return `
    <h4>${info.title} ${info.tag ? `<span class="l1-tag l1-k-${info.kind}">${info.tag}</span>` : ''}</h4>
    ${info.volt ? `<p class="l1-volt">⚡ ${info.volt}</p>` : ''}
    <p>${info.text}</p>`;
}

/** Monta la placa en `host` y muestra la ficha educativa en `card`. */
export function mountBoard(host, card) {
  host.innerHTML = boardSvg();
  card.innerHTML = '<p class="l1-hint">Toca o pasa el cursor sobre un pin, el USB, el chip o el botón Reset.</p>';
  let current = null;

  const show = (el) => {
    current?.classList.remove('is-active');
    current = el;
    el.classList.add('is-active');
    card.innerHTML = cardHtml(infoFor(el.dataset.id));
  };

  host.querySelectorAll('.l1-part').forEach((el) => {
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(el); });
    el.addEventListener('click', () => show(el));
    el.addEventListener('focus', () => show(el));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(el); }
    });
  });
}
