from pathlib import Path
import zipfile
root=Path(__file__).resolve().parent.parent
files=['staging/multi-user/schema.sql','staging/multi-user/access-api.js','staging/multi-user/access.test.mjs','staging/multi-user/worker.js','staging/multi-user/wrangler.example.json','staging/multi-user/README.md','staging/multi-user/public/index.html','staging/multi-user/public/accounts.js','staging/multi-user/public/public-config.example.js','docs/OPERATIONS.md','.github/workflows/checks.yml']
with zipfile.ZipFile(root/'niche-lab-account-staging.zip','w',zipfile.ZIP_DEFLATED) as z:
    for file in files:z.write(root/file,file)
with zipfile.ZipFile(root/'niche-lab-account-staging.zip') as z:assert z.testzip() is None
