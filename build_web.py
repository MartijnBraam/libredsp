import os
import subprocess
import glob
import gzip
import json

Import("env")
if env.IsIntegrationDump():
    Return()

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
    if not os.path.isfile(tfile) or older_than(tfile, src):
        with open(src, 'r') as handle:
            raw = handle.read()

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

with open("web/nodes.json") as handle:
    nodes = json.load(handle)

nodemap = '#pragma once\n\n'
for i, n in enumerate(nodes):
    if 'gen' in n:
        nodemap += '#define Node' + n['gen'] + f' ({i})\n'

with open('src/nodemap.h', 'w') as handle:
    handle.write(nodemap)
