"""Seguimiento familiar. La cuenta adulta conserva sus cursos y su progreso personal."""
from datetime import date

from fastapi import Depends, HTTPException
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from . import seguridad


class Formulario(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class Alumno(Formulario):
    nombre: str = Field(min_length=2, max_length=80)
    grado: int = Field(ge=1, le=11)


class Invitacion(Formulario):
    correo: EmailStr


class Vinculo(Formulario):
    codigo: str = Field(min_length=32, max_length=100)


class Actividad(Formulario):
    fecha: date
    titulo: str = Field(min_length=2, max_length=120)
    resultado: str = Field(min_length=2, max_length=80)
    observacion: str = Field(min_length=2, max_length=800)


def instalar(app, bd, autorizada, autorizada_csrf):
    def administrador(sesion=Depends(autorizada_csrf)):
        if sesion['rol'] != 'administrador':
            raise HTTPException(403, 'Esta acción requiere la cuenta del profesor.')

    def comprobar_alumno(conexion, alumno_id):
        if not conexion.execute('SELECT 1 FROM alumnos WHERE id=%s', (alumno_id,)).fetchone():
            raise HTTPException(404, 'No se encontró el estudiante.')

    @app.get('/api/aula/familias')
    def consultar(sesion=Depends(autorizada), conexion=Depends(bd)):
        filas = conexion.execute("""
            SELECT a.id, a.nombre, a.grado, t.fecha, t.titulo, t.resultado, t.observacion
            FROM alumnos a LEFT JOIN actividades_alumno t ON t.alumno_id=a.id
            WHERE %s OR EXISTS (SELECT 1 FROM familias f WHERE f.alumno_id=a.id AND f.usuario_id=%s)
            ORDER BY a.grado, a.nombre, a.id, t.fecha DESC, t.titulo
        """, (sesion['rol'] == 'administrador', sesion['usuario_id'])).fetchall()
        alumnos = {}
        for ident, nombre, grado, fecha, titulo, resultado, observacion in filas:
            alumno = alumnos.setdefault(ident, dict(id=ident, nombre=nombre, grado=grado, actividades=[]))
            if fecha:
                alumno['actividades'].append(dict(fecha=fecha, titulo=titulo, resultado=resultado,
                                                  observacion=observacion))
        return list(alumnos.values())

    @app.post('/api/aula/familias/alumnos', dependencies=[Depends(administrador)], status_code=201)
    def crear(datos: Alumno, conexion=Depends(bd)):
        fila = conexion.execute('INSERT INTO alumnos(nombre, grado) VALUES (%s,%s) RETURNING id',
                                (datos.nombre, datos.grado)).fetchone()
        return {'id': fila[0]}

    @app.post('/api/aula/familias/alumnos/{alumno_id}/invitacion', dependencies=[Depends(administrador)])
    def invitar(alumno_id: int, datos: Invitacion, conexion=Depends(bd)):
        comprobar_alumno(conexion, alumno_id)
        codigo = seguridad.token()
        conexion.execute("""
            INSERT INTO invitaciones_familia(alumno_id, correo, huella, vence)
            VALUES (%s,%s,%s,now()+interval '7 days')
            ON CONFLICT (alumno_id,correo) DO UPDATE SET huella=excluded.huella, vence=excluded.vence
        """, (alumno_id, datos.correo.lower(), seguridad.huella(codigo)))
        return {'codigo': codigo}

    @app.post('/api/aula/familias/vincular')
    def vincular(datos: Vinculo, sesion=Depends(autorizada_csrf), conexion=Depends(bd)):
        with conexion.transaction():
            fila = conexion.execute("""
                DELETE FROM invitaciones_familia i USING usuarios u WHERE u.id=%s
                AND u.correo_verificado_en IS NOT NULL AND i.correo=u.correo
                AND i.huella=%s AND i.vence>now() RETURNING i.alumno_id
            """, (sesion['usuario_id'], seguridad.huella(datos.codigo))).fetchone()
            if not fila:
                raise HTTPException(400, 'Revisa el código y el correo verificado de tu cuenta.')
            conexion.execute('INSERT INTO familias(usuario_id,alumno_id) VALUES (%s,%s) ON CONFLICT DO NOTHING',
                             (sesion['usuario_id'], fila[0]))
        return {'vinculado': True}

    @app.put('/api/aula/familias/alumnos/{alumno_id}/actividad', dependencies=[Depends(administrador)])
    def publicar(alumno_id: int, datos: Actividad, conexion=Depends(bd)):
        comprobar_alumno(conexion, alumno_id)
        conexion.execute("""
            INSERT INTO actividades_alumno(alumno_id,fecha,titulo,resultado,observacion)
            VALUES (%s,%s,%s,%s,%s) ON CONFLICT (alumno_id,fecha,titulo) DO UPDATE
            SET resultado=excluded.resultado, observacion=excluded.observacion
        """, (alumno_id, datos.fecha, datos.titulo, datos.resultado, datos.observacion))
        return {'publicada': True}
