#!/usr/bin/env python3
"""Convierte Revision_concordancia_octavo.md en PDF para descargar desde la PR.

Uso: python3 deploy/ensayo-octavo/revision/generar_revision.py   (requiere reportlab)
Admite el Markdown que usa la revisión: títulos, párrafos, listas, tablas, **negrita**, *cursiva* y `código`.
"""
import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

AQUI = Path(__file__).resolve().parent
FUENTE, SALIDA = AQUI / 'Revision_concordancia_octavo.md', AQUI / 'Revision_concordancia_octavo.pdf'
DEJAVU = Path('/usr/share/fonts/truetype/dejavu')
if (DEJAVU / 'DejaVuSans.ttf').exists():
    for nombre, archivo in (('T', 'DejaVuSans'), ('T-B', 'DejaVuSans-Bold'), ('T-I', 'DejaVuSans-Oblique'),
                            ('M', 'DejaVuSansMono')):
        ruta = DEJAVU / f'{archivo}.ttf'
        pdfmetrics.registerFont(TTFont(nombre, ruta if ruta.exists() else DEJAVU / 'DejaVuSans.ttf'))
    pdfmetrics.registerFontFamily('T', normal='T', bold='T-B', italic='T-I', boldItalic='T-B')
    T, TB, M = 'T', 'T-B', 'M'
else:
    T, TB, M = 'Helvetica', 'Helvetica-Bold', 'Courier'

TINTA, ACENTO, LINEA = colors.HexColor('#132f3c'), colors.HexColor('#1e7d6b'), colors.HexColor('#b8cbc7')
base = ParagraphStyle('b', fontName=T, fontSize=8.6, leading=11.4, textColor=TINTA, spaceAfter=3)
celda = ParagraphStyle('c', parent=base, fontSize=7.8, leading=9.8, spaceAfter=0)
h1 = ParagraphStyle('h1', parent=base, fontName=TB, fontSize=16, leading=20, spaceAfter=2)
h2 = ParagraphStyle('h2', parent=base, fontName=TB, fontSize=11, leading=14, textColor=ACENTO, spaceBefore=6, keepWithNext=1)
ANCHO = letter[0] - 28 * mm


def enlinea(texto):
    t = html.escape(texto, quote=False)
    t = re.sub(r'`([^`]+)`', rf'<font name="{M}">\1</font>', t)
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    return re.sub(r'(?<![\w*])\*([^*]+)\*(?!\w)', r'<i>\1</i>', t)


def bloques(lineas):
    i = 0
    while i < len(lineas):
        l = lineas[i]
        if not l.strip():
            i += 1
        elif l.startswith('# '):
            yield 'h1', l[2:]; i += 1
        elif l.startswith('## '):
            yield 'h2', l[3:]; i += 1
        elif l.startswith('|'):
            filas = []
            while i < len(lineas) and lineas[i].startswith('|'):
                if not re.match(r'^\|[\s:|-]+\|$', lineas[i]):
                    filas.append([c.strip() for c in lineas[i].strip().strip('|').split('|')])
                i += 1
            yield 'tabla', filas
        elif re.match(r'^(- |\d+\. )', l):
            ordenada, items = bool(re.match(r'^\d+\. ', l)), []
            while i < len(lineas) and (re.match(r'^(- |\d+\. )', lineas[i]) or lineas[i].startswith('  ')):
                if lineas[i].startswith('  '):
                    items[-1] += ' ' + lineas[i].strip()
                else:
                    items.append(re.sub(r'^(- |\d+\. )', '', lineas[i]))
                i += 1
            yield ('ol' if ordenada else 'ul'), items
        else:
            parrafo = []
            while i < len(lineas) and lineas[i].strip() and not re.match(r'^(#|\||- |\d+\. )', lineas[i]):
                parrafo.append(lineas[i].strip()); i += 1
            yield 'p', ' '.join(parrafo)


def historia():
    s = []
    for tipo, dato in bloques(FUENTE.read_text(encoding='utf-8').splitlines()):
        if tipo in ('h1', 'h2', 'p'):
            s.append(Paragraph(enlinea(dato), {'h1': h1, 'h2': h2, 'p': base}[tipo]))
        elif tipo in ('ul', 'ol'):
            s.append(ListFlowable([ListItem(Paragraph(enlinea(x), base), leftIndent=12) for x in dato],
                                  bulletType='1' if tipo == 'ol' else 'bullet', start=None if tipo == 'ol' else '•',
                                  leftIndent=12, bulletFontSize=8))
        else:
            n = len(dato[0])
            pesos = {3: [0.2, 0.4, 0.4], 2: [0.3, 0.7]}.get(n, [1 / n] * n)
            t = Table([[Paragraph(('<b>%s</b>' if r == 0 else '%s') % enlinea(c), celda) for c in fila]
                       for r, fila in enumerate(dato)], colWidths=[ANCHO * w for w in pesos], repeatRows=1)
            t.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.4, LINEA), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                                   ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8f1ef')),
                                   ('TOPPADDING', (0, 0), (-1, -1), 2), ('BOTTOMPADDING', (0, 0), (-1, -1), 2)]))
            s += [Spacer(1, 2), t, Spacer(1, 4)]
    return s


def pie(c, doc):
    c.setFont(T, 7.5)
    c.setFillColor(colors.HexColor('#5b6b72'))
    c.drawString(14 * mm, 9 * mm, 'Revisión de concordancia · muestra de octavo · GLOBALT Robotics')
    c.drawRightString(letter[0] - 14 * mm, 9 * mm, f'Página {doc.page}')


if __name__ == '__main__':
    SimpleDocTemplate(str(SALIDA), pagesize=letter, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=12 * mm,
                      bottomMargin=15 * mm, title='Revisión de concordancia · muestra de octavo',
                      author='GLOBALT Robotics', lang='es-CO').build(historia(), onFirstPage=pie, onLaterPages=pie)
    print(SALIDA)
