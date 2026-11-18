// Editor de código ligero: textarea con números de línea, sangría de 4 espacios y marca de la línea con error.
export function crearEditor(raiz, { valor = '', alCambiar = () => {}, etiqueta = 'Código Python' } = {}) {
  raiz.classList.add('editor');
  raiz.innerHTML = `<div class="editor__numeros" aria-hidden="true"></div>
    <textarea class="editor__texto" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off"></textarea>`;
  const numeros = raiz.querySelector('.editor__numeros');
  const texto = raiz.querySelector('.editor__texto');
  texto.setAttribute('aria-label', etiqueta);
  texto.value = valor;
  let marca = null;

  function pintarNumeros() {
    const n = texto.value.split('\n').length;
    let html = '';
    for (let i = 1; i <= n; i++) html += `<span${i === marca ? ' class="es-error"' : ''}>${i}</span>`;
    numeros.innerHTML = html;
    numeros.scrollTop = texto.scrollTop;
  }

  function insertar(cadena, desde = texto.selectionStart, hasta = texto.selectionEnd) {
    texto.setRangeText(cadena, desde, hasta, 'end');
    texto.dispatchEvent(new Event('input', { bubbles: true }));
  }

  texto.addEventListener('input', () => { marca = null; pintarNumeros(); alCambiar(texto.value); });
  texto.addEventListener('scroll', () => { numeros.scrollTop = texto.scrollTop; });
  texto.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Escape suelta el foco (accesibilidad): Tab solo sangra mientras no se haya pulsado Escape.
      if (texto.dataset.salir === '1') { texto.dataset.salir = ''; return; }
      e.preventDefault();
      const inicio = texto.value.lastIndexOf('\n', texto.selectionStart - 1) + 1;
      if (e.shiftKey) {
        const quitar = /^ {1,4}/.exec(texto.value.slice(inicio))?.[0].length || 0;
        if (quitar) insertar('', inicio, inicio + quitar);
      } else {
        insertar('    ');
      }
    } else if (e.key === 'Escape') {
      texto.dataset.salir = '1';
    } else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const inicio = texto.value.lastIndexOf('\n', texto.selectionStart - 1) + 1;
      const linea = texto.value.slice(inicio, texto.selectionStart);
      const sangria = /^ */.exec(linea)[0] + (/:\s*$/.test(linea) ? '    ' : '');
      if (sangria) { e.preventDefault(); insertar('\n' + sangria); }
    }
  });
  pintarNumeros();

  return {
    get value() { return texto.value; },
    setValue(v) { texto.value = v; marca = null; pintarNumeros(); },
    focus() { texto.focus(); },
    /** Marca una línea (o null) y opcionalmente la selecciona. */
    marcar(linea, { ir = false } = {}) {
      marca = linea || null;
      pintarNumeros();
      if (ir && linea) {
        const lineas = texto.value.split('\n');
        const desde = lineas.slice(0, linea - 1).reduce((s, l) => s + l.length + 1, 0);
        texto.focus();
        texto.setSelectionRange(desde, desde + (lineas[linea - 1] || '').length);
        const alto = parseFloat(getComputedStyle(texto).lineHeight) || 20;
        texto.scrollTop = Math.max(0, (linea - 3) * alto);
      }
    },
    elemento: texto,
  };
}
