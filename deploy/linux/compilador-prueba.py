#!/usr/bin/env python3
"""Prueba funcional del servicio de compilación Arduino por su socket Unix (solo biblioteca estándar).

La ejecuta deploy/linux/compilador-produccion.sh dentro de un contenedor sin red, con el socket y las fuentes del
commit montados en solo lectura; también puede usarse a mano. No cambia nada: solo hace peticiones HTTP.

Uso: compilador-prueba.py <socket> <fuentes> [--modo rapida|completa|minima] [--servo-commit SHA]
  rapida    salud, soluciones de las trece lecciones (HEX idéntico byte a byte al guardado), diagnósticos,
            rechazos del filtro de lectura de archivos y límites de la librería Servo.
  completa  lo anterior con TODOS los programas de tests/fixtures/laboratorio que tienen HEX guardado.
  minima    salud y una compilación real del LED (sirve también para la versión anterior, sin Servo).
"""
import argparse
import http.client
import json
from pathlib import Path
import socket
import sys
import time

SOLUCIONES = ['solucion', 'semaforo-solucion', 'pwm-solucion', 'boton-solucion', 'flanco-solucion', 'pot-solucion',
              'ultra-solucion', 'alerta-solucion', 'dir-solucion', 'vel-solucion', 'dos-solucion',
              'pos-solucion', 'bar-solucion']
LOOP = '\nvoid setup() {}\nvoid loop() {}\n'


class ConexionUnix(http.client.HTTPConnection):
    def __init__(self, ruta, tiempo=45):
        super().__init__('localhost', timeout=tiempo)
        self.ruta = ruta

    def connect(self):
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(self.timeout)
        s.connect(self.ruta)
        self.sock = s


def pedir(ruta, metodo, camino, cuerpo=None, tipo='application/json'):
    conexion = ConexionUnix(ruta)
    try:
        cabeceras = {'Content-Type': tipo} if cuerpo is not None else {}
        conexion.request(metodo, '/api/arduino' + camino, body=cuerpo, headers=cabeceras)
        r = conexion.getresponse()
        datos = r.read()
        try:
            return r.status, json.loads(datos)
        except ValueError:
            return r.status, {'crudo': datos[:200].decode('utf-8', 'replace')}
    finally:
        conexion.close()


def compilar(ruta, codigo, placa='nano'):
    return pedir(ruta, 'POST', '/compilar', json.dumps({'placa': placa, 'codigo': codigo}).encode())


fallos = []


def comprobar(condicion, texto):
    print(('  OK    ' if condicion else '  FALLO ') + texto, flush=True)
    if not condicion:
        fallos.append(texto)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('socket')
    p.add_argument('fuentes')
    p.add_argument('--modo', choices=['rapida', 'completa', 'minima'], default='rapida')
    p.add_argument('--servo-commit', default=None)
    a = p.parse_args()
    fx = Path(a.fuentes) / 'tests/fixtures/laboratorio'
    inicio = time.monotonic()

    print('Salud del servicio')
    estado, salud = pedir(a.socket, 'GET', '/salud')
    version = salud.get('version') or {}
    comprobar(estado == 200 and salud.get('ok') is True, f'GET /salud → {estado} {json.dumps(salud, ensure_ascii=False)}')
    comprobar({'placa', 'compilador', 'nucleo'} <= set(version), 'la versión conserva placa, compilador y núcleo (clientes existentes)')
    if a.servo_commit:
        comprobar(a.servo_commit in str(version.get('servo', '')), f'la salud identifica Servo con el commit {a.servo_commit[:12]}')

    print('Compilación real')
    nombres = ['solucion'] if a.modo == 'minima' else SOLUCIONES
    if a.modo == 'completa':
        nombres = sorted(h.stem for h in fx.glob('*.hex') if (fx / f'{h.stem}.ino').exists())
    distintos = []
    for nombre in nombres:
        estado, r = compilar(a.socket, (fx / f'{nombre}.ino').read_text())
        if estado != 200 or not r.get('ok') or r.get('hex') != (fx / f'{nombre}.hex').read_text():
            distintos.append(nombre)
            print(f'    {nombre}: estado {estado}, ok={r.get("ok")}, {r.get("diagnosticos", [])[:2]}', flush=True)
    comprobar(not distintos, f'{len(nombres) - len(distintos)}/{len(nombres)} programas compilan con HEX idéntico al guardado')
    estado, r = compilar(a.socket, 'void setup() {\n  pinMode(13, OUTPUT)\n}\nvoid loop() {}\n')
    comprobar(estado == 200 and r.get('ok') is False and r['diagnosticos'][0]['linea'] == 3 and '/tmp/' not in r.get('salida', ''),
              'un error de sintaxis devuelve su diagnóstico en la línea 3 sin rutas internas')
    if a.modo == 'minima':
        return terminar(inicio)

    print('Filtros y límites')
    for codigo in ['#include "/etc/passwd"', '#include <../VERSION>', '#include <../../LICENSE-Servo-LGPL-2.1.txt>',
                   '%:include "/etc/hostname"', 'void f(){ asm(".incbin \\"/etc/passwd\\""); }', '#include_next <stdio.h>']:
        estado, r = compilar(a.socket, codigo + LOOP)
        comprobar(estado == 400 and 'hex' not in r, f'rechazado (400): {codigo[:40]}')
    estado, r = compilar(a.socket, '#include <sam/ServoTimers.h>' + LOOP)
    comprobar(estado == 200 and r.get('ok') is False and 'hex' not in r, 'cabeceras de Servo de otras arquitecturas no disponibles')
    estado, r = compilar(a.socket, '#include <Servo.h>\nServo s;\nvoid setup() { s.attach(9); s.write(45); }\nvoid loop() {}\n')
    comprobar(estado == 200 and r.get('ok') is True and r.get('hex', '').startswith(':'), 'Servo.h: attach y write compilan y enlazan')
    estado, _ = compilar(a.socket, 'x' * 70000)
    comprobar(estado == 413, f'cuerpo de más de 64 KB → {estado}')
    estado, _ = compilar(a.socket, LOOP, placa='uno')
    comprobar(estado == 400, f'placa distinta de nano → {estado}')
    estado, _ = pedir(a.socket, 'POST', '/compilar', b'{}', tipo='text/plain')
    comprobar(estado == 415, f'sin JSON → {estado}')
    return terminar(inicio)


def terminar(inicio):
    print(f'Duración: {time.monotonic() - inicio:.1f} s')
    if fallos:
        print(f'PRUEBA FALLIDA ({len(fallos)}): ' + '; '.join(fallos))
        return 1
    print('PRUEBA SUPERADA')
    return 0


if __name__ == '__main__':
    sys.exit(main())
