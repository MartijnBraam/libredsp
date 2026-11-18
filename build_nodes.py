import os
import re
import yaml

Import("env")
if env.IsIntegrationDump():
    Return()

with open('src/node/node.yaml') as handle:
    data = yaml.safe_load(handle)

pattern = re.compile(r"(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])")

for c in data:
    srcname = c['class']
    dstname = 'LibreDsp' + srcname[5:]
    source = c['source']
    fname = pattern.sub('_', srcname[5:]).lower()

    result = '#pragma once\n'
    result += f'#include <{source}.h>\n'
    result += '#include "node.h"\n\n'
    result += f'class {dstname}: public Node ' + '{\n'
    result += 'public:\n'
    result += f'    {dstname}() {"{"} _inst = new {srcname}(); {"}"};\n'
    result += f'    ~{dstname}() override = default;\n\n'

    result += '    AudioStream* Stream() override {\n        return _inst;\n    }\n\n'

    static = 'false'
    if c["static"]:
        static = 'true'
    result += f'    bool Static() override {"{"}\n        return {static};\n    {"}"}\n\n'

    result += '    void Control(ArduinoJson::JsonString name, ArduinoJson::JsonVariant value) override {\n'
    if 'controls' in c:
        first = True
        for parameter in c['controls']:
            method = c['controls'][parameter]
            if first:
                result += '        if (strcmp(name.c_str(), "' + parameter + '") == 0) {\n'
                first = False
            else:
                result += '        else if (strcmp(name.c_str(), "' + parameter + '") == 0) {\n'
            result += f'            _inst->{method}(value);\n'
            result += '        }\n'
    result += '    }\n'
    result += 'private:\n'
    result += f'    {srcname}* _inst;\n'
    result += '};\n'

    with open(os.path.join('src/node/', f'{fname}.h'), 'w') as handle:
        handle.write(result)
