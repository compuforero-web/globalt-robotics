#!/usr/bin/env python3
"""Genera la guía rellenable del ensayo final de octavo (PDF con casillas Pasó/Falló/Pendiente y observaciones).

Uso: python3 deploy/ensayo-octavo/guia/generar_guia.py [salida.pdf]
Requiere reportlab (pip install reportlab). Los textos describen lo que muestra la réplica de deploy/ensayo-octavo;
tests/e2e/ensayo-octavo.e2e.mjs recorre los mismos pasos en CI.
"""
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (Flowable, KeepTogether, PageBreak, Paragraph, Preformatted, SimpleDocTemplate,
                                Spacer, Table, TableStyle)

RAIZ = Path(__file__).resolve().parents[3]
SALIDA = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name('Guia_ensayo_octavo.pdf')

FUENTES = Path('/usr/share/fonts/truetype/dejavu')
if (FUENTES / 'DejaVuSans.ttf').exists():
    pdfmetrics.registerFont(TTFont('Texto', FUENTES / 'DejaVuSans.ttf'))
    pdfmetrics.registerFont(TTFont('Texto-B', FUENTES / 'DejaVuSans-Bold.ttf'))
    pdfmetrics.registerFont(TTFont('Mono', FUENTES / 'DejaVuSansMono.ttf'))
    pdfmetrics.registerFontFamily('Texto', normal='Texto', bold='Texto-B', italic='Texto', boldItalic='Texto-B')
    TEXTO, NEGRITA, MONO = 'Texto', 'Texto-B', 'Mono'
else:   # Helvetica cubre las tildes del español
    TEXTO, NEGRITA, MONO = 'Helvetica', 'Helvetica-Bold', 'Courier'

TINTA = colors.HexColor('#132f3c')
ACENTO = colors.HexColor('#1e7d6b')
SUAVE = colors.HexColor('#e8f1ef')
GRIS = colors.HexColor('#5b6b72')
CAMPO = colors.HexColor('#f7fbff')

base = ParagraphStyle('base', fontName=TEXTO, fontSize=9.6, leading=13, textColor=TINTA, alignment=TA_LEFT)
pequeno = ParagraphStyle('pequeno', parent=base, fontSize=8.4, leading=11, textColor=GRIS)
titulo = ParagraphStyle('titulo', parent=base, fontName=NEGRITA, fontSize=20, leading=24, spaceAfter=4)
subtitulo = ParagraphStyle('subtitulo', parent=base, fontSize=11, leading=15, textColor=GRIS, spaceAfter=10)
seccion = ParagraphStyle('seccion', parent=base, fontName=NEGRITA, fontSize=13.5, leading=17, textColor=ACENTO,
                         spaceBefore=8, spaceAfter=5)
rotulo = ParagraphStyle('rotulo', parent=base, fontName=NEGRITA, fontSize=8.4, leading=11, textColor=ACENTO)
encabezado = ParagraphStyle('encabezado', parent=base, fontName=NEGRITA, fontSize=10.5, leading=14, textColor=colors.white)
codigo = ParagraphStyle('codigo', parent=base, fontName=MONO, fontSize=8.6, leading=11.2, backColor=SUAVE,
                        borderPadding=(5, 6, 5, 6), leftIndent=6, rightIndent=6, spaceBefore=3, spaceAfter=7)

ANCHO = letter[0] - 2 * 16 * mm


def cmd(texto):
    return Preformatted(texto, codigo)


def p(texto, estilo=base):
    return Paragraph(texto, estilo)


class Prueba(Flowable):
    """Bloque de una prueba: qué hago, qué debería ver, Pasó/Falló/Pendiente y observación, todo rellenable."""

    def __init__(self, ident, nombre, hago, veo, extra=None, alto_obs=34):
        super().__init__()
        self.ident, self.nombre, self.extra, self.alto_obs = ident, nombre, extra or [], alto_obs
        self.cabecera = Paragraph(f'{ident} · {nombre}', encabezado)
        self.partes = [(Paragraph('QUÉ HAGO', rotulo), [Paragraph(t, base) for t in hago]),
                       (Paragraph('QUÉ DEBERÍA VER', rotulo), [Paragraph(t, base) for t in veo])]

    def wrap(self, ancho, alto):
        self.ancho = ancho
        interior = ancho - 16
        h = 6 + self.cabecera.wrap(interior, alto)[1] + 6
        for et, textos in self.partes:
            h += et.wrap(interior, alto)[1] + 1
            for t in textos:
                h += t.wrap(interior - 10, alto)[1] + 2
            h += 4
        h += len(self.extra) * 22
        h += 22 + 12 + self.alto_obs + 8
        self.alto = h
        return ancho, h

    def draw(self):
        c, w, h = self.canv, self.ancho, self.alto
        interior = w - 16
        c.setStrokeColor(colors.HexColor('#b8cbc7'))
        c.setLineWidth(0.8)
        c.roundRect(0, 0, w, h, 5)
        hc = self.cabecera.wrap(interior, h)[1]
        c.setFillColor(TINTA)
        c.roundRect(0, h - hc - 12, w, hc + 12, 5, stroke=0, fill=1)
        c.rect(0, h - hc - 12, w, 6, stroke=0, fill=1)
        self.cabecera.drawOn(c, 8, h - hc - 6)
        y = h - hc - 12 - 6
        for et, textos in self.partes:
            eh = et.wrap(interior, h)[1]
            y -= eh
            et.drawOn(c, 8, y)
            y -= 1
            for t in textos:
                th = t.wrap(interior - 10, h)[1]
                y -= th
                t.drawOn(c, 18, y)
                y -= 2
            y -= 4
        form = c.acroForm
        for nombre, etiqueta in self.extra:
            y -= 20
            c.setFont(TEXTO, 8.8)
            c.setFillColor(TINTA)
            c.drawString(8, y + 5, etiqueta)
            form.textfield(name=f'{self.ident}_{nombre}', tooltip=f'{self.ident}: {etiqueta}', x=200, y=y, width=w - 208,
                           height=16, borderColor=GRIS, fillColor=CAMPO, borderWidth=0.6, fontSize=9, maxlen=120,
                           relative=True)
            y -= 2
        # Resultado: un grupo de opciones por prueba; empieza en «Pendiente».
        y -= 18
        c.setFont(NEGRITA, 9.2)
        c.setFillColor(TINTA)
        c.drawString(8, y + 4, 'Resultado:')
        x = 74
        for valor, texto in (('Paso', 'Pasó'), ('Fallo', 'Falló'), ('Pendiente', 'Pendiente')):
            form.radio(name=f'{self.ident}_resultado', value=valor, selected=valor == 'Pendiente', x=x, y=y, size=13,
                       buttonStyle='circle', shape='circle', borderColor=TINTA, fillColor=colors.white,
                       textColor=ACENTO, borderWidth=1, tooltip=f'{self.ident}: {texto}', relative=True)
            c.setFont(TEXTO, 9.2)
            c.drawString(x + 17, y + 3, texto)
            x += 80
        y -= 12
        c.setFont(TEXTO, 8.2)
        c.setFillColor(GRIS)
        c.drawString(8, y, 'Observación breve:')
        y -= self.alto_obs + 2
        form.textfield(name=f'{self.ident}_observacion', tooltip=f'{self.ident}: observación', x=8, y=y,
                       width=w - 16, height=self.alto_obs, borderColor=GRIS, fillColor=CAMPO, borderWidth=0.6,
                       fieldFlags='multiline', fontSize=9, maxlen=600, relative=True)


class Campos(Flowable):
    """Fila de campos de texto con etiqueta, para los datos generales del ensayo."""

    def __init__(self, campos, alto=17):
        super().__init__()
        self.campos, self.h = campos, alto

    def wrap(self, ancho, alto):
        self.ancho = ancho
        return ancho, len(self.campos) * (self.h + 6)

    def draw(self):
        c = self.canv
        y = len(self.campos) * (self.h + 6)
        for nombre, etiqueta, valor in self.campos:
            y -= self.h + 6
            c.setFont(TEXTO, 9.2)
            c.setFillColor(TINTA)
            c.drawString(0, y + 5, etiqueta)
            c.acroForm.textfield(name=nombre, tooltip=etiqueta, value=valor, x=170, y=y, width=self.ancho - 170,
                                 height=self.h, borderColor=GRIS, fillColor=CAMPO, borderWidth=0.6, fontSize=9.5,
                                 maxlen=160, relative=True)


def pie(c, doc):
    c.saveState()
    c.setFont(TEXTO, 7.8)
    c.setFillColor(GRIS)
    c.drawString(16 * mm, 10 * mm, 'Ensayo final · Octavo · Liceo Campestre · Réplica con datos ficticios')
    c.drawRightString(letter[0] - 16 * mm, 10 * mm, f'Página {doc.page}')
    c.restoreState()


def programa_correcto():
    lineas = (RAIZ / 'tests/fixtures/laboratorio/ultra-solucion.ino').read_text(encoding='utf-8').splitlines()
    return '\n'.join(l for l in lineas if not l.startswith('// Solución de referencia'))


def contenido():
    s = []
    s += [p('Ensayo final de octavo', titulo),
          p('Muestra del Liceo Campestre · lunes 30 de noviembre de 2026 · rama <b>ensayo/liceo-octavo-integrado</b>',
            subtitulo)]
    s.append(Campos([
        ('general_fecha', 'Fecha y hora del ensayo', ''),
        ('general_ip', 'IP del servidor (DIRECCION)', ''),
        ('general_equipo', 'Navegador del profesor', ''),
        ('general_celular', 'Celular y navegador', ''),
    ]))
    s.append(Spacer(1, 6))
    s.append(p('<b>Cómo usar esta guía.</b> Abre el PDF en un lector que guarde formularios (Firefox, Chrome, Okular, '
               'Adobe Acrobat Reader o Xodo en el celular). En cada prueba haz lo indicado en «Qué hago», compara con '
               '«Qué debería ver» y marca <b>Pasó</b>, <b>Falló</b> o deja <b>Pendiente</b> (marcado de entrada). '
               'Escribe una observación breve si algo cambia. Al terminar, guarda el archivo con el mismo nombre o '
               'con la fecha: el resultado queda dentro del PDF y no hace falta copiar registros.'))
    s.append(Spacer(1, 4))
    s.append(p('<b>Terminal solo al inicio (sección A) y al cierre (sección F).</b> Todo lo demás se hace en el '
               'navegador del computador y en el celular. Los correos, alumnos y familias son ficticios; la réplica '
               'tiene su propia base, su propio buzón y un puerto distinto (18180); no toca la instalación pública.'))
    s.append(Spacer(1, 6))
    datos = [['Dato ficticio', 'Valor'],
             ['Profesor', 'profesor.octavo@example.com (la clave la imprime A2)'],
             ['Estudiantes de 8.°', 'Estudiante Sol · Estudiante Viento (ya creados)'],
             ['Familia 1', 'Familia Sol · familia.sol@example.com'],
             ['Familia 2', 'Familia Viento · familia.viento@example.com'],
             ['Contraseña de las familias', 'Solo-ensayo-octavo-2027 (o otra de 10+ caracteres)'],
             ['Dirección en el celular', 'http://DIRECCION:18180/aula/'],
             ['Buzón de ensayo', 'http://DIRECCION:18180/buzon-ensayo/']]
    tabla = Table([[p(a, rotulo if i == 0 else base), p(b, rotulo if i == 0 else base)] for i, (a, b) in enumerate(datos)],
                  colWidths=[ANCHO * 0.32, ANCHO * 0.68])
    tabla.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), SUAVE), ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#b8cbc7')),
                               ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 3),
                               ('BOTTOMPADDING', (0, 0), (-1, -1), 3)]))
    s += [tabla, Spacer(1, 4),
          p('DIRECCION es la IP del servidor que alcanza el celular (misma red Wi-Fi o Tailscale). Escríbela arriba.',
            pequeno)]

    # ---------- A. Inicio en la terminal ----------
    s += [PageBreak(), p('A. Inicio en la terminal del servidor Linux', seccion),
          p('Ejecuta estos comandos con el usuario que usa Docker, dentro de la copia del repositorio dedicada a la '
            'muestra. Deja la terminal abierta: en A2 muestra la clave del profesor.'),
          Spacer(1, 4),
          cmd('git fetch origin\ngit switch ensayo/liceo-octavo-integrado\ngit pull --ff-only\nhostname -I'),
          p('Si ya habías hecho un ensayo antes, empieza de cero (pide escribir LIMPIAR; solo borra la réplica):'),
          cmd('bash deploy/ensayo-octavo/ensayo.sh limpiar'),
          p('Arranca la réplica con la IP del servidor que viste en <i>hostname -I</i> (por ejemplo 192.168.1.40):'),
          cmd('bash deploy/ensayo-octavo/ensayo.sh iniciar DIRECCION'),
          p('El primer arranque construye el compilador de Arduino y puede tardar varios minutos. Los siguientes '
            'arranques reutilizan la IP guardada: basta con <i>ensayo.sh iniciar</i>.', pequeno),
          Spacer(1, 6)]
    s.append(KeepTogether(Prueba('A1', 'Rama al día y Docker disponible', [
        'Ejecuta el primer bloque de comandos.',
    ], [
        '<i>git switch</i> y <i>git pull</i> terminan sin errores y la rama es <b>ensayo/liceo-octavo-integrado</b>.',
        '<i>hostname -I</i> muestra la IP del servidor en la red del celular. Anótala en la primera página.',
    ])))
    s.append(Spacer(1, 6))
    s.append(KeepTogether(Prueba('A2', 'Réplica iniciada con la IP del servidor', [
        'Ejecuta <i>ensayo.sh limpiar</i> (si aplica) y luego <i>ensayo.sh iniciar DIRECCION</i>.',
    ], [
        'Al final: «Réplica de ensayo lista (datos ficticios; producción no se toca).»',
        'Debajo, cinco líneas: «En este equipo», «En el celular: http://DIRECCION:18180/aula/», «Buzón de ensayo», '
        '«Profesor: profesor.octavo@example.com» y «Clave: …» (40 caracteres).',
        'Si aparece «El servicio … de la réplica no está en marcha», marca Falló y anota el servicio.',
    ])))
    s.append(Spacer(1, 6))
    s.append(KeepTogether(Prueba('A3', 'El celular abre la réplica', [
        'En el celular, conectado a la misma red, abre <b>http://DIRECCION:18180/aula/</b>.',
    ], [
        'La página «Aula» de GLOBALT Robotics con las pestañas «Iniciar sesión» y «Crear cuenta».',
        'Si no carga y el servidor usa cortafuegos, permite el puerto 18180 solo para tu red local (anótalo para el '
        'cierre), por ejemplo: <i>sudo ufw allow from 192.168.1.0/24 to any port 18180 proto tcp</i>.',
    ])))

    # ---------- B. Profesor ----------
    s += [PageBreak(), p('B. Profesor en el computador', seccion),
          p('Usa una <b>ventana privada</b> del navegador para no arrastrar sesiones ni borradores de ensayos '
            'anteriores. En el servidor puedes usar http://127.0.0.1:18180; desde otro computador, http://DIRECCION:18180.'),
          Spacer(1, 6)]
    s.append(KeepTogether(Prueba('B1', 'Entrar como profesor', [
        'Abre <b>/aula/</b>, pestaña «Iniciar sesión».',
        'Correo <b>profesor.octavo@example.com</b> y la clave que mostró A2. Pulsa «Iniciar sesión».',
        'La primera vez aparece «Revisa los documentos del Aula»: marca las casillas y pulsa «Aceptar y continuar».',
    ], [
        'La pantalla «Mis cursos» con el curso de Arduino, el botón «Cerrar sesión» y el enlace «Seguimiento familiar».',
        'Los documentos llevan el aviso «Textos provisionales solo para pruebas».',
    ])))
    s.append(Spacer(1, 6))
    s.append(KeepTogether(Prueba('B2', 'Abrir la clase de la cartilla', [
        'Abre <b>/programa/octavo.html</b>.',
        'En «Trimestre 2 · Pongo a prueba el sensor», busca «¿Cuándo debe frenar el robot? Pruebo 19, 20 y 21 cm» y '
        'pulsa <b>«Abrir el reto de 19, 20 y 21 cm»</b>.',
    ], [
        'La página «¿Cuándo debe frenar el robot?» con la regla del equipo: «detenerse a <b>20 cm o menos</b>».',
        'Un selector de comparación, un umbral en cm, el control «Distancia de prueba» y el botón «Comprobar mi regla».',
    ])))
    s.append(Spacer(1, 6))
    s.append(KeepTogether(Prueba('B3', 'Regla incompleta: «es menor que» 20 cm', [
        'Elige «es menor que» y escribe <b>20</b> en el umbral.',
        'Haz clic en el control de distancia y usa las flechas ← → del teclado hasta leer 19 cm, luego 20 cm y 21 cm.',
        'Pulsa «Comprobar mi regla».',
    ], [
        '19 cm: «El robot se detiene.» · 20 cm: «El robot avanza.» · 21 cm: «El robot avanza.»',
        'Al comprobar: «Revisa el caso de 20 cm. Tu robot debería detenerse.» (la igualdad queda fuera).',
    ])))
    s.append(Spacer(1, 6))
    s.append(KeepTogether(Prueba('B4', 'Regla correcta: «es menor o igual que» 20 cm', [
        'Cambia a «es menor o igual que», deja el umbral en 20 y repite 19, 20 y 21 cm.',
        'Pulsa «Comprobar mi regla».',
    ], [
        '19 cm y 20 cm: «El robot se detiene.» · 21 cm: «El robot avanza.»',
        'Al comprobar: «Reto superado. Tu regla respondió correctamente en las cinco pruebas.»',
    ])))
    s.append(Spacer(1, 6))
    s.append(KeepTogether(Prueba('B5', 'Kit físico: obstáculo a 19, 20 y 21 cm', [
        'Con el vehículo y el programa de la muestra (regla: detenerse a 20 cm o menos), mide con una regla desde el '
        'frente del sensor y coloca el obstáculo a 19, 20 y 21 cm. Anota la lectura y lo que hizo el vehículo.',
    ], [
        'A 19 y 20 cm el vehículo se detiene; a 21 cm avanza.',
        'La lectura del sensor coincide con la regla de medir dentro de ±1 cm. Si no, anota la discrepancia: es '
        'material para la actividad «Presento las lecturas y explico una discrepancia».',
    ], extra=[('19cm', '19 cm · lectura y acción'), ('20cm', '20 cm · lectura y acción'),
              ('21cm', '21 cm · lectura y acción')])))
    s.append(Spacer(1, 6))
    s.append(KeepTogether(Prueba('B6', 'Abrir la primera fase del laboratorio', [
        'Vuelve a /programa/octavo.html y pulsa <b>«Abrir la primera fase · Medir distancia»</b>.',
    ], [
        'El laboratorio de Arduino con la lista «Octavo · Fase 1 de 5»: «1. Medir distancia» y las fases 2 a 5 con '
        '«Pendiente de la fase anterior».',
        'El editor muestra el código inicial, que escribe «Eco: … us» en el monitor serie.',
    ])))
    s.append(Spacer(1, 6))
    s.append(KeepTogether(Prueba('B7', 'Programa incorrecto: la segunda fase sigue bloqueada', [
        'Sin cambiar el código inicial (mide el eco pero no escribe «Distancia: N cm»), pulsa <b>«Comprobar reto»</b>.',
        'Espera: compila de verdad y simula unos segundos (hasta un minuto).',
    ], [
        'El aviso «El reto aún no se cumple.» con el criterio que falló.',
        'En la lista, «2. Alerta de cercanía» sigue como «Pendiente de la fase anterior», sin enlace.',
    ])))
    s.append(Spacer(1, 6))
    s.append(KeepTogether(Prueba('B8', 'Entrada directa a la fase 2 bloqueada', [
        'En la barra de direcciones abre: <b>…:18180/games/laboratorio-arduino/index.html?grado=8&amp;leccion=arduino-ultrasonico-alerta</b>',
    ], [
        'La página «Laboratorio de octavo» con «Completa las fases en orden con el botón «Comprobar reto».» y el enlace '
        '«Abrir mi fase disponible». No se abre el editor de la fase 2.',
    ])))
    s.append(Spacer(1, 6))
    s.append(KeepTogether(Prueba('B9', 'Programa correcto: la segunda fase se habilita', [
        'Pulsa «Abrir mi fase disponible» (vuelve a la fase 1).',
        'En el editor selecciona todo (Ctrl+A) y reemplázalo por el programa del <b>Anexo 1</b>. Pulsa «Comprobar reto».',
    ], [
        'El aviso «Reto superado».',
        'En la lista: «1. Medir distancia · Superada» y «2. Alerta de cercanía» ya es un enlace.',
    ])))
    s.append(Spacer(1, 6))
    s.append(KeepTogether(Prueba('B10', 'Abrir la segunda fase', [
        'Pulsa «2. Alerta de cercanía» en la lista.',
    ], [
        'La lista dice «Octavo · Fase 2 de 5»; las fases 3 a 5 siguen «Pendiente de la fase anterior».',
        'Al recargar la página la fase 1 sigue superada (el progreso queda en la cuenta del profesor).',
    ])))

    # ---------- C. Profesor prepara a las familias ----------
    s += [PageBreak(), p('C. El profesor publica la observación e invita a las familias', seccion),
          p('En el computador: en «Mis cursos» pulsa «Seguimiento familiar» (o abre /aula/familias.html). El código de '
            'invitación es largo; envíalo a tu celular por el medio que usarías con una familia (por ejemplo, un '
            'mensaje a ti mismo) y cópialo desde allí. Cada código sirve una vez, solo para el correo invitado, '
            'durante siete días.'),
          Spacer(1, 6)]
    s.append(KeepTogether(Prueba('C1', 'Publicar la observación de Estudiante Sol', [
        'Elige «Estudiante Sol · 8°». Actividad: <b>¿Cuándo debe frenar el robot?</b> · Fecha: 30/11/2026 · Resultado: '
        'Logrado · Observación: escribe tu observación y cópiala también en el campo de abajo.',
        'Pulsa «Publicar para la familia».',
    ], [
        'El mensaje «Actividad publicada.» y, en la tarjeta de Estudiante Sol, el título, «2026-11-30 · Logrado» y tu '
        'observación.',
    ], extra=[('texto', 'Texto exacto de mi observación')])))
    s.append(Spacer(1, 6))
    s.append(KeepTogether(Prueba('C2', 'Código para la familia Sol', [
        'Con «Estudiante Sol · 8°» elegido, abre «Invitar a un acudiente», escribe <b>familia.sol@example.com</b> y '
        'pulsa «Generar código». Envía el código a tu celular.',
    ], [
        '«Comparte este código con el acudiente. Vence en siete días.» y un código largo en un campo de solo lectura.',
    ])))
    s.append(Spacer(1, 6))
    s.append(KeepTogether(Prueba('C3', 'Observación y código de Estudiante Viento', [
        'Elige «Estudiante Viento · 8°» y publica una observación <b>distinta</b> (misma actividad y fecha).',
        'Genera el código para <b>familia.viento@example.com</b> y envíalo también al celular, indicando que es de Viento.',
    ], [
        '«Actividad publicada.» en la tarjeta de Estudiante Viento; al cambiar de estudiante el código anterior '
        'desaparece del formulario y se genera uno nuevo.',
    ], extra=[('texto', 'Texto exacto de la observación de Viento')])))

    # ---------- D. Familia 1 ----------
    s += [PageBreak(), p('D. Familia Sol desde el celular', seccion),
          p('Usa el navegador habitual del celular, en una pestaña normal.'), Spacer(1, 6)]
    s.append(KeepTogether(Prueba('D1', 'Registro del acudiente', [
        'Abre http://DIRECCION:18180/aula/ → «Crear cuenta» → «Sí, tengo 18 años o más».',
        'Nombre: Familia Sol · Correo: familia.sol@example.com · Contraseña y confirmación · marca las dos casillas de '
        'documentos · «Crear cuenta».',
    ], [
        'El aviso «Textos provisionales solo para pruebas» junto a los documentos.',
        'La pantalla «Revisa tu correo».',
    ])))
    s.append(Spacer(1, 6))
    s.append(KeepTogether(Prueba('D2', 'Verificación en el buzón de ensayo', [
        'Abre http://DIRECCION:18180/buzon-ensayo/, escribe familia.sol@example.com y pulsa «Buscar mis mensajes».',
        'Pulsa «Confirmar mi correo», escribe la contraseña y pulsa «Confirmar y entrar».',
    ], [
        'Un mensaje «Confirma tu correo · Aula GLOBALT ROBOTICS» con el botón «Confirmar mi correo» (si aún no aparece, '
        'espera unos segundos y busca de nuevo). No aparecen mensajes de otros correos.',
        'Tras confirmar: «Correo confirmado. Tu cuenta está lista.» y la pantalla «Mis cursos».',
    ])))
    s.append(Spacer(1, 6))
    s.append(KeepTogether(Prueba('D3', 'Vinculación con Estudiante Sol', [
        'Pulsa «Seguimiento familiar», pega el código de Sol y pulsa «Vincular estudiante».',
    ], [
        '«Estudiante vinculado.» y una tarjeta «Estudiante Sol · 8°».',
        'No aparecen los formularios del profesor (agregar estudiante, publicar, invitar).',
    ])))
    s.append(Spacer(1, 6))
    s.append(KeepTogether(Prueba('D4', 'Consulta de mi observación', [
        'Lee la tarjeta y recarga la página.',
    ], [
        '«¿Cuándo debe frenar el robot?», «2026-11-30 · Logrado» y exactamente el texto anotado en C1.',
        'Una sola tarjeta: no aparece Estudiante Viento ni su observación, tampoco después de recargar.',
    ])))
    s.append(Spacer(1, 6))
    s.append(KeepTogether(Prueba('D5', 'Cerrar la sesión de la familia Sol', [
        'Vuelve al Aula y pulsa «Cerrar sesión».',
    ], [
        'Se muestran de nuevo «Iniciar sesión» y «Crear cuenta».',
    ])))

    # ---------- E. Familia 2 ----------
    s += [PageBreak(), p('E. Segunda familia: cada una ve solo a su hijo', seccion), Spacer(1, 4)]
    s.append(KeepTogether(Prueba('E1', 'Registro y verificación de la familia Viento', [
        'Repite D1 y D2 con Nombre: Familia Viento y Correo: familia.viento@example.com.',
    ], [
        'En el buzón, al buscar familia.viento@example.com solo aparece su mensaje; tras confirmar, «Mis cursos».',
    ])))
    s.append(Spacer(1, 6))
    s.append(KeepTogether(Prueba('E2', 'El código de otra familia no sirve', [
        'En «Seguimiento familiar» de la familia Viento, pega el código de <b>Sol</b> y pulsa «Vincular estudiante».',
    ], [
        'El mensaje «Revisa el código y el correo verificado de tu cuenta.» y ninguna tarjeta de estudiante.',
    ])))
    s.append(Spacer(1, 6))
    s.append(KeepTogether(Prueba('E3', 'La familia Viento ve solo a Estudiante Viento', [
        'Pega ahora el código de Viento y pulsa «Vincular estudiante». Recarga la página.',
    ], [
        '«Estudiante vinculado.» y una sola tarjeta «Estudiante Viento · 8°» con la observación anotada en C3.',
        'No aparece Estudiante Sol ni la observación de C1.',
    ])))
    s.append(Spacer(1, 6))
    s.append(KeepTogether(Prueba('E4', 'La familia Sol sigue viendo solo a Estudiante Sol', [
        'Cierra la sesión de Viento, entra con familia.sol@example.com y abre «Seguimiento familiar».',
    ], [
        'Una sola tarjeta «Estudiante Sol · 8°» con la observación de C1. Nada de Viento.',
    ])))
    s.append(Spacer(1, 6))
    s.append(KeepTogether(Prueba('E5', 'El profesor ve a los dos estudiantes', [
        'En el computador, recarga «Seguimiento familiar» del profesor.',
    ], [
        'El selector incluye «Estudiante Sol · 8°» y «Estudiante Viento · 8°»; cada tarjeta con su propia observación.',
    ])))

    # ---------- F. Cierre ----------
    s += [PageBreak(), p('F. Cierre', seccion)]
    s.append(KeepTogether(Prueba('F1', 'El registro público de producción sigue cerrado', [
        'En el celular, con datos móviles o Wi-Fi, abre <b>https://globalt-robotics.com/api/aula/config</b>.',
    ], [
        'Un texto que incluye <b>"registro_abierto": false</b>. (La réplica sí lo tiene abierto, solo en el puerto 18180.)',
    ])))
    s.append(Spacer(1, 6))
    s.append(p('En la terminal del servidor, detén la réplica. Las cuentas y el progreso se conservan para el lunes; '
               'para repetir el ensayo desde cero usa <i>limpiar</i> y luego <i>iniciar DIRECCION</i>. Si abriste el '
               'puerto en el cortafuegos (A3), ciérralo.'))
    s.append(cmd('bash deploy/ensayo-octavo/ensayo.sh detener'))
    s.append(KeepTogether(Prueba('F2', 'Réplica detenida', [
        'Ejecuta <i>ensayo.sh detener</i> (y, si aplica, retira la regla del cortafuegos de A3).',
    ], [
        '«Réplica detenida. Cuentas y progreso se conservan; para borrarlos: ensayo.sh limpiar»',
        'En el celular, http://DIRECCION:18180/aula/ ya no carga.',
    ])))
    s.append(Spacer(1, 8))
    s.append(KeepTogether(Prueba('F3', 'Decisión para la muestra del lunes', [
        'Revisa las pruebas marcadas. Marca Pasó si la muestra está lista, Falló si algo la impide, o Pendiente.',
    ], [
        'Todas las pruebas de A a F en Pasó, o una observación que explique cada excepción.',
    ], alto_obs=60)))

    # ---------- Anexos ----------
    s += [PageBreak(), p('Anexo 1 · Programa correcto para la fase 1 (Medir distancia)', seccion),
          p('Reemplaza todo el contenido del editor por este programa. Puedes copiarlo desde el PDF o escribirlo: '
            'dispara el sensor con 10 µs, mide el eco con pulseIn, lo convierte a centímetros (µs / 58) y escribe '
            '«Distancia: N cm» cada 100 ms.'),
          cmd(programa_correcto()),
          p('El código inicial del laboratorio es el «programa incorrecto» de B7: mide el eco pero escribe '
            '«Eco: … us» cada 500 ms, así que no cumple el formato ni el ritmo del reto.', pequeno),
          Spacer(1, 8),
          p('Anexo 2 · Si algo no sale como se espera', seccion)]
    problemas = [
        ('El celular no abre la réplica', 'Celular y servidor en la misma red; IP correcta en A2; puerto 18180 '
         'permitido en el cortafuegos (A3). La réplica nunca se publica en 0.0.0.0.'),
        ('«La cuenta existente no coincide con esta réplica»', 'Quedó una base de un ensayo anterior con otra clave: '
         'ejecuta ensayo.sh limpiar y vuelve a iniciar.'),
        ('El buzón dice «Todavía no hay mensajes»', 'Revisa que el correo sea exactamente el del registro. Espera unos '
         'segundos y busca otra vez. En «Revisa tu correo» puedes pulsar «Reenviar el enlace».'),
        ('B7 ya aparece superada', 'La cuenta del profesor conserva un ensayo anterior: limpia la réplica antes de '
         'empezar.'),
        ('«Comprobar reto» tarda', 'La primera compilación tras arrancar es la más lenta. Espera hasta un minuto antes '
         'de marcar Falló.'),
        ('«Revisa el código y el correo verificado» con el código correcto', 'El código se generó para otro correo, '
         'ya se usó o se regeneró después (solo vale el último). Genera uno nuevo en C2 o C3.'),
    ]
    tabla = Table([[p('<b>' + a + '</b>'), p(b)] for a, b in problemas], colWidths=[ANCHO * 0.34, ANCHO * 0.66])
    tabla.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#b8cbc7')),
                               ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 3),
                               ('BOTTOMPADDING', (0, 0), (-1, -1), 4)]))
    s.append(tabla)
    return s


def main():
    doc = SimpleDocTemplate(str(SALIDA), pagesize=letter, leftMargin=16 * mm, rightMargin=16 * mm,
                            topMargin=15 * mm, bottomMargin=17 * mm, title='Ensayo final de octavo',
                            author='GLOBALT Robotics', subject='Guía rellenable del ensayo de la muestra de octavo',
                            lang='es-CO')
    doc.build(contenido(), onFirstPage=pie, onLaterPages=pie)
    print(SALIDA)


if __name__ == '__main__':
    main()
