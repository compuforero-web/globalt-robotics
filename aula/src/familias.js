import { sesion, seguimiento } from './api.js';

const porId = id => document.getElementById(id);
let esProfesor = false;

function texto(etiqueta, contenido) {
  const nodo = document.createElement(etiqueta);
  nodo.textContent = contenido;
  return nodo;
}

async function cargar(seleccion = porId('alumno').value) {
  const alumnos = await seguimiento();
  const selector = porId('alumno');
  selector.replaceChildren();
  const historial = porId('historial');
  historial.replaceChildren();
  for (const alumno of alumnos) {
    selector.add(new Option(alumno.nombre + ' · ' + alumno.grado + '°', alumno.id));
    const tarjeta = document.createElement('article');
    tarjeta.className = 'tarjeta';
    tarjeta.append(texto('h2', alumno.nombre + ' · ' + alumno.grado + '°'));
    if (!alumno.actividades.length) tarjeta.append(texto('p', 'Aún no hay actividades publicadas.'));
    for (const actividad of alumno.actividades) {
      tarjeta.append(texto('h3', actividad.titulo), texto('p', actividad.fecha + ' · ' + actividad.resultado),
                     texto('p', actividad.observacion));
    }
    historial.append(tarjeta);
  }
  if (alumnos.some(alumno => String(alumno.id) === String(seleccion))) selector.value = seleccion;
  porId('edicion').hidden = !esProfesor || !alumnos.length;
}

function formulario(id, accion) {
  const form = porId(id);
  form.addEventListener('submit', async evento => {
    evento.preventDefault();
    const boton = form.querySelector('button');
    boton.disabled = true;
    porId('mensaje').textContent = '';
    try {
      await accion(Object.fromEntries(new FormData(form)), form);
    } catch (error) {
      porId('mensaje').textContent = error.message;
    } finally {
      boton.disabled = false;
    }
  });
}

function limpiarCodigo() {
  porId('entrega').hidden = true;
  porId('generado').value = '';
}

porId('alumno').addEventListener('change', () => {
  limpiarCodigo();
  porId('actividad').reset();
  porId('invitacion').reset();
});
porId('invitacion').addEventListener('input', limpiarCodigo);
formulario('alta', async (datos, form) => {
  datos.grado = Number(datos.grado);
  const alumno = await seguimiento('/alumnos', { metodo: 'POST', datos });
  limpiarCodigo();
  porId('invitacion').reset();
  porId('actividad').reset();
  form.reset();
  await cargar(alumno.id);
  porId('mensaje').textContent = 'Estudiante agregado.';
});
formulario('invitacion', async datos => {
  limpiarCodigo();
  const id = porId('alumno').value;
  const invitacion = await seguimiento('/alumnos/' + id + '/invitacion', { metodo: 'POST', datos });
  if (id !== porId('alumno').value || datos.correo !== porId('invitacion').elements.correo.value) return;
  porId('generado').value = invitacion.codigo;
  porId('entrega').hidden = false;
});
formulario('actividad', async (datos, form) => {
  await seguimiento('/alumnos/' + porId('alumno').value + '/actividad', { metodo: 'PUT', datos });
  form.reset();
  await cargar();
  porId('mensaje').textContent = 'Actividad publicada.';
});
formulario('vinculo', async (datos, form) => {
  await seguimiento('/vincular', { metodo: 'POST', datos });
  form.reset();
  await cargar();
  porId('mensaje').textContent = 'Estudiante vinculado.';
});
window.addEventListener('pageshow', evento => { if (evento.persisted) location.reload(); });

try {
  const cuenta = await sesion();
  if (cuenta.pendientes?.length) location.replace('index.html');
  else {
    esProfesor = cuenta.usuario.rol === 'administrador';
    await cargar();
    porId('profesor').hidden = !esProfesor;
    porId('vinculo').hidden = esProfesor;
  }
} catch (error) {
  if (error.status === 401) location.replace('index.html');
  else porId('mensaje').textContent = error.message;
}
