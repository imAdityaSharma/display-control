#!/bin/bash

set -e

# Configurable variables
EXTENSION_UUID="display-control@iamadityasharma.pro"
EXTENSION_NAME="display-control"
GNOME_VERSION=$(gnome-shell --version | grep -oP '[0-9]+\.[0-9]+')
ZIP_FILE="display-control@iamadityasharma.pro"

# Determine extension install path
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"

echo "Installing $EXTENSION_NAME for GNOME $GNOME_VERSION..."

# Check if ZIP exists
if [ ! -f "$ZIP_FILE" ]; then
    echo "Error: '$ZIP_FILE' not found in current directory."
    echo "Please download the ZIP file and place this script in the same directory."
    exit 1
fi

# Unzip to the right location
mkdir -p "$EXTENSION_DIR"
unzip -o "$ZIP_FILE" -d "$EXTENSION_DIR"

# Set correct permissions
chmod -R 755 "$EXTENSION_DIR"

# Validate extension
echo "Validating extension..."
gnome-extensions validate "$EXTENSION_DIR" || echo "Warning: Validation failed, continuing..."

# Enable extension
gnome-extensions enable "$EXTENSION_UUID"

echo "Extension '$EXTENSION_NAME' installed and enabled."

# Reload GNOME Shell (only works in X11)
if [ "$XDG_SESSION_TYPE" = "x11" ]; then
    echo "Reloading GNOME Shell..."
    gnome-shell --replace &
    disown
    echo "Done."
else
    echo "On Wayland, please log out and back in to activate the extension."
fi
