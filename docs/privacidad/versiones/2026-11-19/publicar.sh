#!/usr/bin/env bash
# Ejecutar desde la copia de producción que admite la migración 0009.
set -euo pipefail
carpeta=$(cd -- "$(dirname -- "$0")" && pwd)
version=2026-11-19
base=https://globalt-robotics.com/api/aula
script=deploy/linux/aula-produccion.sh
test -f "$script"
(cd "$carpeta" && sha256sum -c SHA256SUMS)
cerrado() {
  curl -fsS "$base/config" | python3 -c 'import json,sys
if json.load(sys.stdin)["registro_abierto"] is not False: sys.exit("Se esperaba el registro cerrado")'
}
cerrado
titulos=('Términos de uso del aula para adultos' 'Autorización para el tratamiento de datos del aula' 'Política de privacidad del aula')
finalidades=('Condiciones del servicio gratuito de educación informal para adultos.' 'Autorizar el tratamiento de datos para gestionar la cuenta, la inscripción y el progreso.' 'Informar sobre el tratamiento de datos y los canales de atención de GLOBALT E.U.')
tipos=(terminos datos politica)
for i in 0 1 2; do
  tipo=${tipos[i]}
  sudo bash "$script" documentos cargar --tipo "$tipo" --version "$version" --titulo "${titulos[i]}" --finalidad "${finalidades[i]}" --archivo "$carpeta/$tipo.txt"
done
for tipo in "${tipos[@]}"; do
  url="$base/documentos/$tipo/$version"
  vigente=$(curl -fsS "$url" | python3 -c 'import hashlib,json,sys,pathlib
doc=json.load(sys.stdin)
texto=pathlib.Path(sys.argv[1]).read_bytes()
if doc["texto"].encode()!=texto or doc["sha256"]!=hashlib.sha256(texto).hexdigest() or doc["prueba"]:
    sys.exit("Texto público distinto del aprobado")
print(int(bool(doc["vigente_desde"])))' "$carpeta/$tipo.txt")
  if [[ $vigente == 0 ]]; then sudo bash "$script" documentos activar --tipo "$tipo" --version "$version"; fi
done
curl -fsS "$base/config" | python3 -c 'import json,sys
cfg=json.load(sys.stdin)
if cfg["registro_abierto"] is not False or any(cfg["documentos"].get(t,{}).get("version")!=sys.argv[1] for t in ("terminos","datos","politica")):
    sys.exit("Revisar documentos vigentes y estado del registro")
print("Tres documentos vigentes. Registro de adultos cerrado.")' "$version"
