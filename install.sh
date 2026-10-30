#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# install.sh — Install the ESV Bible Verses GNOME extension
#
# Usage:
#   chmod +x install.sh
#   ./install.sh
#
# What this does:
#   1. Compiles the GSettings schema
#   2. Copies all extension files to ~/.local/share/gnome-shell/extensions/
#   3. Prints a reminder to enable the extension
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

UUID="esv-bible-verses@gnome-extension"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"

echo "Installing ESV Bible Verses extension…"

# 1. Create destination directory
mkdir -p "$DEST/schemas"

# 2. Copy extension files
cp metadata.json    "$DEST/"
cp extension.js     "$DEST/"
cp prefs.js         "$DEST/"
cp stylesheet.css   "$DEST/"
cp bible-browser.js "$DEST/"
chmod +x "$DEST/bible-browser.js"
cp schemas/org.gnome.shell.extensions.esv-bible-verses.gschema.xml \
   "$DEST/schemas/"

# 3. Compile GSettings schema
glib-compile-schemas "$DEST/schemas/"

echo ""
echo "✓ Extension installed to: $DEST"
echo ""
echo "Next steps:"
echo "  • On GNOME 45+, run:  gnome-extensions enable $UUID"
echo "  • Or open Extensions app and enable 'ESV Bible Verses'"
echo "  • Then open Preferences to enter your ESV.org API key"
echo ""
echo "To get a free API key:"
echo "  1. Visit https://api.esv.org"
echo "  2. Create a free account"
echo "  3. Go to API Tokens and create a new token"
echo "  4. Paste the token into the extension Preferences"
