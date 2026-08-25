import zipfile, os, json, sys
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
v = json.load(open('manifest.json', encoding='utf-8'))['version']
out = f'translate-mail-{v}.xpi'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    z.write('manifest.json')
    for d in ('_locales', 'icons', 'src'):
        for root, _, files in os.walk(d):
            for f in sorted(files):
                p = os.path.join(root, f).replace(os.sep, '/')
                z.write(p, p)
with zipfile.ZipFile(out) as z:
    names = z.namelist()
    bad = [n for n in names if '\\' in n]
    print(out, os.path.getsize(out), 'bytes,', len(names), 'entries, backslash entries:', len(bad))
    print('\n'.join(names))
