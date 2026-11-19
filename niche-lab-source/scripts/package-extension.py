from pathlib import Path
import json
import zipfile
root=Path(__file__).resolve().parent.parent
source=root/'extension'
manifest=json.loads((source/'manifest.json').read_text())
assert manifest['manifest_version']==3
out=root/'niche-lab-etsy-extension.zip'
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(source.rglob('*')):
        if path.is_file() and path.suffix in {'.js','.html','.json','.md'}:
            archive.write(path,path.relative_to(source))
with zipfile.ZipFile(out) as archive:
    assert archive.testzip() is None
    assert 'manifest.json' in archive.namelist()
print(f'Extension package verified: {out.name}')
