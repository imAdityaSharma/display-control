# Brightness Controller Extension for GNOME Shell

The **Brightness Controller** extension allows you to easily control the brightness of your internal and external displays directly from the GNOME Shell panel.

## Features

* **Adjust Internal Display Brightness**: Supports adjusting the brightness of your internal display (e.g., laptop screen).
* **Control External Display Brightness**: Uses `ddcutil` to control external monitor brightness.
* **Smooth Slider Control**: The extension provides a slider with steps from 0% to 100% in increments of 5%.

## Installation

### 1. Install via GNOME Extensions Website

Once the extension is uploaded to the GNOME Extensions website, you will be able to install it directly from there. Simply visit the link below (to be updated after uploading):

[**Install on GNOME Extensions Website(soon)**](#)

### 2. Manual Installation

#### Prerequisites

* GNOME Shell 40 or newer.
* `ddcutil` for external display brightness control.
* `brightnessctl` for internal display brightness control.

#### Steps:

1. **Download the ZIP File**:

   * Download the ZIP from the [GitHub Releases Page](https://github.com/yourusername/brightness-controller/releases).

2. **Download the Install Script**:

   * Download `install.sh` from this repository.

3. **Run the Install Script**:

   ```bash
   chmod +x install.sh
   ./install.sh
   ```

4. **Enable the Extension**:

   * The script will automatically unzip, install, and enable the extension.
   * Log out and log back in if required (especially on Wayland).

### 3. Manually Enable/Disable the Extension

```bash
gnome-extensions enable brightness-controller@yourdomain.username
gnome-extensions disable brightness-controller@yourdomain.username
```

## Troubleshooting

* **External Display Not Showing Brightness Control**:

  * Ensure `ddcutil` is installed and your monitor supports DDC/CI.
  * Use `ddcutil detect` to verify connected displays.

* **Internal Display Brightness Not Working**:

  * Make sure `brightnessctl` is installed.
  * Install via `sudo apt install brightnessctl` or your distro's equivalent.

## Uninstalling the Extension

```bash
gnome-extensions disable brightness-controller@yourdomain.username
rm -rf ~/.local/share/gnome-shell/extensions/brightness-controller@yourdomain.username
```

## Contributing

Feel free to open issues or submit pull requests for bugs and feature suggestions.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
