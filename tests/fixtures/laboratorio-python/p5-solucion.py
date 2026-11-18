def estado(v):
    if v >= 7.0:
        return "OK"
    elif v >= 6.4:
        return "BAJA"
    return "CRÍTICA"


def promedio(valores):
    return sum(valores) / len(valores) if valores else 0.0


lecturas = []
print("Asistente de batería. Escribe ayuda.")
while True:
    partes = input("> ").strip().split(maxsplit=1)
    comando = partes[0].lower() if partes else ""
    dato = partes[1] if len(partes) > 1 else ""
    if comando == "salir":
        print("Hasta pronto")
        break
    elif comando == "ayuda":
        print("Comandos: agregar <voltaje>, lista, promedio, alerta, guardar, salir")
    elif comando == "agregar":
        try:
            v = float(dato)
        except ValueError:
            print(f"Valor no válido: {dato}")
            continue
        lecturas.append(v)
        print(f"Agregada: {v:.1f} V ({estado(v)})")
    elif comando in ("lista", "promedio", "alerta") and not lecturas:
        print("Sin lecturas")
    elif comando == "lista":
        print("Lecturas:", ", ".join(f"{v:.1f}" for v in lecturas))
    elif comando == "promedio":
        print(f"Promedio: {promedio(lecturas):.2f}")
    elif comando == "alerta":
        print("Críticas:", sum(1 for v in lecturas if estado(v) == "CRÍTICA"))
    elif comando == "guardar":
        with open("bitacora.txt", "w", encoding="utf-8") as f:
            for v in lecturas:
                f.write(f"{v:.1f}\n")
        print(f"Guardado: {len(lecturas)} lecturas en bitacora.txt")
    else:
        print(f"No entiendo: {comando} (escribe ayuda)")
