import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';
import Clutter from 'gi://Clutter';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// ─── Bible Browser launcher ───────────────────────────────────────────────────
// Runs bible-browser.js as a separate gjs process (GTK4 can't run inside the
// shell process). The API key is passed via the child's environment only.
function launchBibleBrowser(extensionPath, apiKey) {
    const scriptPath = GLib.build_filenamev([extensionPath, 'bible-browser.js']);

    try {
        const gjsBin = GLib.find_program_in_path('gjs') ?? '/usr/bin/gjs';

        const launcher = new Gio.SubprocessLauncher({
            flags: Gio.SubprocessFlags.STDERR_PIPE,
        });
        launcher.setenv('ESV_API_KEY', apiKey || '', true);

        const proc = launcher.spawnv([gjsBin, scriptPath]);

        // Surface startup failures instead of failing silently
        proc.communicate_utf8_async(null, null, (p, res) => {
            try {
                const [, , stderr] = p.communicate_utf8_finish(res);
                if (!p.get_successful()) {
                    console.error(`[ESVBible] bible-browser exited abnormally:\n${stderr}`);
                    Main.notify('ESV Bible', 'Bible Browser failed to start. See journalctl for details.');
                }
            } catch (e) {
                console.error('[ESVBible] bible-browser wait failed:', e);
            }
        });
    } catch (e) {
        Main.notify('ESV Bible', 'Could not open Bible Browser.');
        console.error('[ESVBible] launchBibleBrowser:', e);
    }
}

// ─── Default verse list ───────────────────────────────────────────────────────
const DEFAULT_VERSES = [
    'John 3:16',
    'Psalm 23:1',
    'Romans 8:28',
    'Philippians 4:13',
    'Jeremiah 29:11',
    'Proverbs 3:5-6',
    'Isaiah 40:31',
    'Matthew 6:33',
    'Psalm 46:1',
    'Romans 12:2',
];

// ─── Panel Button ─────────────────────────────────────────────────────────────
const ESVBibleButton = GObject.registerClass(
class ESVBibleButton extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, _('ESV Bible Verses'));
        this._extension = extension;
        this._settings = extension.getSettings();
        this._httpSession = null;
        this._refreshTimeout = null;
        this._currentVerseIndex = 0;
        this._cachedVerses = [];

        // ── Panel icon only ──
        const icon = new St.Icon({
            icon_name: 'accessories-dictionary-symbolic',
            style_class: 'system-status-icon',
        });
        this.add_child(icon);

        // ── Popup menu ──
        this._buildMenu();

        // ── Start ──
        this._initSession();
        this._loadSettings();
        this._fetchVerse();

        // Watch settings changes
        this._settingsChangedId = this._settings.connect('changed', () => {
            this._loadSettings();
            this._fetchVerse();
        });
    }

    _buildMenu() {
        // Reference display
        this._referenceItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._referenceItem.label.style_class = 'esv-reference';
        this.menu.addMenuItem(this._referenceItem);

        // Verse text — scrollable area
        this._verseItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._verseItem.label.clutter_text.line_wrap = true;
        this._verseItem.label.clutter_text.line_wrap_mode = 2; // WORD
        this._verseItem.label.style_class = 'esv-verse-text';
        this.menu.addMenuItem(this._verseItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ── Verse search row ──
        const searchItem = new PopupMenu.PopupBaseMenuItem({reactive: false});
        const searchBox = new St.BoxLayout({
            x_expand: true,
            style_class: 'esv-search-box',
        });
        this._searchEntry = new St.Entry({
            hint_text: _('e.g. John 3:16'),
            can_focus: true,
            x_expand: true,
            style_class: 'esv-search-entry',
        });
        this._searchEntry.clutter_text.connect('activate', () => {
            const query = this._searchEntry.get_text().trim();
            if (query) {
                this._searchEntry.set_text('');
                this._fetchVerse(query);
            }
        });
        const goBtn = new St.Button({
            label: _('Go'),
            style_class: 'esv-nav-btn',
        });
        goBtn.connect('clicked', () => {
            const query = this._searchEntry.get_text().trim();
            if (query) {
                this._searchEntry.set_text('');
                this._fetchVerse(query);
            }
        });
        searchBox.add_child(this._searchEntry);
        searchBox.add_child(goBtn);
        searchItem.add_child(searchBox);
        this.menu.addMenuItem(searchItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ── Navigation row (prev / next) ──
        const navItem = new PopupMenu.PopupBaseMenuItem({reactive: false});
        const navBox = new St.BoxLayout({
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            style_class: 'esv-nav-box',
        });

        this._prevBtn = new St.Button({
            label: '◀  ' + _('Prev'),
            style_class: 'esv-nav-btn',
            x_expand: true,
        });
        this._prevBtn.connect('clicked', () => this._navigate(-1));

        this._nextBtn = new St.Button({
            label: _('Next') + '  ▶',
            style_class: 'esv-nav-btn',
            x_expand: true,
        });
        this._nextBtn.connect('clicked', () => this._navigate(1));

        navBox.add_child(this._prevBtn);
        navBox.add_child(this._nextBtn);
        navItem.add_child(navBox);
        this.menu.addMenuItem(navItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Bible Browser window
        const browserItem = new PopupMenu.PopupMenuItem(_('Open Bible Browser…'));
        browserItem.connect('activate', () => {
            this.menu.close();
            launchBibleBrowser(
                this._extension.path,
                this._settings.get_string('api-key')
            );
        });
        this.menu.addMenuItem(browserItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Refresh
        const refreshItem = new PopupMenu.PopupMenuItem(_('Refresh'));
        refreshItem.connect('activate', () => this._fetchVerse());
        this.menu.addMenuItem(refreshItem);

        // Copy verse
        const copyItem = new PopupMenu.PopupMenuItem(_('Copy Verse'));
        copyItem.connect('activate', () => this._copyVerse());
        this.menu.addMenuItem(copyItem);

        // Open in Browser
        const openItem = new PopupMenu.PopupMenuItem(_('Open on ESV.org'));
        openItem.connect('activate', () => this._openInBrowser());
        this.menu.addMenuItem(openItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Preferences
        const prefItem = new PopupMenu.PopupMenuItem(_('Preferences…'));
        prefItem.connect('activate', () => {
            this._extension.openPreferences();
        });
        this.menu.addMenuItem(prefItem);
    }

    _loadSettings() {
        this._apiKey = this._settings.get_string('api-key');
        this._autoRefreshMins = this._settings.get_int('auto-refresh-minutes');
        this._customVerses = this._settings.get_strv('custom-verses');

        // Rebuild verse pool
        this._versePool = this._customVerses.length > 0
            ? this._customVerses
            : DEFAULT_VERSES;

        // Reset auto-refresh timer
        this._scheduleAutoRefresh();
    }

    _initSession() {
        this._httpSession = new Soup.Session();
        this._httpSession.timeout = 15;
        this._httpSession.user_agent = 'GnomeESVBibleExtension/1.0';
    }

    // ── Fetch a specific verse by reference ──────────────────────────────────
    _fetchVerse(reference = null) {
        if (!this._apiKey || this._apiKey.trim() === '') {
            this._showError(_('Set your ESV API key in Preferences'));
            return;
        }

        const ref = reference ?? this._versePool[this._currentVerseIndex % this._versePool.length];
        const encodedRef = GLib.uri_escape_string(ref, null, true);
        const url = `https://api.esv.org/v3/passage/text/?q=${encodedRef}` +
                    `&include-headings=false` +
                    `&include-footnotes=false` +
                    `&include-verse-numbers=false` +
                    `&include-short-copyright=false` +
                    `&include-passage-references=false`;

        const message = Soup.Message.new('GET', url);
        message.request_headers.append('Authorization', `Token ${this._apiKey.trim()}`);

        this._referenceItem.label.text = ref;
        this._verseItem.label.text = _('Fetching…');

        this._httpSession.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            null,
            (session, result) => {
                try {
                    const bytes = session.send_and_read_finish(result);
                    const statusCode = message.get_status();

                    if (statusCode === 401) {
                        this._showError(_('Invalid API key — check Preferences'));
                        return;
                    }
                    if (statusCode !== 200) {
                        this._showError(`HTTP ${statusCode}`);
                        return;
                    }

                    const decoder = new TextDecoder('utf-8');
                    const body = decoder.decode(bytes.get_data());
                    const data = JSON.parse(body);

                    const passages = data.passages ?? [];
                    if (passages.length === 0) {
                        this._showError(_('No passage found'));
                        return;
                    }

                    const text = passages[0].trim().replace(/\s+/g, ' ');
                    const canonical = data.canonical ?? ref;

                    this._displayVerse(canonical, text);
                } catch (e) {
                    this._showError(_('Error: ') + e.message);
                    console.error('[ESVBible]', e);
                }
            }
        );
    }

    _navigate(direction) {
        this._currentVerseIndex = (
            (this._currentVerseIndex + direction + this._versePool.length) % this._versePool.length
        );
        this._fetchVerse();
    }

    _displayVerse(reference, text) {
        this._referenceItem.label.text = reference;
        this._verseItem.label.text = text;

        // Auto-copy every fetched verse to clipboard
        const clipboard = St.Clipboard.get_default();
        clipboard.set_text(St.ClipboardType.CLIPBOARD, `${text} — ${reference} (ESV)`);

        // Cache
        this._cachedVerses.push({reference, text});
        if (this._cachedVerses.length > 50) this._cachedVerses.shift();
    }

    _showError(msg) {
        this._referenceItem.label.text = _('Error');
        this._verseItem.label.text = msg;
    }

    _copyVerse() {
        const ref = this._referenceItem.label.text;
        const verse = this._verseItem.label.text;
        if (!verse || verse === _('Fetching…')) return;

        const clipboard = St.Clipboard.get_default();
        clipboard.set_text(St.ClipboardType.CLIPBOARD, `${verse} — ${ref} (ESV)`);

        Main.notify(_('ESV Bible'), _('Verse copied to clipboard'));
    }

    _openInBrowser() {
        const ref = this._referenceItem.label.text;
        if (!ref || ref === _('Error')) return;
        const encoded = GLib.uri_escape_string(ref, null, true);
        const url = `https://www.esv.org/verses/${encoded}/`;
        Gio.AppInfo.launch_default_for_uri(url, null);
    }

    _scheduleAutoRefresh() {
        if (this._refreshTimeout) {
            GLib.source_remove(this._refreshTimeout);
            this._refreshTimeout = null;
        }
        if (this._autoRefreshMins > 0) {
            this._refreshTimeout = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                this._autoRefreshMins * 60,
                () => {
                    this._navigate(1);
                    return GLib.SOURCE_CONTINUE;
                }
            );
        }
    }

    destroy() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        if (this._refreshTimeout) {
            GLib.source_remove(this._refreshTimeout);
            this._refreshTimeout = null;
        }
        if (this._httpSession) {
            // Soup.Session has no abort() in libsoup3; just drop the reference.
            this._httpSession = null;
        }
        super.destroy();
    }
});

// ─── Extension Entry Point ────────────────────────────────────────────────────
export default class ESVBibleExtension extends Extension {
    enable() {
        this._button = new ESVBibleButton(this);
        Main.panel.addToStatusArea(this.uuid, this._button);
    }

    disable() {
        if (this._button) {
            this._button.destroy();
            this._button = null;
        }
    }
}
