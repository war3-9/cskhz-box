"""Build the embedded W3x2Lni runtime from the shipped third-party inputs."""
import gzip
import hashlib
import pathlib
import tarfile

root = pathlib.Path(__file__).resolve().parent.parent
runtime = root / 'third_party/terrain-object-normalizer'
output = root / '.private/terrain-object-normalizer.tar.gz'
required = ('bin/w3x2lni-lua.exe', 'script/box-objects.lua', 'LICENSE.txt', 'config.ini')
for name in required:
    if not (runtime / name).is_file():
        raise SystemExit(f'Missing third-party runtime input: {name}')
output.parent.mkdir(parents=True, exist_ok=True)
with output.open('wb') as raw:
    with gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w') as archive:
            for item in sorted(runtime.rglob('*')):
                if item.is_symlink():
                    raise SystemExit(f'Symlink runtime input is not supported: {item}')
                if not item.is_file():
                    continue
                relative = item.relative_to(runtime)
                if relative.parts[0] not in ('bin', 'script', 'data') and relative.as_posix() not in ('LICENSE.txt', 'config.ini', 'normalize.ps1'):
                    continue
                info = archive.gettarinfo(str(item), arcname=relative.as_posix())
                info.uid = info.gid = info.mtime = 0
                info.uname = info.gname = ''
                with item.open('rb') as contents:
                    archive.addfile(info, contents)
digest = hashlib.sha256(output.read_bytes()).hexdigest()
output.with_name('terrain-object-normalizer.sha256').write_text(digest, encoding='utf-8')
print(f'Packaged {output.name}: {output.stat().st_size} bytes, SHA256 {digest}')
