// Ayudas de las pruebas de navegador para el registro de adultos con el BUZÓN DE PRUEBAS local.
// El Compose de desarrollo (services/aula-api/compose.yaml) guarda cada correo como .eml en
// services/aula-api/dev/buzon (o AULA_BUZON). Nunca se envían correos reales.
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const BUZON = process.env.AULA_BUZON || new URL('../../services/aula-api/dev/buzon/', import.meta.url).pathname;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function decodificar(eml) {
  const [cabecera, ...resto] = eml.split(/\r?\n\r?\n/);
  let cuerpo = resto.join('\n\n');
  if (/content-transfer-encoding:\s*base64/i.test(cabecera)) cuerpo = Buffer.from(cuerpo.replace(/\s+/g, ''), 'base64').toString('utf8');
  else if (/content-transfer-encoding:\s*quoted-printable/i.test(cabecera)) {
    const bytes = cuerpo.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
    cuerpo = Buffer.from(bytes, 'latin1').toString('utf8');
  }
  return { cabecera, cuerpo };
}

/** Correos recibidos por «destino» (más antiguos primero). */
export function correosPara(destino) {
  if (!existsSync(BUZON)) return [];
  return readdirSync(BUZON).filter((n) => n.endsWith('.eml') && n.includes('-' + destino.toLowerCase())).sort()
    .map((n) => ({ archivo: n, ...decodificar(readFileSync(join(BUZON, n), 'utf8')) }));
}

/** Espera al correo número «n» (1 = primero) para «destino» y lo devuelve. */
export async function esperarCorreo(destino, n = 1, ms = 10000) {
  for (let t = 0; t < ms; t += 200) {
    const lista = correosPara(destino);
    if (lista.length >= n) return lista[n - 1];
    await espera(200);
  }
  throw new Error(`No llegó el correo ${n} para ${destino}`);
}

export function enlaceDe(correo, accion) {
  const m = correo.cuerpo.match(new RegExp('(\\S+#' + accion + '=[A-Za-z0-9_-]+)'));
  return m && m[1];
}

/** Simula una caída del servidor de correo (el buzón responde 451). */
export function fallarCorreo(activo) {
  const marca = join(BUZON, 'FALLAR');
  if (activo) writeFileSync(marca, '');
  else if (existsSync(marca)) unlinkSync(marca);
}

/** Alta completa por la API (registro + enlace del buzón + contraseña). Devuelve { status, json } de verificar. */
export async function crearCuenta(ctx, sitio, { nombre, correo, clave, curso }) {
  const cab = { Origin: sitio };
  const conf = await (await ctx.request.get(sitio + '/api/aula/config')).json();
  const previos = correosPara(correo).length;
  const r = await ctx.request.post(sitio + '/api/aula/registro', { headers: cab, data: {
    nombre, correo, clave, mayor_de_edad: true, terminos: conf.documentos.terminos.version,
    datos: conf.documentos.datos.version, ...(curso ? { curso } : {}) } });
  if (r.status() !== 202) throw new Error('registro: ' + r.status() + ' ' + await r.text());
  const enlace = enlaceDe(await esperarCorreo(correo, previos + 1), 'verificar');
  const token = enlace.split('#verificar=')[1];
  const v = await ctx.request.post(sitio + '/api/aula/cuenta/verificar', { headers: cab, data: { token, clave } });
  return { status: v.status(), json: await v.json() };
}
