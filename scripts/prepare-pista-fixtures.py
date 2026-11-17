"""Genera HEX de pruebas con el servicio real, en un entorno de pruebas, nunca en producción."""
import argparse
import importlib.util
import os
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
server=Path(os.environ.get('COMPILADOR_SERVER','/opt/compilador/server.py'))
spec=importlib.util.spec_from_file_location('compilador_de_prueba',server)
compiler=importlib.util.module_from_spec(spec)
spec.loader.exec_module(compiler)
args.output.mkdir(parents=True,exist_ok=True)
names=['pista-solucion','pista-izquierda','pista-ignora-obstaculo','pista-solo-gira','pista-muy-lento','pista-sin-sensor','pista-ejemplo','pista-ej-umbral']
for name in names:
    source=(root/'tests/fixtures/laboratorio'/ (name+'.ino')).read_text()
    result=compiler.compilar(source)
    if not result['ok']:
        raise RuntimeError((name,result))
    (args.output/(name+'.hex')).write_text(result['hex'])
    print(name,result['memoria']['flash'],'bytes',flush=True)
