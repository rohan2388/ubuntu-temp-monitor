import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

const REFRESH_INTERVAL_MS = 2000;
const PLACEHOLDER = '--';

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

class TemperatureIndicator extends PanelMenu.Button {
    constructor() {
        super(0.0, 'Ubuntu Temperature Monitor');

        this._label = new St.Label({
            text: `CPU ${PLACEHOLDER}°C | GPU ${PLACEHOLDER}°C`,
        });
        this.add_child(this._label);
    }

    setTemperatures(cpuTemperature, gpuTemperature) {
        const cpu = cpuTemperature ?? PLACEHOLDER;
        const gpu = gpuTemperature ?? PLACEHOLDER;
        this._label.set_text(`CPU ${cpu}°C | GPU ${gpu}°C`);
    }
}

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
