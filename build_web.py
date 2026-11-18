import os
import subprocess
import glob
import gzip
import json

Import("env")
if env.IsIntegrationDump():
    Return()

board_name = env.GetProjectOption("board_name")

target = env.Dir('$BUILD_DIR/web')
os.makedirs(target, exist_ok=True)

result = '#pragma once \n\n'


def older_than(src, dst):
    srctime = os.path.getmtime(src)
    dsttime = os.path.getmtime(dst)
    return srctime > dsttime


for src in glob.glob('web/*'):
    fname = os.path.basename(src)
    tfile = os.path.join(target, fname + ".gz")

    with open(src, 'r') as handle:
        raw = handle.read()

    if src.endswith('nodes.json'):
        nodes = json.loads(raw)
        with open(f'src/board/board_{board_name}.json') as handle:
            extra = json.load(handle)
        nodes = extra + nodes
        raw = json.dumps(nodes)

    if src.endswith('.js'):
        terser = subprocess.run(['terser'], capture_output=True, text=True, input=raw)
        raw = terser.stdout.encode()
    else:
        raw = raw.encode()

    compressed = gzip.compress(raw, compresslevel=9)
    with open(tfile, 'wb') as handle:
        handle.write(compressed)

    name = fname.replace('.', '_')
    xxd = subprocess.run(['xxd', '-t', '-n', name, '-i', tfile], capture_output=True, text=True)
    code = xxd.stdout

    result += code + "\n"

with open('src/web.h', 'w') as handle:
    handle.write(result)

# Generate node name mapping
nodemap = '#pragma once\n\n'
dups = set()
for i, n in enumerate(nodes):
    if 'gen' in n and n['gen'] not in dups:
        nodemap += '#define Node' + n['gen'] + f' ({i})\n'
        dups.add(n['gen'])

with open('src/nodemap.h', 'w') as handle:
    handle.write(nodemap)
