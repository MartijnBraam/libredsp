const GRID = 20.0;

const CNR_TL = 1;
const CNR_TR = 2;
const CNR_BR = 4;
const CNR_BL = 8;
const CNR_ALL = CNR_TL | CNR_TR | CNR_BL | CNR_BR;

const M_NONE = 0;
const M_PAN = 1;
const M_ZOOM = 2;
const M_MOVE = 3;
const M_BOX = 4;
const M_LINK = 5;
const M_VALUE = 6;
const M_CUT = 7;
const M_CONTROL = 8;
const M_RESIZE = 9;

function drawTriangle(ctx, x, y, size, down, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = size / 6;
    ctx.beginPath();
    if (down) {
        ctx.moveTo(x - (size / 2), y - (size / 4));
        ctx.lineTo(x, y + size / 4);
        ctx.lineTo(x + (size / 2), y - (size / 4));
    } else {
        ctx.moveTo(x - (size / 4), y - (size / 2));
        ctx.lineTo(x + size / 4, y);
        ctx.lineTo(x - (size / 4), y + (size / 2));
    }
    ctx.stroke();
}

function drawCheck(ctx, x, y, size, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = size / 4;
    ctx.beginPath();
    ctx.moveTo(x + (size / 2), y - (size / 2));
    ctx.lineTo(x - (size / 7), y + size / 2);
    ctx.lineTo(x - (size / 2), y);
    ctx.stroke();
}

function remap(value, low1, high1, low2, high2) {
    return low2 + (high2 - low2) * (value - low1) / (high1 - low1);
}

export class Control {
    constructor(height) {
        this.height = height;
        this.row = null;
    }

    calcHeight(width) {
        return this.height;
    }

    draw(ctx, x, y, w, scale) {

    }

    mouseDown(nsx, nsy, event) {
        return false;
    }

    mouseUp(nsx, nsy, event) {

    }

    mouseMove(nsx, nsy, event) {

    }
}

export class Socket extends Control {
    constructor(height, input, type) {
        super(height);
        this.isInput = input;
        this.isConnected = false;
        this.type = type;
    }
}

export class SocketOutput extends Socket {
    constructor(label, type) {
        super(1, false, type);
        this.label = label;
    }

    draw(ctx, x, y, w, scale, connected) {
        const m = 10.0 * scale;
        ctx.save();
        ctx.textAlign = 'right';
        ctx.fillStyle = '#e1e1e1';
        ctx.fillText(this.label, x + w - m, y + (14 * scale));
        ctx.restore();
    }
}

export class SocketInput extends Socket {
    constructor(label, type, value, min, max, editable) {
        super(1, true, type);
        this.label = label;
        this.value = value;
        this.min = min;
        this.max = max;
        this.editable = editable;

        this.startx = null;
        this.startv = null;
        this.moving = false;

        this.w = 1;
        this.s = 1;
    }

    formatter(value) {
        return value.toFixed(1);
    }

    mouseDown(nsx, nsy, event) {
        this.startx = nsx;
        this.startv = this.value;
        this.moving = false;
        return true;
    }

    mouseMove(nsx, nsy, event) {
        if (this.startx !== nsx) {
            this.moving = true;
        }
        const distance = nsx - this.startx;
        const scale = (this.max - this.min) / (this.w - (GRID * this.s));
        const shift = event.shiftKey ? 0.1 : 1;
        this.value = this.startv + (distance * scale * shift);
        if (this.value > this.max) {
            this.value = this.max;
        }
        if (this.value < this.min) {
            this.value = this.min;
        }
    }

    mouseUp(nsx, nsy, event) {
        this.moving = false;
        if (nsx === this.startx) {
            console.log("TODO: spawn form field to enter exact value");
        }
    }

    draw(ctx, x, y, w, scale, connected) {
        const m = 10.0 * scale;
        this.w = w;
        this.s = scale;
        this.isConnected = connected;
        if (connected || !this.editable) {
            ctx.fillStyle = '#e1e1e1';
            ctx.fillText(this.label, x + m + (!connected ? m : 0), y + (14 * scale));
        } else {
            const width = w - (2 * m);

            if (this.moving) {
                ctx.fillStyle = '#222222';
            } else {
                ctx.fillStyle = '#545454';
            }

            ctx.beginPath();
            ctx.roundRect(x + m, y + (2 * scale), width, (GRID - 4) * scale, 4 * scale);
            ctx.fill();

            if (this.value > this.min) {
                ctx.fillStyle = '#4772b3';
                const factor = remap(this.value, this.min, this.max, 0, width);
                ctx.beginPath();
                let r = [4 * scale, 4 * scale, 4 * scale, 4 * scale];
                if (factor < (width * 0.9)) {
                    r[1] = 0;
                    r[2] = 0;
                }
                ctx.roundRect(x + m, y + (2 * scale), factor, (GRID - 4) * scale, r);
                ctx.fill();
            }

            ctx.save();
            ctx.fillStyle = '#e1e1e1';
            ctx.fillText(this.label, x + m + (!connected ? m : 0), y + (14 * scale));

            ctx.textAlign = 'right';
            ctx.fillText(this.formatter(this.value), x + width, y + (14 * scale));
            ctx.restore();
        }
    }
}

export class ControlDropdown extends Control {
    constructor(label, values, prefix) {
        super(1);
        this.label = label;
        this.values = values;
        this.prefix = prefix;
        this.value = Object.keys(values)[0];

        this.cLeft = 0;
        this.open = false;
    }

    mouseDown(nsx, nsy, event) {
        if (nsx < this.cLeft) {
            return false;
        }
        return true;
    }

    draw(ctx, x, y, w, scale, connected) {
        const m = (GRID / 2) * scale;

        ctx.save();

        const prefixwidth = ctx.measureText(this.prefix).width;
        if (this.prefix !== null && this.prefix.length > 0) {
            ctx.fillStyle = '#e1e1e1';
            ctx.fillText(this.label, x + m, y + (13 * scale));
        }
        const lpad = prefixwidth + m;
        this.cLeft = x + m + lpad;

        ctx.fillStyle = '#222222';
        ctx.strokeStyle = '#3d3d3d';
        ctx.beginPath();
        ctx.roundRect(x + m + lpad, y + (2 * scale), w - (2 * m) - lpad, (GRID - 4) * scale, 4 * scale);
        ctx.fill();
        ctx.stroke();

        drawTriangle(ctx, x + w - (2 * m), y + (GRID / 2 * scale), 6 * scale, true, '#e1e1e1');

        ctx.beginPath();
        ctx.rect(x, y, w - (3 * m), y + (GRID * scale))
        ctx.clip();

        ctx.fillStyle = '#e1e1e1';
        ctx.fillText(this.values[this.value], x + m + lpad + (!connected ? m : 0), y + (14 * scale));
        ctx.restore();
    }
}

export class ControlCheckbox extends Control {
    constructor(label, value) {
        super(1);
        this.label = label;
        this.value = value;
    }

    mouseDown(nsx, nsy, event) {
        this.value = !this.value;
        return true;
    }

    draw(ctx, x, y, w, scale, connected) {
        const m = 10.0 * scale;
        const chk = 10;
        ctx.save();

        if (this.value) {
            ctx.fillStyle = '#4772b3';
        } else {
            ctx.fillStyle = '#545454';
        }
        ctx.beginPath();
        ctx.roundRect(x + m, y + ((GRID - chk) / 2 * scale), chk * scale, chk * scale, 2 * scale);
        ctx.fill();

        if (this.value) {
            drawCheck(ctx, x + m + (chk / 2 * scale), y + (GRID / 2 * scale), 6 * scale, '#e1e1e1');
        }

        ctx.fillStyle = '#e1e1e1';
        ctx.fillText(this.label, x + m + (chk * scale) + (4 * scale), y + (14 * scale));
        ctx.restore();
    }
}

class ControlMatrix extends Control {
    constructor(rows, cols) {
        super(1);
        this.inputs = rows;
        this.outputs = cols;

        this.matrx = [
            [1, 1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1, 1],
        ];

        this.mutes = [
            [false, true, false, false, false, false],
            [true, false, false, false, false, false],
            [false, true, false, false, false, false],
            [true, false, false, false, false, false],
            [false, true, false, false, false, false],
            [true, false, false, false, false, false],
        ];
    }

    calcHeight(width) {
        this.height = Math.ceil(width / GRID);
        return this.height;
    }

    draw(ctx, x, y, w, scale, connected) {
        ctx.save();
        const m = 10.0 * scale;
        ctx.fillStyle = '#545454';

        const ax = x + m;
        const ay = y;
        const aw = w - m - m;
        const ah = w;

        ctx.beginPath();
        ctx.roundRect(ax, ay, aw, ah, 2 * scale);
        ctx.fill();

        const cr = w / 3 / this.inputs;
        ctx.fillStyle = '#1d1d1d';
        for (let i = 0; i < this.inputs; i++) {
            for (let o = 0; o < this.outputs; o++) {
                const cx = ax + (aw / this.outputs * (o + 0.5));
                const cy = ay + (ah / this.inputs * (i + 0.5));
                if (this.mutes[i][o]) {
                    ctx.fillStyle = '#404040';
                } else {
                    ctx.fillStyle = '#1d1d1d';
                }
                ctx.beginPath();
                ctx.arc(cx, cy, cr, 0, 2 * Math.PI, false);
                ctx.fill();

                ctx.beginPath();
                ctx.arc(cx, cy, cr, 0.8 * Math.PI, 1.5 * Math.PI, false);
                ctx.stroke();
            }
        }

        ctx.restore();
    }
}


export class Node {
    constructor(x, y, width, color, id, title, sockets, controls) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.color = color;
        this.id = id;
        this.title = title;
        this.collapsed = false;
        this.active = true;
        this.selected = false;
        this.sockets = sockets;
        this.controls = controls;

        this.dragx = null;
        this.dragy = null;
    }

    getHeight() {
        let height = 0;
        for (let i = 0; i < this.controls.length; i++) {
            height += this.controls[i].calcHeight(this.width);
        }
        for (let i = 0; i < this.sockets.length; i++) {
            height += this.sockets[i].height;
        }
        return height * GRID;
    }
}

export class Link {
    constructor(src_node, src_sock, dst_node, dst_sock) {
        this.src_node = src_node;
        this.src_sock = src_sock;
        this.dst_node = dst_node;
        this.dst_sock = dst_sock;

        console.log("New link src", src_node + ":" + src_sock, "dst", dst_node + ":" + dst_sock);
    }
}

class NodeEditor {
    constructor(element) {
        this.el = element;
        this.ctx = element.getContext("2d");

        this.zoom = 1.0;
        this.panx = 0.0;
        this.pany = 0.0;

        this.startZoom = 1.0;
        this.startPanx = 0.0;
        this.startPany = 0.0;

        this.pressx = 0.0;
        this.pressy = 0.0;
        this.movex = 0.0;
        this.movey = 0.0;

        this.mode = M_NONE;

        this.linkNode = null;
        this.linkSock = null;
        this.linkFromOutput = false;
        this.valueNode = null;
        this.valueSock = null;
        this.controlNode = null;
        this.controlIdx = null;

        this.nodes = [];
        this.links = [];

        this.events = {
            'node-add': [],
            'node-remove': [],
            'node-move': [],
            'node-update': [],
            'link-add': [],
            'link-remove': [],
        };

        this.recalculateCanvasSize();
        this.repaint();

        window.addEventListener('keydown', (event) => {
            if (event.key === "Delete") {
                for (let i = this.nodes.length - 1; i >= 0; i--) {
                    const node = this.nodes[i];
                    if (node.selected) {
                        this.DeleteNode(i);
                    }
                }
                this.repaint();
            }
        });

        this.el.addEventListener('wheel', (event) => {
            event.preventDefault();
            this.zoom += event.wheelDelta * 0.0001;
            this.repaint();
        });

        this.el.addEventListener('mousedown', (event) => {
            event.preventDefault();
            if (event.button !== 0) {
                return;
            }
            const nsx = (event.offsetX - this.panx) / this.zoom;
            const nsy = (event.offsetY - this.pany) / this.zoom;

            const selectedNodeIdx = this.findNodeOnPosition(nsx, nsy);
            const selectedNode = selectedNodeIdx === null ? null : this.nodes[selectedNodeIdx];

            // Update node selection
            if (!event.shiftKey && (selectedNode === null || !selectedNode.selected)) {
                for (let i = 0; i < this.nodes.length; i++) {
                    this.nodes[i].selected = false;
                }
            }
            if (selectedNode === null) {
                this.repaint();
                return;
            }
            selectedNode.selected = true;

            // Check if starting dragging a socket
            const selectedSocketIdx = this.findSocketOnPosition(selectedNode, nsx, nsy);
            if (selectedSocketIdx !== null) {
                const so = selectedNode.sockets[selectedSocketIdx];
                let inLinks = this.findLinks(true, selectedNodeIdx, selectedSocketIdx);

                if (so.isInput && inLinks.length > 0) {
                    // Started dragging from a connected input socket, remove the existing link and drag the other
                    // end of the existing link
                    this.linkNode = this.links[inLinks[0]].src_node;
                    this.linkSock = this.links[inLinks[0]].src_sock;
                    this.linkFromOutput = true;
                    this.links.splice(inLinks[0], 1);
                } else {
                    this.linkNode = selectedNodeIdx;
                    this.linkSock = selectedSocketIdx;
                    this.linkFromOutput = !so.isInput;
                }
                this.movex = event.offsetX;
                this.movey = event.offsetY;
                this.mode = M_LINK;
                this.repaint();
                return;
            }

            // Check if dragging the right edge, for resize mode
            if (nsx > selectedNode.x + selectedNode.width - 3 && nsx < selectedNode.x + selectedNode.width + 3) {
                this.mode = M_RESIZE;
                this.linkNode = selectedNodeIdx;
                return;
            }

            // Check if the collapse button is clicked for the node
            if (nsx - selectedNode.x < 20 * this.zoom) {
                if (nsy - selectedNode.y < 20 * this.zoom) {
                    selectedNode.collapsed = !selectedNode.collapsed;
                    this.repaint();
                    return
                }
            }

            // Check if clicking a control
            const hitControl = this.findControlOnPosition(selectedNode, nsx, nsy);
            if (hitControl[0] !== null) {
                if (hitControl[0]) {
                    // Input socket
                    if (selectedNode.sockets[hitControl[1]].mouseDown(nsx, nsy, event)) {
                        this.mode = M_VALUE;
                        this.valueNode = selectedNode;
                        this.valueSock = hitControl[1];
                        this.repaint();
                        return;
                    }
                } else {
                    // Control
                    if (selectedNode.controls[hitControl[1]].mouseDown(nsx, nsy, event)) {
                        this.mode = M_CONTROL;
                        this.controlNode = selectedNode;
                        this.controlIdx = hitControl[1];
                        this.repaint();
                        return;
                    }
                }
            }

            // Start moving the node
            this.mode = M_MOVE;
            this.el.style.cursor = 'all-scroll';
            for (let i = 0; i < this.nodes.length; i++) {
                const node = this.nodes[i];
                if (!node.selected) {
                    continue;
                }
                node.dragx = nsx - node.x;
                node.dragy = nsy - node.y;
            }
            this.repaint();
        });

        this.el.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            this.startPanx = this.panx;
            this.startPany = this.pany;
            this.startZoom = this.zoom;
            this.pressx = event.offsetX;
            this.pressy = event.offsetY;
            this.mode = M_PAN;
        });
        this.el.addEventListener('mousemove', (event) => {
            const nsx = (event.offsetX - this.panx) / this.zoom;
            const nsy = (event.offsetY - this.pany) / this.zoom;

            switch (this.mode) {
                case M_PAN:
                    this.panx = this.startPanx + event.offsetX - this.pressx;
                    this.pany = this.startPany + event.offsetY - this.pressy;
                    this.repaint();
                    break;
                case M_LINK:
                    this.movex = event.offsetX;
                    this.movey = event.offsetY;
                    this.repaint();
                    break;
                case M_VALUE:
                    this.valueNode.sockets[this.valueSock].mouseMove(nsx, nsy, event);
                    this.repaint();
                    break;
                case M_CONTROL:
                    this.controlNode.controls[this.controlIdx].mouseMove(nsx, nsy, event);
                    this.repaint();
                    break;
                case M_MOVE:
                    for (let i = 0; i < this.nodes.length; i++) {
                        const node = this.nodes[i];
                        if (node.selected) {
                            let newx = nsx - node.dragx;
                            let newy = nsy - node.dragy;
                            if (event.ctrlKey) {
                                newx = Math.floor(newx / 20.0) * 20;
                                newy = Math.floor(newy / 20.0) * 20;
                            }
                            node.x = newx;
                            node.y = newy;
                        }
                    }
                    this.repaint();
                    break;
                case M_RESIZE:
                    const node = this.nodes[this.linkNode];
                    const width = nsx - node.x;
                    node.width = width;
                    this.repaint();
                    break;
                default:
                    // Only cursor updates
                    const nodeIdx = this.findNodeOnPosition(nsx, nsy);
                    if (nodeIdx !== null) {
                        const hoverNode = this.nodes[nodeIdx];
                        let hoverEdge = nsx > hoverNode.x + hoverNode.width - 3 && nsx < hoverNode.x + hoverNode.width + 3;
                        if (hoverEdge) {
                            const socket = this.findSocketOnPosition(hoverNode, nsx, nsy);
                            if (socket !== null) {
                                hoverEdge = false;
                            }
                        }
                        // Check if dragging the right edge, for resize mode
                        if (hoverEdge) {
                            this.el.style.cursor = 'col-resize';
                        } else {
                            this.el.style.cursor = 'default';
                        }

                    }
            }
        });
        this.el.addEventListener('mouseup', (event) => {
            const nsx = (event.offsetX - this.panx) / this.zoom;
            const nsy = (event.offsetY - this.pany) / this.zoom;

            let release = true;
            switch (this.mode) {
                case M_LINK:
                    const selectedNodeIdx = this.findNodeOnPosition(nsx, nsy);
                    if (selectedNodeIdx === null) {
                        break;
                    }
                    const selectedSocketIdx = this.findSocketOnPosition(this.nodes[selectedNodeIdx], nsx, nsy);
                    if (selectedSocketIdx === null) {
                        break;
                    }
                    if (this.linkFromOutput) {
                        const existing = this.findLinks(true, selectedNodeIdx, selectedSocketIdx);
                        if (existing.length > 0) {
                            this.links.splice(existing[0], 1);
                        }
                        this.links.push(new Link(this.linkNode, this.linkSock, selectedNodeIdx, selectedSocketIdx));
                    } else {
                        this.links.push(new Link(selectedNodeIdx, selectedSocketIdx, this.linkNode, this.linkSock));
                    }
                    break;
                case M_VALUE:
                    this.valueNode.sockets[this.valueSock].mouseUp(nsx, nsy, event);
                    break;
                case M_CONTROL:
                    release = this.controlNode.controls[this.controlIdx].mouseUp(nsx, nsy, event);
                    break;
            }
            if (release) {
                this.mode = M_NONE;
                this.el.style.cursor = 'default';
            }
            this.repaint();
        });
    }

    addEventListener(event, handler) {
        if (!(event in this.events)) {
            console.error("Unknown event", event);
        }
        this.events[event].push(handler);
        return this.events[event].length - 1;
    }

    raiseEvent(event, data) {
        for (let i = 0; i < this.events[event].length; i++) {
            this.events[event][i](data);
        }
    }

    AddNode(node) {
        this.nodes.push(node);
        this.repaint();
        this.raiseEvent('node-add', node);
    }

    DeleteNode(index) {
        this.raiseEvent('node-remove', this.nodes[index]);
        let rlist = [];
        for (let i = 0; i < this.links.length; i++) {
            const link = this.links[i];
            if (link.src_node === index || link.dst_node === index) {
                rlist.push(i);
            }

            if (link.src_node > index) {
                link.src_node--;
            }
            if (link.dst_node > index) {
                link.dst_node--;
            }
        }
        for (let i = rlist.length - 1; i >= 0; i--) {
            this.raiseEvent('link-remove', this.links[i]);
            this.links.splice(rlist[i], 1);
        }
        this.nodes.splice(index, 1);
    }

    recalculateCanvasSize() {
        const rect = this.el.parentNode.getBoundingClientRect();
        this.el.width = rect.width;
        this.el.height = rect.height;
    }

    clamp(val, min_val, max_val) {
        if (val < min_val) {
            return min_val;
        }
        if (val > max_val) {
            return max_val;
        }
        return val;
    }

    findLinks(fromInput, node, socket) {
        let res = [];
        for (let i = 0; i < this.links.length; i++) {
            const link = this.links[i];
            if (fromInput && link.dst_node === node && link.dst_sock === socket) {
                return [i];
            }
            if (!fromInput && link.src_node === node && link.src_sock === socket) {
                res.push(i);
            }
        }
        return res;
    }

    findNodeOnPosition(nsx, nsy) {
        const m = (5 * this.zoom);
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            if (node.x - m < nsx && (node.x + node.width + m) > nsx) {
                if (node.y < nsy && (node.y + (node.collapsed ? 0 : node.getHeight()) + (GRID * this.zoom)) > nsy) {
                    return i;
                }
            }
        }
        return null;
    }

    findSocketOnPosition(node, nsx, nsy) {
        const sor = 4;
        for (let i = 0; i < node.sockets.length; i++) {
            const so = node.sockets[i];
            const sox = so.isInput ? node.x : (node.x + node.width);

            if (sox - sor > nsx || sox + sor < nsx) {
                continue;
            }

            const soy = node.y + (GRID * so.row) + (GRID / 2);
            if (soy - sor > nsy || soy + sor < nsy) {
                continue;
            }
            return i;
        }
        return null;
    }

    findControlOnPosition(node, nsx, nsy) {
        for (let i = 0; i < node.sockets.length; i++) {
            const so = node.sockets[i];
            if (!so.isInput) continue;

            const soy1 = node.y + (so.row * GRID);
            const soy2 = node.y + ((so.row + 1) * GRID);
            if (soy1 > nsy || soy2 < nsy) {
                continue
            }
            return [true, i];
        }
        for (let i = 0; i < node.controls.length; i++) {
            const ctrl = node.controls[i];

            const soy1 = node.y + (ctrl.row * GRID);
            const soy2 = node.y + ((ctrl.row + ctrl.height) * GRID);
            if (soy1 > nsy || soy2 < nsy) {
                continue
            }
            return [false, i];
        }
        return [null, null];
    }

    drawGrid() {
        const gridSubdivisions = 3;
        const zoom = Math.max(1e-4, this.zoom);
        const viewLevel = Math.log(GRID / zoom) / Math.log(5.0);
        const largestVisibleLevel = Math.floor(viewLevel);

        for (let levelOffset = 0; levelOffset <= gridSubdivisions; levelOffset++) {
            const level = largestVisibleLevel - levelOffset;
            if (level < 0) {
                break;
            }
            const levelScale = Math.pow(5.0, level);
            const precise = 1.5 * levelScale * zoom;
            const drawn = Math.ceil(this.clamp(precise, 1.5, 2.0));
            const offset = drawn * zoom;
            const alpha = (precise / drawn) * (precise / drawn);
            if (alpha < 0.01) {
                break;
            }
            const alphaClamped = this.clamp(1.01 * alpha - 0.01, 0.0, 1.0);
            const fade = levelOffset === gridSubdivisions ? 1.0 - (viewLevel - Math.floor(viewLevel)) : 1.0;

            this.ctx.fillStyle = "rgba(50, 50, 50, " + (alphaClamped * fade) + ")";
            const step = GRID * levelScale * this.zoom;
            if (step < 1.0) {
                continue;
            }
            const ox = this.panx % step;
            const oy = this.pany % step;
            for (let y = oy; y < this.el.height; y += step) {
                for (let x = ox; x < this.el.width; x += step) {
                    this.ctx.fillRect(x + offset, y + offset, drawn, drawn);
                }
            }
        }
    }

    drawRoundBox(x, y, w, h, rad, corners, color) {
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        if (corners !== CNR_ALL) {
            rad = [
                corners & CNR_TL ? rad : 0,
                corners & CNR_TR ? rad : 0,
                corners & CNR_BR ? rad : 0,
                corners & CNR_BL ? rad : 0,
            ];
        }
        this.ctx.roundRect(x, y, w, h, rad);
        this.ctx.fill();
    }

    outlineRoundBox(x, y, w, h, rad, corners, color) {
        const oldStroke = this.ctx.strokeStyle;
        this.ctx.strokeStyle = color;
        this.ctx.beginPath();
        if (corners !== CNR_ALL) {
            rad = [
                corners & CNR_TL ? rad : 0,
                corners & CNR_TR ? rad : 0,
                corners & CNR_BR ? rad : 0,
                corners & CNR_BL ? rad : 0,
            ];
        }
        this.ctx.roundRect(x, y, w, h, rad);
        this.ctx.stroke();
        this.ctx.strokeStyle = oldStroke;
    }

    drawSocket(x, y, type) {
        const r = 4.0 * this.zoom;

        const oldStroke = this.ctx.strokeStyle;
        this.ctx.strokeStyle = '#1a1a1a';
        this.ctx.fillStyle = type;
        this.ctx.beginPath();
        this.ctx.arc(x, y, r, 0, 2 * Math.PI, false);
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.strokeStyle = oldStroke;
    }

    drawNode(nodeIndex, node) {
        const s = this.zoom;
        const x = node.x * s + this.panx;
        const y = node.y * s + this.pany;
        const w = node.width * s;
        const hh = GRID * s;
        const h = node.getHeight() * s + hh;
        const rad = 4.0 * s;

        // Shadow
        this.drawRoundBox(x - s, y + s, w + 2 * s, (node.collapsed ? hh : h) + 2 * s, rad + s, CNR_ALL, 'rgba(0, 0, 0, 0.25)')

        // Body
        this.drawRoundBox(x, y, w, node.collapsed ? hh : h, rad, CNR_ALL, '#303030');

        // Header
        this.drawRoundBox(x, y, w, hh, rad, node.collapsed ? CNR_ALL : (CNR_TL | CNR_TR), node.color);

        // Outline
        let border = 'rgba(255, 255, 255, 0.14)';
        if (node.active && node.selected) {
            border = '#FFF';
        } else {
            if (node.selected) {
                border = '#ED5700';
            }
        }
        this.outlineRoundBox(x, y, w, node.collapsed ? hh : h, rad, CNR_ALL, border);

        if (s > 0.3) {
            this.ctx.fillStyle = '#E6E6E6';
            this.ctx.font = '' + (11 * s) + 'px sans';
            this.ctx.fillText(node.title, x + (GRID * s), y + (14 * s), w - (GRID * s * 1.2));

            drawTriangle(this.ctx, x + (10 * s), y + (10 * s), 8 * s, !node.collapsed, '#E6E6E6');
        }

        if (node.collapsed || s < 0.3) {
            return;
        }

        let controlOffset = GRID * s;
        const m = 10.0 * s;

        // First pass, output sockets
        for (let i = 0; i < node.sockets.length; i++) {
            const so = node.sockets[i];
            if (so.isInput) {
                continue;
            }
            so.draw(this.ctx, x, y + controlOffset, w, s, false);
            this.drawSocket(x + w, y + controlOffset + m, so.type);
            so.row = controlOffset / (GRID * s);
            controlOffset += so.height * GRID * s;
        }

        // Controls
        for (let i = 0; i < node.controls.length; i++) {
            const c = node.controls[i];
            c.draw(this.ctx, x, y + controlOffset, w, s, false);
            c.row = controlOffset / (GRID * s);
            controlOffset += c.height * GRID * s;
        }

        // Second pass, input sockets
        for (let i = 0; i < node.sockets.length; i++) {
            const so = node.sockets[i];
            if (!so.isInput) {
                continue;
            }
            let connected = false;
            for (let l = 0; l < this.links.length; l++) {
                const link = this.links[l];
                if (link.dst_node === nodeIndex && link.dst_sock === i) {
                    connected = true;
                    break;
                }
            }
            so.draw(this.ctx, x, y + controlOffset, w, s, connected);
            this.drawSocket(x, y + controlOffset + m, so.type);
            so.row = controlOffset / (GRID * s);
            controlOffset += so.height * GRID * s;
        }
    }

    drawNoodle(src_x, src_y, dst_x, dst_y, type) {
        this.ctx.strokeStyle = type;
        this.ctx.lineWidth = 2 * this.zoom;
        this.ctx.beginPath();
        this.ctx.moveTo(src_x, src_y);
        const dist = Math.max(Math.abs(dst_x - src_x) / 1.5, 20 * this.zoom);
        this.ctx.bezierCurveTo(src_x + dist, src_y, dst_x - dist, dst_y, dst_x, dst_y);
        this.ctx.stroke();
    }

    repaint() {
        this.ctx.fillStyle = "#1a1a1a";
        this.ctx.fillRect(0, 0, this.el.width, this.el.height);
        this.drawGrid();

        this.ctx.save();
        for (let i = 0; i < this.links.length; i++) {
            const link = this.links[i];
            const src = this.nodes[link.src_node];
            const dst = this.nodes[link.dst_node];
            let type = src.sockets[link.src_sock].type;
            let src_offset = ((GRID * .5) + (src.sockets[link.src_sock].row * GRID)) * this.zoom;
            let dst_offset = ((GRID * .5) + (dst.sockets[link.dst_sock].row * GRID)) * this.zoom;

            if (src.collapsed) {
                src_offset = 10 * this.zoom;
            }
            if (dst.collapsed) {
                dst_offset = 10 * this.zoom;
            }
            const src_x = (src.x + src.width) * this.zoom + this.panx;
            const src_y = src.y * this.zoom + src_offset + this.pany;
            const dst_x = dst.x * this.zoom + this.panx;
            const dst_y = dst.y * this.zoom + dst_offset + this.pany;
            this.drawNoodle(src_x, src_y, dst_x, dst_y, type);
        }
        if (this.mode === M_LINK) {
            const other = this.nodes[this.linkNode];
            let offset = 30 * this.zoom;
            let idx = 0;
            let type = '#fff';
            let ox = this.linkFromOutput ? (other.x + other.width) : other.x;
            ox = ox * this.zoom + this.panx;
            for (let i = 0; i < other.sockets.length; i++) {
                const so = other.sockets[i];
                if (so.isInput === this.linkFromOutput) {
                    continue;
                }
                if (idx === this.linkSock) {
                    offset = so.row * GRID + (GRID / 2);
                    type = so.type;
                    break;
                }
                idx++;
            }
            const oy = other.y * this.zoom + offset * this.zoom + this.pany;
            let src_x = this.linkFromOutput ? ox : this.movex;
            let src_y = this.linkFromOutput ? oy : this.movey;
            let dst_x = this.linkFromOutput ? this.movex : ox;
            let dst_y = this.linkFromOutput ? this.movey : oy;
            this.drawNoodle(src_x, src_y, dst_x, dst_y, type);
        }
        this.ctx.restore();

        for (let i = 0; i < this.nodes.length; i++) {
            this.drawNode(i, this.nodes[i]);
        }
    }
}

export {NodeEditor};