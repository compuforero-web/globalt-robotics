// This function runs inside the opaque-origin student frame.
function assess() {
  const visible = (el) => !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  const filled = (el) => !!el?.textContent.trim();
  const cards = [...document.querySelectorAll('main article')];
  const structure = filled(document.querySelector('header h1')) && cards.length >= 2 &&
    cards.every(el => filled(el.querySelector('h2')) && filled(el.querySelector('p')));
  const [first, second] = cards.map(el => el.getBoundingClientRect());
  const pair = first?.width > 0 && second?.width > 0 && cards.slice(0, 2).every(visible);
  const row = !!(pair && Math.abs(first.top - second.top) < 2 && second.left >= first.right + 7.5);
  const stacked = !!(pair && second.top >= first.bottom && Math.abs(first.left - second.left) < 2);
  const grid = getComputedStyle(document.querySelector('.proyectos') || document.body).display === 'grid';
  const fits = document.documentElement.scrollWidth <= innerWidth + 1;
  const trigger = document.querySelector('button#programa');
  const schedule = document.querySelector('#horario');
  let toggles = false;
  if (visible(trigger) && filled(schedule) && !visible(schedule)) {
    trigger.click();
    const shown = visible(schedule);
    trigger.click();
    toggles = shown && !visible(schedule);
  }
  return {structure, row:row && grid && fits, stacked:stacked && fits, toggles};
}

const jsText = (code) => code.replace(/<\/script/gi, '<\\/script');
export function documentFor(files, mode = 'export') {
  const report = mode !== 'export';
  // The policy precedes all student markup. The frame never receives allow-same-origin.
  const policy = report ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'">` : '';
  const errors = report ? `<script>addEventListener('error',e=>parent.postMessage({labWeb:'error',message:String(e.message).slice(0,260)},'*'))<\/script>` : '';
  const signal = report ? `<script>addEventListener('load',()=>{parent.postMessage({labWeb:'ready',result:${mode === 'grade' ? '('+assess.toString()+')()' : 'null'}},'*')})<\/script>` : '';
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">${policy}<meta name="viewport" content="width=device-width,initial-scale=1"><title>Mi feria de robótica</title>${errors}<style>${files.css.replace(/<\/style/gi,'<\\/style')}</style></head>
<body>${files.html}
<script>${jsText(files.js)}<\/script>${signal}</body></html>`;
}

export function criteria(id, desktop, mobile) {
  const checks = [];
  if (['estructura','publicacion'].includes(id)) checks.push([desktop.structure,'Estructura: título principal y dos proyectos con nombre y descripción.']);
  if (['rejilla','adaptable','publicacion'].includes(id)) checks.push([desktop.row,'Escritorio: dos artículos en rejilla, con separación y sin desbordamiento.']);
  if (['adaptable','publicacion'].includes(id)) checks.push([mobile?.stacked,'Móvil: artículos apilados y página sin desbordamiento.']);
  if (['eventos','publicacion'].includes(id)) checks.push([desktop.toggles,'Interacción: el horario se muestra al primer clic y se oculta al segundo.']);
  return checks;
}
