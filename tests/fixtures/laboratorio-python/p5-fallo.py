# Error típico: distingue mayúsculas y se cae con un número mal escrito.
lecturas = []
print("Asistente de batería. Escribe ayuda.")
while True:
    orden = input("> ")
    if orden == "salir":
        print("Hasta pronto")
        break
    elif orden.startswith("agregar"):
        v = float(orden[8:])
        lecturas.append(v)
        print(f"Agregada: {v:.1f} V (OK)")
    elif orden == "lista":
        print("Lecturas:", ", ".join(f"{v:.1f}" for v in lecturas) or "Sin lecturas")
    else:
        print(f"No entiendo: {orden} (escribe ayuda)")
