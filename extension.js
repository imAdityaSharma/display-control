import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

const BrightnessController = GObject.registerClass(
class BrightnessController extends PanelMenu.Button {
    constructor() {
        super(0.0, _('Brightness Controller'), false);

        const icon = new St.Icon({
            icon_name: 'display-brightness-symbolic',
            style_class: 'system-status-icon',
        });

        const box = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
        box.add_child(icon);
        this.add_child(box);

        this._outputs = this._getConnectedOutputs();
        this._sliders = {};

        for (const output of this._outputs) {
            const item = new PopupMenu.PopupBaseMenuItem({ activate: false });

            const label = new St.Label({ text: output, x_expand: true });
            const initialValue = this._getCurrentBrightnessRatio(output);
            const slider = new Slider.Slider(initialValue);

            slider.connect('notify::value', () => {
                const roundedValue = Math.round(slider.value * 20) / 20;

                if (Math.abs(slider.value - roundedValue) > 0.001) {
                    slider.value = roundedValue;
                    return;
                }

                this._applyBrightness(output, roundedValue);
            });

            item.add_child(label);
            item.add_child(slider);
            this.menu.addMenuItem(item);

            this._sliders[output] = slider;
        }
    }

    _getConnectedOutputs() {
        try {
            const [ok, out] = GLib.spawn_command_line_sync('xrandr --query');
            if (!ok) return [];

            const outputStr = new TextDecoder().decode(out);
            const lines = outputStr.split('\n');
            return lines.filter(l => l.includes(' connected')).map(l => l.split(' ')[0]);
        } catch (_) {
            return [];
        }
    }

    _applyBrightness(output, value) {
        const percent = Math.round(Math.max(0.05, value) * 100);

        if (this._isInternalDisplay(output)) {
            this._setBrightnessctl(percent);
        } else {
            this._setDdcutil(output, percent);
        }
    }

    _setBrightnessctl(percent) {
        try {
            const subprocess = Gio.Subprocess.new(
                ['brightnessctl', 'set', `${percent}%`],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            subprocess.communicate_utf8_async(null, null, () => {});
        } catch (_) {}
    }

    _setDdcutil(output, percent) {
        const clamped = Math.max(1, Math.min(100, percent));
        try {
            const subprocess = Gio.Subprocess.new(
                ['ddcutil', 'setvcp', '10', `${clamped}`],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            subprocess.communicate_utf8_async(null, null, () => {});
        } catch (_) {}
    }

    _getCurrentBrightnessRatio(output) {
        try {
            if (this._isInternalDisplay(output)) {
                const [ok, out] = GLib.spawn_command_line_sync('brightnessctl g');
                const [okMax, outMax] = GLib.spawn_command_line_sync('brightnessctl m');
                if (ok && okMax) {
                    const current = parseInt(new TextDecoder().decode(out).trim());
                    const max = parseInt(new TextDecoder().decode(outMax).trim());
                    if (!isNaN(current) && !isNaN(max) && max > 0) {
                        return Math.min(1.0, Math.max(0.05, current / max));
                    }
                }
            } else {
                const [ok, out] = GLib.spawn_command_line_sync(`ddcutil getvcp 10 --brief --display ${output}`);
                if (ok) {
                    const outputStr = new TextDecoder().decode(out).trim();
                    const match = outputStr.match(/current value = (\d+), max value = (\d+)/);
                    if (match) {
                        const current = parseInt(match[1]);
                        const max = parseInt(match[2]);
                        if (!isNaN(current) && !isNaN(max) && max > 0) {
                            return Math.min(1.0, Math.max(0.05, current / max));
                        }
                    }
                }
            }
        } catch (_) {}

        return 1.0;
    }

    _isInternalDisplay(output) {
        return output.toLowerCase().includes('edp') || output.toLowerCase().includes('lvds');
    }

    destroy() {
        super.destroy();
    }
});

let _indicator;

export default class BrightnessExtension extends Extension {
    enable() {
        _indicator = new BrightnessController();
        Main.panel.addToStatusArea(this.uuid, _indicator);
    }

    disable() {
        if (_indicator) {
            _indicator.destroy();
            _indicator = null;
        }
    }
}
