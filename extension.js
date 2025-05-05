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
            const slider = new Slider.Slider(0.5);  // default to 50%

            slider.connect('notify::value', () => {
                this._applyBrightness(output, slider.value);
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
        } catch (e) {
            log(`[BrightnessController] Error getting connected displays: ${e}`);
            return [];
        }
    }

    _applyBrightness(output, value) {
        const percent = Math.round(Math.max(0.05, value) * 100); // Avoid 0%

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

            subprocess.communicate_utf8_async(null, null, (proc, res) => {
                try {
                    proc.communicate_utf8_finish(res);
                } catch (err) {
                    log(`[BrightnessController] brightnessctl error: ${err.message}`);
                }
            });
        } catch (e) {
            log(`[BrightnessController] brightnessctl failed: ${e.message}`);
        }
    }

    _setDdcutil(output, percent) {
        const clamped = Math.max(1, Math.min(100, percent)); // Some displays crash below 1%
        try {
            const subprocess = Gio.Subprocess.new(
                ['ddcutil', 'setvcp', '10', `${clamped}`],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            subprocess.communicate_utf8_async(null, null, (proc, res) => {
                try {
                    proc.communicate_utf8_finish(res);
                } catch (err) {
                    log(`[BrightnessController] ddcutil error: ${err.message}`);
                }
            });
        } catch (e) {
            log(`[BrightnessController] ddcutil failed for ${output}: ${e.message}`);
        }
    }

    _isInternalDisplay(output) {
        return output.toLowerCase().includes('eDP') || output.toLowerCase().includes('lvds');
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
