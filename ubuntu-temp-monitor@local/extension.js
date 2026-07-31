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
const CORE_COUNT = 6;

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

const TemperatureIndicator = GObject.registerClass(
class TemperatureIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'Ubuntu Temperature Monitor', true);

        this._content = new St.BoxLayout({
            style_class: 'temp-monitor',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._content);

        this._coreTiles = Array.from({length: CORE_COUNT}, () => {
            const tile = new St.Label({
                text: PLACEHOLDER,
                style_class: 'temp-monitor-core temp-monitor-neutral',
                y_align: Clutter.ActorAlign.CENTER,
            });
            this._content.add_child(tile);
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

    setTemperatures(cpuTemperature, gpuTemperature) {
        for (const tile of this._coreTiles)
            this._setTile(tile, 'temp-monitor-core', compactTemperature(cpuTemperature), cpuTemperature);

        this._setTile(
            this._cpuTile,
            'temp-monitor-summary temp-monitor-cpu',
            summaryTemperature('CPU', cpuTemperature),
            cpuTemperature
        );
        this._setTile(
            this._gpuTile,
            'temp-monitor-summary temp-monitor-gpu',
            summaryTemperature('GPU', gpuTemperature),
            gpuTemperature
        );
    }

    _setTile(tile, baseClass, text, temperature) {
        tile.set_text(text);
        tile.set_style_class_name(`${baseClass} ${temperatureClass(temperature)}`);
    }
});

export default class UbuntuTempMonitorExtension extends Extension {
    enable() {
        this._indicator = new TemperatureIndicator();
        this._timeoutId = null;
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
    }

    async _refresh() {
        const [cpuTemperature, gpuTemperature] = await Promise.all([
            readCpuTemperature(),
            readGpuTemperature(),
        ]);

        if (!this._indicator)
            return;

        this._indicator.setTemperatures(cpuTemperature, gpuTemperature);
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
