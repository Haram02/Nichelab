from pathlib import Path
import subprocess,zipfile
root=Path(__file__).resolve().parent.parent
files=subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0')
with zipfile.ZipFile(root/'niche-lab-source.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for file in files:
        if not file:continue
        path=root/file
        if not path.is_file() or file=='niche-lab-source.zip' or file.startswith('.env') and file!='.env.example':continue
        archive.write(path,file)
with zipfile.ZipFile(root/'niche-lab-source.zip') as archive:assert archive.testzip() is None
