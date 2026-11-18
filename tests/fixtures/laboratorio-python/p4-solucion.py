import bateria

try:
    with open("lecturas.txt", encoding="utf-8") as f:
        lineas = f.readlines()
except FileNotFoundError:
    print("No encuentro lecturas.txt")
else:
    valores = []
    informe = []
    for linea in lineas:
        linea = linea.strip()
        if not linea or linea.startswith("#"):
            continue
        nombre, texto = linea.split(";")
        try:
            v = float(texto)
        except ValueError:
            print("Línea ignorada:", linea)
            continue
        valores.append(v)
        informe.append(f"{nombre};{v:.1f};{bateria.estado(v)}")
    with open("informe.txt", "w", encoding="utf-8") as f:
        for fila in informe:
            f.write(fila + "\n")
    print("Lecturas válidas:", len(valores))
    print(f"Promedio: {bateria.promedio(valores):.2f}")
    print("Informe guardado en informe.txt")
