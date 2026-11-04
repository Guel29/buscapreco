"""Fetch the pinned official Node archive, retaining TLS and checksum verification."""
import hashlib
import json
from pathlib import Path
import sys
import urllib.request
import zipfile

release = json.loads(Path(sys.argv[1]).read_text())
output = Path(sys.argv[2])
output.mkdir(parents=True, exist_ok=True)
archive = output / release['archive']
checksum_url = f"https://nodejs.org/dist/{release['version']}/SHASUMS256.txt"
with urllib.request.urlopen(checksum_url, timeout=30) as response:
    checksums = response.read().decode()
official = next(line.split()[0] for line in checksums.splitlines() if line.split()[-1] == release['archive'])
if official != release['sha256']:
    raise RuntimeError('Official checksum differs from the pinned release; investigate before building.')
if not archive.exists() or hashlib.sha256(archive.read_bytes()).hexdigest() != official:
    temporary = archive.with_suffix('.part')
    with urllib.request.urlopen(release['source'], timeout=120) as response, temporary.open('wb') as target:
        while chunk := response.read(1024 * 1024):
            target.write(chunk)
    if hashlib.sha256(temporary.read_bytes()).hexdigest() != official:
        temporary.unlink()
        raise RuntimeError('Node archive checksum mismatch.')
    temporary.replace(archive)
runtime = output / 'runtime'
runtime.mkdir(exist_ok=True)
with zipfile.ZipFile(archive) as package:
    for filename in ['node.exe', 'LICENSE']:
        data = package.read(f"node-{release['version']}-win-x64/{filename}")
        (runtime / filename).write_bytes(data)
print(f"Official Node {release['version']} archive verified.")
