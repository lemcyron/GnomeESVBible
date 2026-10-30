# ESV Bible Verses — GNOME Shell Extension

A GNOME Shell 45+ extension that displays Bible verses from the [ESV® Bible](https://www.esv.org) via the [ESV.org API](https://api.esv.org) directly in your panel.

---

## Features

- 📖 **Panel icon** with optional verse snippet displayed in the top bar
- 📜 **Popup menu** showing the full verse reference and text
- ◀▶ **Navigation** — cycle forward/backward through your verse list
- 🎲 **Random verse** button
- 📋 **Copy to clipboard** — copies verse + reference in one click
- 🌐 **Open on ESV.org** — launches the passage in your browser
- ⏱️ **Auto-refresh** — advances to the next verse on a configurable timer
- ✏️ **Custom verse list** — define your own set of references in Preferences
- 🔑 **API key management** — stored securely in GSettings (never in code)

---

## Requirements

| Requirement | Version |
|---|---|
| GNOME Shell | 45 – 51 |
| GLib | 2.76+ |
| libsoup | 3.x |

---

## Installation

### Quick install (recommended)

```bash
chmod +x install.sh
./install.sh
```

Then enable the extension:

```bash
gnome-extensions enable esv-bible-verses@gnome-extension
```

### Manual install

```bash
UUID="esv-bible-verses@gnome-extension"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"

mkdir -p "$DEST/schemas"
cp metadata.json extension.js prefs.js stylesheet.css "$DEST/"
cp schemas/*.xml "$DEST/schemas/"
glib-compile-schemas "$DEST/schemas/"
gnome-extensions enable $UUID
```

---

## Getting an ESV API Key

1. Visit **<https://api.esv.org>**
2. Create a free account
3. Go to **API Tokens** and create a new token
4. Open the extension **Preferences** and paste the token into the *API Key* field

The ESV.org free tier allows **up to 500 API calls per day** — more than enough for personal use.

---

## Preferences

Open via **right-click menu → Preferences** or the GNOME Extensions app.

| Setting | Description |
|---|---|
| **API Key** | Your ESV.org API token |
| **Show verse in panel** | Display a snippet next to the icon |
| **Auto-refresh interval** | Minutes between automatic verse advances (0 = off) |
| **Custom verse list** | One reference per line; leave blank to use built-in defaults |

### Built-in default verses

When no custom list is configured, the extension cycles through:

- John 3:16, Psalm 23:1, Romans 8:28, Philippians 4:13, Jeremiah 29:11
- Proverbs 3:5-6, Isaiah 40:31, Matthew 6:33, Psalm 46:1, Romans 12:2

---

## File Structure

```
esv-bible-verses@gnome-extension/
├── metadata.json          # Extension metadata & GNOME version targets
├── extension.js           # Main extension (panel button, API calls, menu)
├── prefs.js               # Preferences window (Adw/GTK4)
├── stylesheet.css         # Panel & popup menu styles
├── schemas/
│   └── org.gnome.shell.extensions.esv-bible-verses.gschema.xml
└── install.sh             # Helper install script
```

---

## Copyright Notice

> The Holy Bible, English Standard Version® (ESV®)  
> Copyright © 2001 by Crossway, a publishing ministry of Good News Publishers.  
> ESV Text Edition: 2016  
> The ESV text may be quoted (in written, visual, or electronic form) up to and inclusive of five hundred (500) verses without express written permission of the publisher.

This extension uses the official ESV API in accordance with Crossway's API terms of service.

---

## License

MIT License — see source files.
