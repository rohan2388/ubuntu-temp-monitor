import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

const REFRESH_INTERVAL_MS = 2000;
const PLACEHOLDER = '--';
const LOGICAL_CPU_COUNT = GLib.get_num_processors();
const TILES_PER_ROW = 6;

function temperatureClass(temperature) {
    if (temperature === null)
        return 'temp-monitor-neutral';
    if (temperature >= 90)
        return 'temp-monitor-critical';
    if (temperature >= 80)
        return 'temp-monitor-hot';
    if (temperature >= 70)
        return 'temp-monitor-warm';
    if (temperature >= 55)
        return 'temp-monitor-mild';
    return 'temp-monitor-cool';
}

function compactTemperature(temperature) {
    return temperature === null ? PLACEHOLDER : `${temperature}°C`;
}

function loadClass(load) {
    if (load === null)
        return 'temp-monitor-neutral';
    if (load >= 75)
        return 'temp-monitor-critical';
    if (load >= 50)
        return 'temp-monitor-warm';
    if (load >= 25)
        return 'temp-monitor-mild';
    return 'temp-monitor-cool';
}

function summaryTemperature(name, temperature) {
    return temperature === null ? `${name} ${PLACEHOLDER}` : `${name} ${temperature}°C`;
}

function runCommand(argv) {
    return new Promise(resolve => {
        let process;

        try {
            process = Gio.Subprocess.new(
                argv,
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );
        } catch (_error) {
            resolve(null);
            return;
        }

        process.communicate_utf8_async(null, null, (subprocess, result) => {
            try {
                const [, stdout] = subprocess.communicate_utf8_finish(result);
                resolve(subprocess.get_successful() ? stdout : null);
            } catch (_error) {
                resolve(null);
            }
        });
    });
}

async function readCpuTemperature() {
    const output = await runCommand(['sensors', '-j']);
    if (!output)
        return null;

    try {
        const chips = JSON.parse(output);
        const entry = Object.entries(chips).find(([name]) => name.startsWith('k10temp'));
        const temperature = entry?.[1]?.Tctl?.temp1_input;

        return Number.isFinite(temperature) ? Math.round(temperature) : null;
    } catch (_error) {
        return null;
    }
}

async function readGpuTemperature() {
    const output = await runCommand([
        'nvidia-smi',
        '--query-gpu=temperature.gpu',
        '--format=csv,noheader,nounits',
    ]);

    if (!output)
        return null;

    const temperature = output
        .split('\n')
        .map(value => Number(value.trim()))
        .find(Number.isFinite);

    return temperature === undefined ? null : Math.round(temperature);
}

function parseCpuTimes(contents) {
    const rows = new TextDecoder().decode(contents).split('\n');
    const cpuTimes = new Map();

    for (const row of rows) {
        const match = row.match(/^cpu(\d+)\s+(.+)$/);
        if (!match)
            continue;

        const values = match[2].trim().split(/\s+/).map(Number);
        if (values.some(value => !Number.isFinite(value)))
            continue;

        const total = values.reduce((sum, value) => sum + value, 0);
        const idle = (values[3] ?? 0) + (values[4] ?? 0);
        cpuTimes.set(Number(match[1]), {total, idle});
    }

    return cpuTimes;
}

function readCpuTimes() {
    return new Promise(resolve => {
        const file = Gio.File.new_for_path('/proc/stat');
        file.load_contents_async(null, (source, result) => {
            try {
                const [ok, contents] = source.load_contents_finish(result);
                resolve(ok ? parseCpuTimes(contents) : null);
            } catch (_error) {
                resolve(null);
            }
        });
    });
}

function calculateCpuLoads(previousTimes, currentTimes) {
    if (!currentTimes)
        return Array(LOGICAL_CPU_COUNT).fill(null);

    return Array.from({length: LOGICAL_CPU_COUNT}, (_, index) => {
        const previous = previousTimes?.get(index);
        const current = currentTimes.get(index);
        if (!previous || !current)
            return null;

        const totalDelta = current.total - previous.total;
        const idleDelta = current.idle - previous.idle;
        if (totalDelta <= 0)
            return null;

        return Math.round(Math.min(100, Math.max(0, (1 - idleDelta / totalDelta) * 100)));
    });
}

const TemperatureIndicator = GObject.registerClass(
class TemperatureIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'Ubuntu Temperature Monitor', true);

        this._content = new St.BoxLayout({
            style_class: 'temp-monitor',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._content);

        this._coreGrid = new St.BoxLayout({
            style_class: 'temp-monitor-core-grid',
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._content.add_child(this._coreGrid);

        const coreRows = [];
        this._coreTiles = Array.from({length: LOGICAL_CPU_COUNT}, (_, index) => {
            const rowIndex = Math.floor(index / TILES_PER_ROW);
            if (!coreRows[rowIndex]) {
                coreRows[rowIndex] = new St.BoxLayout({
                    style_class: 'temp-monitor-core-row',
                });
                this._coreGrid.add_child(coreRows[rowIndex]);
            }

            const tile = new St.Label({
                text: PLACEHOLDER,
                style_class: 'temp-monitor-core temp-monitor-neutral',
                y_align: Clutter.ActorAlign.CENTER,
            });
            coreRows[rowIndex].add_child(tile);
            return tile;
        });

        this._cpuTile = new St.Label({
            text: summaryTemperature('CPU', null),
            style_class: 'temp-monitor-summary temp-monitor-cpu temp-monitor-neutral',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._gpuTile = new St.Label({
            text: summaryTemperature('GPU', null),
            style_class: 'temp-monitor-summary temp-monitor-gpu temp-monitor-neutral',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._content.add_child(this._cpuTile);
        this._content.add_child(this._gpuTile);
    }

    setReadings(cpuTemperature, gpuTemperature, cpuLoads) {
        for (const [index, tile] of this._coreTiles.entries()) {
            const load = cpuLoads[index] ?? null;
            tile.set_text(load === null ? PLACEHOLDER : `${load}`);
            tile.set_style_class_name(`temp-monitor-core ${loadClass(load)}`);
        }

        this._setTemperatureTile(
            this._cpuTile,
            'temp-monitor-summary temp-monitor-cpu',
            summaryTemperature('CPU', cpuTemperature),
            cpuTemperature
        );
        this._setTemperatureTile(
            this._gpuTile,
            'temp-monitor-summary temp-monitor-gpu',
            summaryTemperature('GPU', gpuTemperature),
            gpuTemperature
        );
    }

    _setTemperatureTile(tile, baseClass, text, temperature) {
        tile.set_text(text);
        tile.set_style_class_name(`${baseClass} ${temperatureClass(temperature)}`);
    }
});

export default class UbuntuTempMonitorExtension extends Extension {
    enable() {
        this._indicator = new TemperatureIndicator();
        this._previousCpuTimes = null;
        this._timeoutId = null;
        this._indicator.connect('button-press-event', (_actor, event) => {
            if (event.get_button() !== 1)
                return Clutter.EVENT_PROPAGATE;

            try {
                Gio.Subprocess.new(
                    ['gnome-system-monitor', '--show-resources-tab'],
                    Gio.SubprocessFlags.NONE
                );
            } catch (error) {
                console.error(`Unable to open System Monitor: ${error.message}`);
            }

            return Clutter.EVENT_STOP;
        });
        Main.panel.addToStatusArea(this.uuid, this._indicator);
        void this._refresh();
    }

    disable() {
        if (this._timeoutId !== null) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }

        this._indicator?.destroy();
        this._indicator = null;
        this._previousCpuTimes = null;
    }

    async _refresh() {
        const [cpuTemperature, gpuTemperature, currentCpuTimes] = await Promise.all([
            readCpuTemperature(),
            readGpuTemperature(),
            readCpuTimes(),
        ]);

        if (!this._indicator)
            return;

        const cpuLoads = calculateCpuLoads(this._previousCpuTimes, currentCpuTimes);
        this._previousCpuTimes = currentCpuTimes;
        this._indicator.setReadings(cpuTemperature, gpuTemperature, cpuLoads);
        this._timeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            REFRESH_INTERVAL_MS,
            () => {
                this._timeoutId = null;
                void this._refresh();
                return GLib.SOURCE_REMOVE;
            }
        );
    }
}
