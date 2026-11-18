import {NodeEditor, Node, Link, SocketOutput, SocketInput, ControlDropdown, ControlCheckbox} from "./node-editor.js";

const CONN_MONO = '#c7c729';
const CONN_STEREO = '#c78829';
const CONN_FLOAT = '#a1a1a1';
const CONN_DB = '#5c789c';

const CLASS_INPUT = '#83314a';
const CLASS_OUTPUT = '#3c1d26';
const CLASS_AUDIO = '#6e6e1d';
const CLASS_CONSTANT = CLASS_INPUT;
const CLASS_CONVERT = '#246283';
const CLASS_GROUP = '#344621';
const CLASS_GROUPIO = '#1d1d1d';

let lastFetch = 0;

function debounceFetch(url, data) {
    const now = new Date().getTime();
    if (now - lastFetch >= 300) {
        fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        }).then((resp) => {
            console.log(resp)
        });
        lastFetch = now;
    }
}

class NodeTemplate {
    constructor(data, index) {
        this.id = data['id'];
        this.width = data['width'];
        this.label = data['name'];
        this.gen = data['gen'];
        this.genIdx = index;
        this.map = data['map'];
        this.combine = data['combine'];

        this.instances = 0;
        this.single = data['single'];
        this.sockets = data['sockets'];
        this.controls = data['controls'];

        switch (data['class']) {
            case "input":
                this.type = CLASS_INPUT;
                break;
            case "constant":
                this.type = CLASS_CONSTANT;
                break;
            case "output":
                this.type = CLASS_OUTPUT;
                break;
            case "convert":
                this.type = CLASS_CONVERT;
                break;
            case "audio":
                this.type = CLASS_AUDIO;
                break;
        }
    }

    Make(x, y, width = null) {
        if (this.single && this.instances > 0) {
            return null;
        }
        let sockets = [];
        let controls = [];
        for (let i = 0; i < this.sockets.length; i++) {
            const sd = this.sockets[i];
            let stype = CONN_FLOAT;
            switch (sd.type) {
                case "mono":
                    stype = CONN_MONO;
                    break;
                case "stereo":
                    stype = CONN_STEREO;
                    break;
                case "float":
                    stype = CONN_FLOAT;
                    break;
                case "db":
                    stype = CONN_DB;
                    break;
            }
            let label = sd.type;
            let ref = sd.type;
            if ("label" in sd) {
                label = sd.label;
            }
            if ("ref" in sd) {
                ref = sd.ref;
            }
            if (sd.dir === "out") {
                sockets.push(new SocketOutput(label, stype));
            } else {
                const so = new SocketInput(ref, label, stype, 0, sd.min, sd.max, true);
                switch (stype) {
                    case CONN_DB:
                        so.formatter = (value) => {
                            return value.toFixed(1) + " dB";
                        }
                        break;
                    case CONN_MONO:
                    case CONN_STEREO:
                        so.editable = false;
                        break;
                }
                sockets.push(so);
            }
        }

        for (let i = 0; i < this.controls.length; i++) {
            const cd = this.controls[i];
            switch (cd.type) {
                case "dropdown":
                    controls.push(new ControlDropdown(cd.label, cd.values, cd.prefix));
                    break;
                case "checkbox":
                    controls.push(new ControlCheckbox(cd.label, cd.checked));
                    break;
            }
        }

        if (width === null) {
            width = this.width;
        }
        this.instances++;
        return new Node(x, y, width, this.type, this.id, this.label, sockets, controls);
    }
}

export default class LibreDSP {
    constructor(settings) {
        this.settings = settings;
        this.editor = new NodeEditor(settings.canvas);
        this.loadNodes().then(() => {
            this.loadState();
        });

        this.nodeTemplates = {};
        this.combineMap = {};

        settings.canvas.addEventListener("dragover", (event) => {
            event.preventDefault();
        });
        settings.canvas.addEventListener("drop", (event) => {
            event.preventDefault();
            const id = event.dataTransfer.getData("application/node");

            const node = this.nodeTemplates[id].Make(event.offsetX, event.offsetY);
            if (node !== null) {
                this.editor.AddNode(node);
            }
        });

        settings.uploadButton.addEventListener("click", (event) => {
            event.preventDefault();
            const state = this.getCurrentState();
            console.log(JSON.stringify(state));
            this.compile();
        });

        this.editor.addEventListener('node-remove', (event) => {
            this.nodeTemplates[event.id].instances--;
        });

        this.ws = new WebSocket('/ws');
    }

    loadNodes() {
        return fetch("./nodes.json").then(response => response.json()).then(data => {
            let group = {}

            for (let i = 0; i < data.length; i++) {
                const template = new NodeTemplate(data[i], i);
                const gname = data[i]['class'];
                this.nodeTemplates[data[i].id] = template;
                if (template.combine !== null && !(template.combine in this.combineMap)) {
                    this.combineMap[template.combine] = i;
                }
                if (!(gname in group)) {
                    group[gname] = [];
                }
                group[gname].push(template);
            }

            for (const g in group) {
                const header = document.createElement('h2');
                header.innerText = g;
                this.settings.templates.appendChild(header);
                for (let i = 0; i < group[g].length; i++) {
                    const tpl = document.createElement('node-template');
                    tpl.innerText = group[g][i].label;
                    tpl.dataset.id = group[g][i].id;
                    tpl.draggable = true;
                    tpl.addEventListener('dragstart', (event) => {
                        event.dataTransfer.setData("application/node", tpl.dataset.id);
                    });
                    this.settings.templates.appendChild(tpl);
                }
            }
        });
    }

    loadState() {
        return fetch("./state.json").then(response => response.json()).then(data => {
            for (let i = 0; i < data.nodes.length; i++) {
                const nd = data.nodes[i];
                const node = this.nodeTemplates[nd.type].Make(nd.x, nd.y, nd.width);

                for (let c = 0; c < node.controls.length; c++) {
                    const ctrl = node.controls[c];
                    if (ctrl.label in nd.state) {
                        ctrl.value = nd.state[ctrl.label];
                    }
                }

                for (let s = 0; s < node.sockets.length; s++) {
                    const so = node.sockets[s];
                    if (!so.editable) continue;
                    if (!so.isInput) continue;
                    if (so.label in nd.state) {
                        so.value = nd.state[so.label];
                    }
                }

                this.editor.AddNode(node);
            }

            for (let i = 0; i < data.links.length; i++) {
                const ld = data.links[i];
                this.editor.links.push(new Link(ld[0], ld[1], ld[2], ld[3]));
            }

            this.getCurrentState();
        });
    }

    getCurrentState() {
        const res = {
            "nodes": [],
            "links": [],
        }
        for (let i = 0; i < this.editor.nodes.length; i++) {
            const node = this.editor.nodes[i];
            const ns = {};
            for (let c = 0; c < node.controls.length; c++) {
                const ctrl = node.controls[c];
                if ("value" in ctrl) {
                    ns[ctrl.label] = ctrl.value;
                }
            }
            for (let s = 0; s < node.sockets.length; s++) {
                const so = node.sockets[s];
                if (!so.editable) continue;
                if (!so.isInput) continue;
                ns[so.label] = so.value;
            }

            res.nodes.push({
                "type": node.id,
                "x": node.x,
                "y": node.y,
                "width": node.width,
                "state": ns,
            });
        }
        for (let i = 0; i < this.editor.links.length; i++) {
            const link = this.editor.links[i];
            res.links.push([link.src_node, link.src_sock, link.dst_node, link.dst_sock]);
        }
        console.log("STATE", res);
        return res;
    }

    compile() {
        const result = {
            "nodes": {},
            "links": [],
        }

        // Assign audio sockets to pads
        for (let i = 0; i < this.editor.nodes.length; i++) {
            const node = this.editor.nodes[i];
            node.padIn = [];
            node.padOut = [];
            for (let s = 0; s < node.sockets.length; s++) {
                const so = node.sockets[s];
                if (so.type !== CONN_MONO && so.type !== CONN_STEREO) continue;
                if (so.isInput) {
                    if (so.type === CONN_STEREO) {
                        node.padIn.push("s" + s + ":left");
                        node.padIn.push("s" + s + ":right");
                    } else {
                        node.padIn.push("s" + s + ":mono");
                    }
                } else {
                    if (so.type === CONN_STEREO) {
                        node.padOut.push("s" + s + ":left");
                        node.padOut.push("s" + s + ":right");
                    } else {
                        node.padOut.push("s" + s + ":mono");
                    }
                }
            }
        }

        // Assign audio links to patchcords
        let patchCords = [];
        for (let i = 0; i < this.editor.links.length; i++) {
            const link = this.editor.links[i];
            const src = this.editor.nodes[link.src_node];
            const dst = this.editor.nodes[link.dst_node];
            const type = src.sockets[link.src_sock].type;
            if (type !== CONN_MONO && type !== CONN_STEREO) continue;

            let tpads = [];
            for (let p = 0; p < dst.padIn.length; p++) {
                if (dst.padIn[p].startsWith("s" + link.dst_sock + ":")) {
                    tpads.push(dst.padIn[p]);
                }
            }

            let idx = 0;
            for (let p = 0; p < src.padOut.length; p++) {
                if (src.padOut[p].startsWith("s" + link.src_sock + ":")) {
                    patchCords.push(new Link(link.src_node, src.padOut[p], link.dst_node, tpads[idx]));
                    idx++;
                }
            }
        }

        // Optimize away the stereo-mono converter blocks
        for (let i = 0; i < this.editor.nodes.length; i++) {
            const node = this.editor.nodes[i];
            if (node.id !== "monostereo" && node.id !== "stereomono") continue;


            // Find sources for the converter
            const spad = {};
            for (let p = 0; p < patchCords.length; p++) {
                const patch = patchCords[p];
                if (patch.dst_node === i) {
                    spad[node.padIn.indexOf(patch.dst_sock)] = [patch.src_node, patch.src_sock];
                }
            }
            // Both convertor nodes are 2-in 2-out at this point due to the previous step
            for (let o = 0; o < node.padOut.length; o++) {
                for (let p = 0; p < patchCords.length; p++) {
                    const patch = patchCords[p];
                    if (patch.src_node === i && patch.src_sock === node.padOut[o] && o in spad) {
                        patchCords.push(new Link(spad[o][0], spad[o][1], patch.dst_node, patch.dst_sock));
                    }
                }
            }

            // Clean up input patchcords
            for (let p = patchCords.length - 1; p >= 0; p--) {
                const patch = patchCords[p];
                if (patch.dst_node === i) {
                    patchCords.splice(p, 1);
                }
                if (patch.src_node === i) {
                    patchCords.splice(p, 1);
                }
            }
        }

        // Build audio nodelist
        let code = 0;
        let combine = {};
        for (let i = 0; i < this.editor.nodes.length; i++) {
            const node = this.editor.nodes[i];
            if (node.id === "monostereo" || node.id === "stereomono") continue;
            const tpl = this.nodeTemplates[node.id];
            if (tpl.gen === undefined) continue;
            let combineDst = null;
            if (tpl.combine !== undefined && tpl.combine !== null) {
                if (tpl.combine in combine) {
                    combineDst = combine[tpl.combine];
                } else {
                    combine[tpl.combine] = i;
                }
            }

            const ctrl = {};
            for (let si = 0; si < node.sockets.length; si++) {
                const so = node.sockets[si];
                if (!so.isInput) continue;
                if (so.isConnected) continue;
                if (so.type === CONN_MONO || so.type === CONN_STEREO) continue;

                so.clearEventListener('change');
                so.addEventListener('change', (event) => {
                    // TODO: figure out why websockets are broken in the teensy lib
                    /*
                    this.ws.send(JSON.stringify({
                        'n': i,
                        'r': so.ref,
                        'v': event
                    }));
                     */
                    const update = {
                        'n': i,
                        'r': so.ref,
                        'v': event.value,
                    };
                    console.debug(update);
                    debounceFetch('/control', update);
                });

                ctrl[so.ref] = so.value;
            }
            if (combineDst !== null) {
                result.nodes[combineDst]['ctrl'] += ctrl;
                for (let p = 0; p < patchCords.length; p++) {
                    const patch = patchCords[p];
                    if (patch.src_node === i) {
                        patch.src_node = combineDst;
                        patch.src_tpl = tpl;
                    }
                    if (patch.dst_node === i) {
                        patch.dst_node = combineDst;
                        patch.dst_tpl = tpl;
                    }
                }
            } else {
                result.nodes[i] = {
                    'class': tpl.combine ? this.combineMap[tpl.combine] : tpl.genIdx, // Int mapping to nodemap.h
                    'id': code, // unique index for links and controls
                    'tpl': tpl.id, // reference to the template for metadata
                    'ctrl': ctrl, // control state
                };
            }

            code++;
        }

        // Build final links
        for (let i = 0; i < patchCords.length; i++) {
            const patch = patchCords[i];
            if (!(patch.src_node in result.nodes)) continue;
            if (!(patch.dst_node in result.nodes)) continue;

            const src = result.nodes[patch.src_node];
            const dst = result.nodes[patch.dst_node];
            let srct = "src_tpl" in patch ? patch.src_tpl.id : src.tpl;
            let dstt = "dst_tpl" in patch ? patch.dst_tpl.id : dst.tpl;
            result.links.push([
                src.id, this.nodeTemplates[srct].map[patch.src_sock],
                dst.id, this.nodeTemplates[dstt].map[patch.dst_sock],
            ]);
        }
        console.log("Compiled graph", result);
        fetch("/graph", {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(result)
        }).then((resp) => {
            console.log(resp)
        });
        return result;
    }

    /*
    debugPatches(patchCords) {
        let res = '';
        for (let i = 0; i < patchCords.length; i++) {
            const p = patchCords[i];
            let srcn = p.src_node;
            let dstn = p.dst_node;
            if ("src_tpl" in p) {
                srcn += "[" + p.src_tpl.id + "]";
            }
            if ("dst_tpl" in p) {
                dstn += "[" + p.dst_tpl.id + "]";
            }
            res += srcn + ':' + p.src_sock + ' -> ' + dstn + ':' + p.dst_sock + '\n';
        }
        console.debug(res);
    }
     */
}