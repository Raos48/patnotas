import zipfile
import os

def create_zip(source_dir, output_path):
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(source_dir):
            for f in files:
                file_path = os.path.join(root, f)
                arcname = os.path.relpath(file_path, source_dir).replace(os.sep, '/')
                zf.write(file_path, arcname)
    with zipfile.ZipFile(output_path, 'r') as zf:
        names = zf.namelist()
        bad = [n for n in names if '\\' in n]
        if bad:
            print(f'ERRO: backslash em {bad}')
        else:
            print(f'{output_path}: OK ({len(names)} arquivos)')

create_zip('inss-notas-extensao-firefox', 'notaspat-firefox-v1.3.7.zip')
create_zip('inss-notas-extensao', 'notaspat-chrome-v1.3.7.zip')
