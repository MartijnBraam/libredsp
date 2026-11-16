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

class NodeTemplate {
    constructor(data) {
        this.id = data['id'];
        this.width = data['width'];
        this.label = data['name'];

        this.instances = 0;
        this.single = data['single'];
        this.sockets = data['sockets'];
        this.controls = data['controls'];

        switch (data['class']) {
            case "input":
                this.type = CLASS_INPUT;
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
            if ("label" in sd) {
                label = sd.label;
            }
            if (sd.dir === "out") {
                sockets.push(new SocketOutput(label, stype));
            } else {
                const so = new SocketInput(label, stype, 0, sd.min, sd.max, true);
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
                    controls.push(new ControlDropdown(cd.label, cd.values))
                    break;
                case "checkbox":
                    controls.push(new ControlCheckbox(cd.label, cd.checked))
                    break;
            }
        }

        if (width === null) {
            width = this.width;
        }

        return new Node(x, y, width, this.type, this.id, this.label, sockets, controls);
    }
}

export default class LibreDSP {
    constructor(canvas) {
        this.canvasEl = canvas;
        this.editor = new NodeEditor(canvas);
        this.loadNodes().then(() => {
            this.loadState();
        });

        this.nodeTemplates = {};
    }

    loadNodes() {
        return fetch("./nodes.json").then(response => response.json()).then(data => {
            for (let i = 0; i < data.length; i++) {
                this.nodeTemplates[data[i].id] = new NodeTemplate(data[i]);
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
            console.log("NODE", node);
        }
        console.log("STATE", res);
        return res;
    }
}