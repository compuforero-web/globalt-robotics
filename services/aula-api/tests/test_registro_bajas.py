"""Registro externo de bajas: integridad del diario y destino. No requiere PostgreSQL."""
import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app import registro_bajas
from app.registro_bajas import Registro, RegistroInvalido, RegistroNoDisponible

ALTA = datetime(2024, 1, 2, 3, 4, 5, 678901, tzinfo=timezone.utc)


@pytest.fixture
def registro(tmp_path):
    r = Registro(tmp_path, pruebas=True)
    assert r.inicializar() and not r.inicializar()
    r.comprobar()
    return r


def test_desenlace_unico_e_idempotente(registro):
    op = uuid4()
    registro.anotar(op, 'pendiente', 7, ALTA, 1)
    registro.anotar(op, 'pendiente', 7, ALTA, 1)                  # repetir es inocuo
    registro.anotar(op, 'confirmada', 7, ALTA, 1, 'aplicada')
    registro.anotar(op, 'confirmada', 7, ALTA, 1, 'recuperada')   # mismo desenlace, otro camino
    otra_zona = ALTA.astimezone(timezone(timedelta(hours=-5)))
    registro.anotar(op, 'confirmada', 7, otra_zona, 1, 'aplicada')  # mismo instante con otro desfase
    with pytest.raises(RegistroInvalido, match='Conflicto'):
        registro.anotar(op, 'cancelada', 7, ALTA, 1, 'condiciones')
    with pytest.raises(ValueError):
        registro.anotar(uuid4(), 'confirmada', 7, ALTA, 1, 'previa')
    diario = registro.leer()
    assert not diario.problemas and not diario.abiertas
    assert [(e['usuario_id'], registro_bajas.fecha(e)) for e in diario.confirmadas] == [(7, ALTA)]
    assert set(json.loads((registro.ruta / f'{op}.final.json').read_text())) == registro_bajas.CAMPOS | {'sha256'}


def test_diario_danado_o_incompleto_se_informa(registro):
    abierta, truncada, alterada, huerfana = uuid4(), uuid4(), uuid4(), uuid4()
    for op in (abierta, truncada, alterada):
        registro.anotar(op, 'pendiente', 3, ALTA, 1)
    registro.anotar(truncada, 'confirmada', 3, ALTA, 1, 'aplicada')
    registro.anotar(alterada, 'confirmada', 3, ALTA, 1, 'aplicada')
    registro.anotar(huerfana, 'pendiente', 4, ALTA, 1)
    registro.anotar(huerfana, 'confirmada', 4, ALTA, 1, 'aplicada')
    ruta = registro.ruta / f'{truncada}.final.json'
    ruta.write_bytes(ruta.read_bytes()[:40])
    ruta = registro.ruta / f'{alterada}.final.json'
    ruta.write_text(ruta.read_text().replace('"usuario_id": 3', '"usuario_id": 9'))
    (registro.ruta / f'{huerfana}.pendiente.json').unlink()
    (registro.ruta / 'bajas.csv').write_text('usuario_id,creado_en\n')
    diario = registro.leer()
    texto = ' | '.join(diario.problemas)
    assert 'ilegible' in texto and 'suma de control' in texto and 'sin anotación previa' in texto and 'bajas.csv' in texto
    assert {e['operacion'] for e in diario.abiertas} == {str(abierta), str(truncada), str(alterada)}
    assert not diario.confirmadas


def test_destino_sin_configurar_local_o_sin_marca(tmp_path, monkeypatch):
    with pytest.raises(RegistroNoDisponible, match='no está configurado'):
        Registro('').comprobar()
    with pytest.raises(RegistroNoDisponible, match='no está montado'):
        Registro(tmp_path / 'falta', pruebas=True).comprobar()
    with pytest.raises(RegistroNoDisponible, match='independiente'):
        Registro(tmp_path).comprobar()
    with pytest.raises(RegistroNoDisponible, match='marca'):
        Registro(tmp_path, pruebas=True).comprobar()
    (tmp_path / 'otro.txt').write_text('x')
    with pytest.raises(RegistroNoDisponible, match='no está vacía'):
        Registro(tmp_path, pruebas=True).inicializar()
    (tmp_path / 'otro.txt').unlink()
    monkeypatch.setattr(registro_bajas, 'tipo_montaje', lambda ruta: 'nfs4')   # montaje remoto simulado
    real = Registro(tmp_path)
    assert real.inicializar()
    real.comprobar()
    assert not list(tmp_path.glob('.prueba-*'))   # la prueba de escritura no deja restos


def test_tipo_montaje_lee_el_montaje_mas_especifico(tmp_path, monkeypatch):
    info = ('22 1 0:20 / / rw - overlay overlay rw\n'
            f'40 22 0:50 / {tmp_path}/con\\040espacio rw - nfs4 equipo:/bajas rw\n')
    monkeypatch.setattr(registro_bajas.Path, 'read_text', lambda self, *a, **k: info)
    (tmp_path / 'con espacio').mkdir()
    assert registro_bajas.tipo_montaje(tmp_path / 'con espacio') == 'nfs4'
    assert registro_bajas.tipo_montaje(tmp_path) == 'overlay'
