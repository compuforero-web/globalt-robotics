// Editor de código: textarea accesible sobre una capa resaltada, con números de línea e indentación.
import { highlightCpp } from './cpp-highlight.js';

const INDENT = '  ';

export function createEditor(root, { value = '', onChange = () => {}, onSave = () => {} } = {}) {
  root.classList.add('code-editor');
  root.innerHTML = `
    <div class="code-editor__gutter" aria-hidden="true"></div>
    <div class="code-editor__body">
      <pre class="code-editor__hl" aria-hidden="true"><code></code></pre>
      <textarea class="code-editor__input" spellcheck="false" autocapitalize="off" autocomplete="off"
        autocorrect="off" wrap="off" aria-label="Editor de código C++ para Arduino"
        aria-describedby="editor-help"></textarea>
    </div>`;
  const gutter = root.querySelector('.code-editor__gutter');
  const hl = root.querySelector('code');
  const pre = root.querySelector('pre');
  const input = root.querySelector('textarea');
  let marks = new Map();
  let escaped = false;

  function render() {
    const text = input.value;
    hl.innerHTML = highlightCpp(text) + '\n';
    const lines = text.split('\n').length;
    let html = '';
    for (let i = 1; i <= lines; i++) {
      const mark = marks.get(i);
      html += `<span class="${mark ? 'is-' + mark : ''}">${i}</span>`;
    }
    gutter.innerHTML = html;
    syncScroll();
  }
  function syncScroll() {
    pre.scrollTop = input.scrollTop;
    pre.scrollLeft = input.scrollLeft;
    gutter.scrollTop = input.scrollTop;
  }

  // insertText conserva el historial de deshacer del navegador cuando está disponible.
  function insert(text) {
    if (!document.execCommand?.('insertText', false, text)) input.setRangeText(text, input.selectionStart, input.selectionEnd, 'end');
    render();
    onChange(input.value);
  }

  function lineStart(pos) { return input.value.lastIndexOf('\n', pos - 1) + 1; }

  function shiftLines(outdent) {
    const { value } = input;
    const start = lineStart(input.selectionStart);
    const endPos = input.selectionEnd;
    const block = value.slice(start, endPos);
    const changed = block.split('\n').map((l) => (outdent ? l.replace(/^ {1,2}|^\t/, '') : INDENT + l)).join('\n');
    input.setSelectionRange(start, endPos);
    insert(changed);
    input.setSelectionRange(start, start + changed.length);
  }

  input.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); onSave(); return; }
    if (e.key === 'Escape') { escaped = true; return; }
    if (e.key === 'Tab') {
      if (escaped) { escaped = false; return; } // Esc + Tab sale del editor (accesibilidad).
      e.preventDefault();
      const multi = input.value.slice(input.selectionStart, input.selectionEnd).includes('\n');
      if (e.shiftKey || multi) shiftLines(e.shiftKey);
      else insert(INDENT);
      return;
    }
    escaped = false;
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      const pos = input.selectionStart;
      const current = input.value.slice(lineStart(pos), pos);
      let indent = current.match(/^[ \t]*/)[0];
      const before = current.trimEnd();
      if (before.endsWith('{')) indent += INDENT;
      const after = input.value.slice(input.selectionEnd);
      if (before.endsWith('{') && /^\s*\}/.test(after.split('\n')[0])) {
        insert('\n' + indent + '\n' + indent.slice(INDENT.length));
        const caret = pos + 1 + indent.length;
        input.setSelectionRange(caret, caret);
      } else insert('\n' + indent);
      return;
    }
    if (e.key === '}') {
      const pos = input.selectionStart;
      const current = input.value.slice(lineStart(pos), pos);
      if (/^[ \t]+$/.test(current) && input.selectionStart === input.selectionEnd) {
        e.preventDefault();
        input.setSelectionRange(pos - Math.min(INDENT.length, current.length), pos);
        insert('}');
      }
    }
  });
  input.addEventListener('input', () => { render(); onChange(input.value); });
  input.addEventListener('scroll', syncScroll);

  input.value = value;
  render();

  return {
    get value() { return input.value; },
    setValue(text) { input.value = text; marks = new Map(); render(); },
    /** Marca líneas con 'error' o 'warning' en la numeración. */
    setMarks(list) { marks = new Map(list.map(({ line, kind }) => [line, kind])); render(); },
    goTo(line) {
      const lines = input.value.split('\n');
      const pos = lines.slice(0, Math.max(0, line - 1)).reduce((a, l) => a + l.length + 1, 0);
      input.focus();
      input.setSelectionRange(pos, pos + (lines[line - 1] || '').length);
      const lineHeight = parseFloat(getComputedStyle(input).lineHeight) || 20;
      input.scrollTop = Math.max(0, (line - 3) * lineHeight);
    },
    focus() { input.focus(); },
  };
}
