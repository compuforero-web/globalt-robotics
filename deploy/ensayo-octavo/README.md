# Réplica de ensayo de octavo

Réplica aislada para el ensayo de la muestra del Liceo Campestre: proyecto Docker `globalt-ensayo-octavo`, puerto
18180, base, claves y buzón propios en `.ensayo-octavo/` (ignorado por git). No toca `deploy/linux` ni producción, cuyo
registro público sigue cerrado.

```bash
bash deploy/ensayo-octavo/ensayo.sh iniciar 192.168.1.40   # IP del servidor que alcanza el celular
bash deploy/ensayo-octavo/ensayo.sh detener                # conserva cuentas y progreso
bash deploy/ensayo-octavo/ensayo.sh limpiar                # borra solo esta réplica (pide escribir LIMPIAR)
```

- Sin IP solo responde en 127.0.0.1. Con IP publica además en esa dirección (nunca 0.0.0.0) y los enlaces de
  verificación apuntan a ella.
- `/buzon-ensayo/` muestra, para un correo ficticio exacto, los enlaces que la réplica le envió (solo lectura).
- Guía rellenable del ensayo: `guia/Guia_ensayo_octavo.pdf` (se regenera con `python3 guia/generar_guia.py`;
  requiere reportlab). `tests/e2e/ensayo-octavo.e2e.mjs` recorre los mismos pasos en CI.
- Programa del carrito físico: `carrito_octavo/carrito_octavo.ino` (conexiones, carga con Arduino IDE y verificación
  en `carrito_octavo/README.md`). `tests/test_carrito_octavo.py` lo simula y CI lo compila desde la fuente.
- Revisión de concordancia: `revision/Revision_concordancia_octavo.pdf` (fuente en Markdown junto a él; se regenera
  con `python3 revision/generar_revision.py`).
