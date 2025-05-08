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
    _init() {
        super._init(0.0, _('Brightness Controller'));
        
        // Create and add the icon
        this._icon = new St.Icon({
            icon_name: 'display-brightness-symbolic',
            style_class: 'system-status-icon',
        });
        
        this.add_child(this._icon);
        
        this._outputs = [];
        this._sliders = {};
        
        // Initialize with empty menu
        this._createBaseMenu();
        
        // Connect to menu open event to refresh outputs
        this.menu.connect('open-state-changed', (menu, open) => {
            if (open) {
                this._refreshDisplays().catch(e => {
                    logError(e, 'Failed to refresh brightness controller');
                });
            }
        });
        
        // Initial setup
        this._refreshDisplays().catch(e => {
            logError(e, 'Failed to initialize brightness controller');
        });
    }
    
    _createBaseMenu() {
        // Clear existing menu items
        this.menu.removeAll();
        
        const placeholder = new PopupMenu.PopupMenuItem(_('Detecting displays...'));
        placeholder.setSensitive(false);
        this.menu.addMenuItem(placeholder);
    }
    
    async _refreshDisplays() {
        try {
            // Get connected outputs
            this._outputs = await this._getConnectedOutputs();
            this._populateMenu();
        } catch (e) {
            logError(e, 'Error refreshing displays');
            this._createErrorMenu();
        }
    }
    
    _createErrorMenu() {
        this.menu.removeAll();
        const errorItem = new PopupMenu.PopupMenuItem(_('Error detecting displays'));
        errorItem.setSensitive(false);
        this.menu.addMenuItem(errorItem);
    }
    
    _populateMenu() {
        // Clear existing menu items
        this.menu.removeAll();
        
        if (this._outputs.length === 0) {
            const item = new PopupMenu.PopupMenuItem(_('No displays detected'));
            item.setSensitive(false);
            this.menu.addMenuItem(item);
            return;
        }

        // Add internal display first (if any)
        const internalDisplays = this._outputs.filter(output => this._isInternalDisplay(output));
        const externalDisplays = this._outputs.filter(output => !this._isInternalDisplay(output));
        
        // Sort displays: internal first, then external
        const sortedOutputs = [...internalDisplays, ...externalDisplays];
        
        // Add a section title for clarity
        if (sortedOutputs.length > 1) {
            const title = new PopupMenu.PopupMenuItem(_('Brightness Controls'));
            title.setSensitive(false);
            this.menu.addMenuItem(title);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }

        for (const output of sortedOutputs) {
            const menuItem = new PopupMenu.PopupBaseMenuItem({ activate: false });

            // Determine if this is an internal display and show a friendly name
            const isInternal = this._isInternalDisplay(output);
            const displayName = isInternal ? _('Internal Display') : output;

            const label = new St.Label({
                text: displayName,
                x_expand: true,
                y_align: St.Align.MIDDLE
            });
            
            // Create slider
            const slider = new Slider.Slider(1.0);
            
            // Get current brightness asynchronously
            this._getCurrentBrightnessRatio(output).then(value => {
                slider.value = value;
            }).catch(() => {
                slider.value = 1.0;
            });

            slider.connect('notify::value', () => {
                const roundedValue = Math.round(slider.value * 20) / 20;

                if (Math.abs(slider.value - roundedValue) > 0.001) {
                    slider.value = roundedValue;
                    return;
                }

                this._applyBrightness(output, roundedValue);
            });

            menuItem.add_child(label);
            menuItem.add_child(slider);
            this.menu.addMenuItem(menuItem);

            this._sliders[output] = slider;
        }
    }

    async _getConnectedOutputs() {
        // For Wayland compatibility, attempt to use modern APIs first
        // then fall back to xrandr if needed
        
        try {
            // Try to get outputs from xrandr first
            const outputs = await this._getOutputsFromXrandr();
            
            // If no outputs found, add some fallbacks
            if (outputs.length === 0) {
                log('Brightness Controller: No outputs detected, adding fallbacks');
                
                // Check if we're on a laptop (likely has an internal display)
                const hasInternal = await this._hasInternalDisplay();
                if (hasInternal) {
                    outputs.push('eDP-1'); // Common internal display name
                }
                
                // Add HDMI as it's very common
                outputs.push('HDMI-1');
            }
            
            return outputs;
        } catch (e) {
            logError(e, 'Failed to get outputs');
            // Fallback to common display names
            return ['eDP-1', 'HDMI-1'];
        }
    }
    
    async _hasInternalDisplay() {
        try {
            // Check if brightnessctl works, which typically means we have an internal display
            const proc = Gio.Subprocess.new(
                ['brightnessctl', 'i'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );
            
            const [, stdout] = await proc.communicate_utf8_async(null, null);
            return stdout && !stdout.includes('No devices found');
        } catch (e) {
            return false;
        }
    }
    
    async _getOutputsFromXrandr() {
        try {
            // Debug: Log that we're trying to detect displays
            log('Brightness Controller: Detecting displays using xrandr');
            
            const proc = Gio.Subprocess.new(
                ['xrandr', '--query'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            const [, stdout, stderr] = await proc.communicate_utf8_async(null, null);
            
            // Log the raw output for debugging
            log('Brightness Controller: xrandr output: ' + stdout);
            if (stderr) {
                log('Brightness Controller: xrandr stderr: ' + stderr);
            }
            
            if (!stdout) {
                log('Brightness Controller: No output from xrandr');
                return ['eDP-1', 'HDMI-1']; // Fallback to common display names
            }
            
            const lines = stdout.split('\n');
            const connectedLines = lines.filter(l => l.includes(' connected'));
            
            // Debug: Log connected lines
            log('Brightness Controller: Connected lines: ' + JSON.stringify(connectedLines));
            
            if (connectedLines.length === 0) {
                log('Brightness Controller: No connected displays found in xrandr output, using fallback');
                return ['eDP-1', 'HDMI-1']; // Fallback to common display names
            }
            
            const displays = connectedLines.map(l => l.split(' ')[0]);
            log('Brightness Controller: Detected displays: ' + JSON.stringify(displays));
            return displays;
        } catch (e) {
            logError(e, 'Failed to get connected outputs');
            // Since we know you have these displays, let's fall back to hardcoded values
            return ['eDP-1', 'HDMI-1'];
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
        } catch (e) {
            logError(e, 'Failed to set brightness using brightnessctl');
        }
    }

    _setDdcutil(output, percent) {
        const clamped = Math.max(1, Math.min(100, percent));
        try {
            const subprocess = Gio.Subprocess.new(
                ['ddcutil', 'setvcp', '10', `${clamped}`],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            subprocess.communicate_utf8_async(null, null, () => {});
        } catch (e) {
            logError(e, 'Failed to set brightness using ddcutil');
        }
    }

    async _getCurrentBrightnessRatio(output) {
        try {
            if (this._isInternalDisplay(output)) {
                // Get current brightness
                const procCurrent = Gio.Subprocess.new(
                    ['brightnessctl', 'g'],
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
                );
                
                // Get maximum brightness
                const procMax = Gio.Subprocess.new(
                    ['brightnessctl', 'm'],
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
                );
                
                const [, currentOut] = await procCurrent.communicate_utf8_async(null, null);
                const [, maxOut] = await procMax.communicate_utf8_async(null, null);
                
                if (currentOut && maxOut) {
                    const current = parseInt(currentOut.trim());
                    const max = parseInt(maxOut.trim());
                    if (!isNaN(current) && !isNaN(max) && max > 0) {
                        return Math.min(1.0, Math.max(0.05, current / max));
                    }
                }
            } else {
                const proc = Gio.Subprocess.new(
                    ['ddcutil', 'getvcp', '10', '--brief', '--display', output],
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
                );
                
                const [, stdout] = await proc.communicate_utf8_async(null, null);
                
                if (stdout) {
                    const match = stdout.trim().match(/current value = (\d+), max value = (\d+)/);
                    if (match) {
                        const current = parseInt(match[1]);
                        const max = parseInt(match[2]);
                        if (!isNaN(current) && !isNaN(max) && max > 0) {
                            return Math.min(1.0, Math.max(0.05, current / max));
                        }
                    }
                }
            }
        } catch (e) {
            logError(e, 'Failed to get current brightness');
        }

        return 1.0;
    }

    _isInternalDisplay(output) {
        const lowercaseOutput = output.toLowerCase();
        return lowercaseOutput.includes('edp') || 
               lowercaseOutput.includes('lvds') || 
               lowercaseOutput.includes('internal') ||
               lowercaseOutput.includes('egpu') ||
               lowercaseOutput.includes('evdi');
    }
});

let _indicator = null;

export default class BrightnessExtension extends Extension {
    enable() {
        _indicator = new BrightnessController();
        Main.panel.addToStatusArea('brightness-controller', _indicator);
    }

    disable() {
        if (_indicator !== null) {
            _indicator.destroy();
            _indicator = null;
        }
    }
}