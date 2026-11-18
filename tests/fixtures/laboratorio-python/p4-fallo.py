# Error típico: no ignora los comentarios ni controla el archivo ausente.
import bateria

valores = []
informe = []
with open("lecturas.txt", encoding="utf-8") as f:
    for linea in f:
        linea = linea.strip()
        if not linea:
            continue
        nombre, texto = linea.split(";")
        v = float(texto)
        valores.append(v)
        informe.append(f"{nombre};{v:.1f};{bateria.estado(v)}")
with open("informe.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(informe) + "\n")
print("Lecturas válidas:", len(valores))
print(f"Promedio: {bateria.promedio(valores):.2f}")
print("Informe guardado en informe.txt")
