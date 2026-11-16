#!/usr/bin/env bash
# Actualiza exclusivamente el dibujo del circuito en el piloto privado ya instalado.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
[[ $EUID -eq 0 && -n "${SUDO_USER:-}" && "$SUDO_USER" != root ]] || {
  echo 'Ejecuta con sudo bash deploy/linux/fix-lab-led.sh'; exit 1;
}
REPO=$(cd ../.. && pwd)
runuser -u "$SUDO_USER" -- git -C "$REPO" fetch origin feature/laboratorio-arduino
python3 - "$REPO" <<'PY'
import hashlib,os,subprocess,sys,tempfile
from pathlib import Path
old='a33d7feb7045ce3b92edb48587e01d44f087d081'
new='30638496b96333c72aacf318fed144cfdf444816'
state=Path('/var/lib/globalt-robotics-lab')
target=state/'web-e8234be551585c4ba80015d3794a4676d546c144/games/laboratorio-arduino/src/circuit.js'
def blob(data):return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
if target.is_symlink() or not target.is_file():raise SystemExit('No se encontró el dibujo del piloto esperado.')
current=target.read_bytes()
if blob(current)==new:
 print('El dibujo ya está corregido.');raise SystemExit(0)
if blob(current)!=old:raise SystemExit('El dibujo tiene otros cambios; se conserva sin sobrescribir.')
content=subprocess.check_output(['git','-C',sys.argv[1],'cat-file','blob',new])
if blob(content)!=new:raise SystemExit('No coincide el archivo revisado.')
backup=state/'circuit-before-led-fix.js'
if not backup.exists():backup.write_bytes(current)
fd,name=tempfile.mkstemp(prefix='.circuit-',dir=target.parent)
try:
 with os.fdopen(fd,'wb') as f:f.write(content)
 os.chmod(name,0o644)
 os.replace(name,target)
finally:
 if os.path.exists(name):os.unlink(name)
(state/'led-drawing-blob.txt').write_text(new+'\n')
print('Dibujo del LED corregido. Compilador, simulación y progreso sin modificaciones.')
PY
