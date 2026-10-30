#!/usr/bin/env gjs
// ─────────────────────────────────────────────────────────────────────────────
// bible-browser — standalone GTK4/Adwaita Bible Browser window
//
// Launched by the GNOME Shell extension via Gio.Subprocess.
// Usage:  gjs bible-browser --api-key TOKEN
//         (the extension passes the key so GSettings aren't needed here)
// ─────────────────────────────────────────────────────────────────────────────

import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

// ─── Bible book data (canonical order, chapter counts) ───────────────────────
const BIBLE_BOOKS = [
    // Old Testament
    {name: 'Genesis',        abbr: 'Gen',   chapters: 50},
    {name: 'Exodus',         abbr: 'Exod',  chapters: 40},
    {name: 'Leviticus',      abbr: 'Lev',   chapters: 27},
    {name: 'Numbers',        abbr: 'Num',   chapters: 36},
    {name: 'Deuteronomy',    abbr: 'Deut',  chapters: 34},
    {name: 'Joshua',         abbr: 'Josh',  chapters: 24},
    {name: 'Judges',         abbr: 'Judg',  chapters: 21},
    {name: 'Ruth',           abbr: 'Ruth',  chapters: 4},
    {name: '1 Samuel',       abbr: '1Sam',  chapters: 31},
    {name: '2 Samuel',       abbr: '2Sam',  chapters: 24},
    {name: '1 Kings',        abbr: '1Kgs',  chapters: 22},
    {name: '2 Kings',        abbr: '2Kgs',  chapters: 25},
    {name: '1 Chronicles',   abbr: '1Chr',  chapters: 29},
    {name: '2 Chronicles',   abbr: '2Chr',  chapters: 36},
    {name: 'Ezra',           abbr: 'Ezra',  chapters: 10},
    {name: 'Nehemiah',       abbr: 'Neh',   chapters: 13},
    {name: 'Esther',         abbr: 'Esth',  chapters: 10},
    {name: 'Job',            abbr: 'Job',   chapters: 42},
    {name: 'Psalms',         abbr: 'Ps',    chapters: 150},
    {name: 'Proverbs',       abbr: 'Prov',  chapters: 31},
    {name: 'Ecclesiastes',   abbr: 'Eccl',  chapters: 12},
    {name: 'Song of Solomon',abbr: 'Song',  chapters: 8},
    {name: 'Isaiah',         abbr: 'Isa',   chapters: 66},
    {name: 'Jeremiah',       abbr: 'Jer',   chapters: 52},
    {name: 'Lamentations',   abbr: 'Lam',   chapters: 5},
    {name: 'Ezekiel',        abbr: 'Ezek',  chapters: 48},
    {name: 'Daniel',         abbr: 'Dan',   chapters: 12},
    {name: 'Hosea',          abbr: 'Hos',   chapters: 14},
    {name: 'Joel',           abbr: 'Joel',  chapters: 3},
    {name: 'Amos',           abbr: 'Amos',  chapters: 9},
    {name: 'Obadiah',        abbr: 'Obad',  chapters: 1},
    {name: 'Jonah',          abbr: 'Jonah', chapters: 4},
    {name: 'Micah',          abbr: 'Mic',   chapters: 7},
    {name: 'Nahum',          abbr: 'Nah',   chapters: 3},
    {name: 'Habakkuk',       abbr: 'Hab',   chapters: 3},
    {name: 'Zephaniah',      abbr: 'Zeph',  chapters: 3},
    {name: 'Haggai',         abbr: 'Hag',   chapters: 2},
    {name: 'Zechariah',      abbr: 'Zech',  chapters: 14},
    {name: 'Malachi',        abbr: 'Mal',   chapters: 4},
    // New Testament
    {name: 'Matthew',        abbr: 'Matt',  chapters: 28},
    {name: 'Mark',           abbr: 'Mark',  chapters: 16},
    {name: 'Luke',           abbr: 'Luke',  chapters: 24},
    {name: 'John',           abbr: 'John',  chapters: 21},
    {name: 'Acts',           abbr: 'Acts',  chapters: 28},
    {name: 'Romans',         abbr: 'Rom',   chapters: 16},
    {name: '1 Corinthians',  abbr: '1Cor',  chapters: 16},
    {name: '2 Corinthians',  abbr: '2Cor',  chapters: 13},
    {name: 'Galatians',      abbr: 'Gal',   chapters: 6},
    {name: 'Ephesians',      abbr: 'Eph',   chapters: 6},
    {name: 'Philippians',    abbr: 'Phil',  chapters: 4},
    {name: 'Colossians',     abbr: 'Col',   chapters: 4},
    {name: '1 Thessalonians',abbr: '1Thess',chapters: 5},
    {name: '2 Thessalonians',abbr: '2Thess',chapters: 3},
    {name: '1 Timothy',      abbr: '1Tim',  chapters: 6},
    {name: '2 Timothy',      abbr: '2Tim',  chapters: 4},
    {name: 'Titus',          abbr: 'Titus', chapters: 3},
    {name: 'Philemon',       abbr: 'Phlm',  chapters: 1},
    {name: 'Hebrews',        abbr: 'Heb',   chapters: 13},
    {name: 'James',          abbr: 'Jas',   chapters: 5},
    {name: '1 Peter',        abbr: '1Pet',  chapters: 5},
    {name: '2 Peter',        abbr: '2Pet',  chapters: 3},
    {name: '1 John',         abbr: '1John', chapters: 5},
    {name: '2 John',         abbr: '2John', chapters: 1},
    {name: '3 John',         abbr: '3John', chapters: 1},
    {name: 'Jude',           abbr: 'Jude',  chapters: 1},
    {name: 'Revelation',     abbr: 'Rev',   chapters: 22},
];

// ─── Parse CLI args ───────────────────────────────────────────────────────────
let API_KEY = '';
const args = ARGV;
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--api-key' && args[i + 1]) {
        API_KEY = args[i + 1];
        i++;
    }
}

// ─── HTTP session (module-level singleton) ────────────────────────────────────
const httpSession = new Soup.Session();
httpSession.timeout = 20;
httpSession.user_agent = 'GnomeESVBibleBrowser/1.0';

function fetchPassage(reference, callback) {
    if (!API_KEY) {
        callback(null, 'No API key. Launch from the extension after setting your key in Preferences.');
        return;
    }
    const enc = GLib.uri_escape_string(reference, null, true);
    const url = `https://api.esv.org/v3/passage/text/?q=${enc}` +
                `&include-headings=true` +
                `&include-footnotes=false` +
                `&include-verse-numbers=true` +
                `&include-short-copyright=false` +
                `&include-passage-references=false`;

    const msg = Soup.Message.new('GET', url);
    msg.request_headers.append('Authorization', `Token ${API_KEY}`);

    httpSession.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (session, result) => {
        try {
            const bytes = session.send_and_read_finish(result);
            const status = msg.get_status();
            if (status === 401) { callback(null, 'Invalid API key.'); return; }
            if (status !== 200) { callback(null, `HTTP error ${status}`); return; }
            const body = new TextDecoder('utf-8').decode(bytes.get_data());
            const data = JSON.parse(body);
            const passages = data.passages ?? [];
            if (passages.length === 0) { callback(null, 'No passage found.'); return; }
            callback(passages[0].trim(), null);
        } catch (e) {
            callback(null, `Error: ${e.message}`);
        }
    });
}

// ─── Application ──────────────────────────────────────────────────────────────
const app = new Adw.Application({
    application_id: 'org.gnome.shell.extensions.esv-bible-verses.browser',
    flags: Gio.ApplicationFlags.FLAGS_NONE,
});

app.connect('activate', () => {
    // ── Window ──
    const win = new Adw.ApplicationWindow({
        application: app,
        title: 'ESV Bible Browser',
        default_width: 960,
        default_height: 680,
    });

    // ── Header bar ──
    const header = new Adw.HeaderBar();

    // Search entry in header
    const searchEntry = new Gtk.SearchEntry({
        placeholder_text: 'Jump to reference… (e.g. Romans 8)',
        width_chars: 28,
        valign: Gtk.Align.CENTER,
    });
    header.set_title_widget(searchEntry);

    // Copy button in header
    const copyBtn = new Gtk.Button({
        icon_name: 'edit-copy-symbolic',
        tooltip_text: 'Copy passage to clipboard',
        valign: Gtk.Align.CENTER,
    });
    header.pack_end(copyBtn);

    // Open-in-browser button
    const webBtn = new Gtk.Button({
        icon_name: 'web-browser-symbolic',
        tooltip_text: 'Open on ESV.org',
        valign: Gtk.Align.CENTER,
    });
    header.pack_end(webBtn);

    // ── Content: horizontal paned split ──
    // Left sidebar (book + chapter lists), right reading pane
    const outerBox = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});
    outerBox.append(header);

    const paned = new Gtk.Paned({
        orientation: Gtk.Orientation.HORIZONTAL,
        position: 220,
        wide_handle: false,
        vexpand: true,
    });
    outerBox.append(paned);

    // ── Left: book list + chapter list stacked ──
    const sidebarBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        width_request: 180,
    });

    // Book list
    const bookScroll = new Gtk.ScrolledWindow({
        hscrollbar_policy: Gtk.PolicyType.NEVER,
        vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        vexpand: true,
    });
    const bookListBox = new Gtk.ListBox({
        selection_mode: Gtk.SelectionMode.SINGLE,
        css_classes: ['navigation-sidebar'],
    });
    bookListBox.set_filter_func(null);
    bookScroll.set_child(bookListBox);

    // Populate books
    BIBLE_BOOKS.forEach((book, idx) => {
        const row = new Gtk.ListBoxRow();
        row._bookIndex = idx;
        const lbl = new Gtk.Label({
            label: book.name,
            xalign: 0,
            margin_start: 12,
            margin_end: 8,
            margin_top: 4,
            margin_bottom: 4,
        });
        row.set_child(lbl);
        bookListBox.append(row);
    });

    // Chapter list (revealed when a book is selected)
    const chapterReveal = new Gtk.Revealer({
        transition_type: Gtk.RevealerTransitionType.SLIDE_DOWN,
        reveal_child: false,
    });
    const chapterScroll = new Gtk.ScrolledWindow({
        hscrollbar_policy: Gtk.PolicyType.NEVER,
        vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        min_content_height: 140,
        max_content_height: 220,
    });
    const chapterListBox = new Gtk.ListBox({
        selection_mode: Gtk.SelectionMode.SINGLE,
        css_classes: ['navigation-sidebar'],
    });
    chapterScroll.set_child(chapterListBox);
    chapterReveal.set_child(chapterScroll);

    sidebarBox.append(bookScroll);
    sidebarBox.append(chapterReveal);
    paned.set_start_child(sidebarBox);

    // ── Right: reading pane ──
    const readingBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        vexpand: true,
        hexpand: true,
    });

    // Passage title bar
    const passageTitle = new Gtk.Label({
        label: 'Select a book and chapter',
        css_classes: ['title-2'],
        xalign: 0,
        margin_start: 20,
        margin_end: 20,
        margin_top: 16,
        margin_bottom: 8,
    });
    readingBox.append(passageTitle);

    // Separator
    readingBox.append(new Gtk.Separator({orientation: Gtk.Orientation.HORIZONTAL}));

    // Scrollable text area
    const textScroll = new Gtk.ScrolledWindow({
        hscrollbar_policy: Gtk.PolicyType.NEVER,
        vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        vexpand: true,
    });

    const passageText = new Gtk.TextView({
        editable: false,
        cursor_visible: false,
        wrap_mode: Gtk.WrapMode.WORD,
        top_margin: 16,
        bottom_margin: 24,
        left_margin: 20,
        right_margin: 20,
        css_classes: ['esv-reading-text'],
    });
    // Make font slightly larger for reading
    passageText.add_css_class('body');

    textScroll.set_child(passageText);
    readingBox.append(textScroll);

    // Loading spinner overlay
    const loadingBar = new Gtk.ProgressBar({
        pulse_step: 0.1,
        visible: false,
    });
    readingBox.append(loadingBar);

    paned.set_end_child(readingBox);

    // ── State ──
    let currentBook = null;
    let currentChapter = null;
    let pulseTimerId = null;

    function startLoading() {
        loadingBar.visible = true;
        loadingBar.fraction = 0;
        pulseTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
            loadingBar.pulse();
            return GLib.SOURCE_CONTINUE;
        });
    }

    function stopLoading() {
        if (pulseTimerId) {
            GLib.source_remove(pulseTimerId);
            pulseTimerId = null;
        }
        loadingBar.visible = false;
    }

    function loadChapter(book, chapter) {
        currentBook = book;
        currentChapter = chapter;
        const ref = `${book.name} ${chapter}`;
        passageTitle.label = ref;
        passageText.buffer.text = '';
        startLoading();

        fetchPassage(ref, (text, err) => {
            stopLoading();
            if (err) {
                passageText.buffer.text = `⚠ ${err}`;
            } else {
                passageText.buffer.text = text;
                // Scroll to top
                const iter = passageText.buffer.get_start_iter();
                passageText.buffer.place_cursor(iter);
                passageText.scroll_to_iter(iter, 0, false, 0, 0);
            }
        });
    }

    // ── Book selection handler ──
    bookListBox.connect('row-selected', (_lb, row) => {
        if (!row) return;
        const book = BIBLE_BOOKS[row._bookIndex];

        // Rebuild chapter list
        let child = chapterListBox.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            chapterListBox.remove(child);
            child = next;
        }

        for (let ch = 1; ch <= book.chapters; ch++) {
            const chRow = new Gtk.ListBoxRow();
            chRow._chapter = ch;
            const chLbl = new Gtk.Label({
                label: `Chapter ${ch}`,
                xalign: 0,
                margin_start: 16,
                margin_end: 8,
                margin_top: 3,
                margin_bottom: 3,
            });
            chRow.set_child(chLbl);
            chapterListBox.append(chRow);
        }

        chapterReveal.reveal_child = true;
        chapterListBox.unselect_all();

        // Auto-load chapter 1
        const firstRow = chapterListBox.get_row_at_index(0);
        if (firstRow) {
            chapterListBox.select_row(firstRow);
        }
    });

    // ── Chapter selection handler ──
    chapterListBox.connect('row-selected', (_lb, row) => {
        if (!row || !currentBook) return;
        loadChapter(currentBook, row._chapter);
    });

    // ── Search / jump handler ──
    searchEntry.connect('activate', () => {
        const query = searchEntry.get_text().trim();
        if (!query) return;
        passageTitle.label = query;
        passageText.buffer.text = '';
        startLoading();
        fetchPassage(query, (text, err) => {
            stopLoading();
            passageText.buffer.text = err ? `⚠ ${err}` : text;
            if (!err) {
                const iter = passageText.buffer.get_start_iter();
                passageText.buffer.place_cursor(iter);
                passageText.scroll_to_iter(iter, 0, false, 0, 0);
            }
        });
        searchEntry.set_text('');
    });

    // ── Copy button ──
    copyBtn.connect('clicked', () => {
        const text = passageText.buffer.text;
        if (!text) return;
        const ref = passageTitle.label;
        win.get_clipboard().set(`${text}\n\n— ${ref} (ESV)`);
        // Brief visual confirmation
        copyBtn.set_icon_name('object-select-symbolic');
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1200, () => {
            copyBtn.set_icon_name('edit-copy-symbolic');
            return GLib.SOURCE_REMOVE;
        });
    });

    // ── Open in browser ──
    webBtn.connect('clicked', () => {
        const ref = passageTitle.label;
        if (!ref || ref === 'Select a book and chapter') return;
        const enc = GLib.uri_escape_string(ref, null, true);
        Gio.AppInfo.launch_default_for_uri(`https://www.esv.org/verses/${enc}/`, null);
    });

    // ── CSS for reading text ──
    const cssProvider = new Gtk.CssProvider();
    cssProvider.load_from_string(`
        .esv-reading-text {
            font-size: 15px;
            line-height: 1.8;
        }
    `);
    Gtk.StyleContext.add_provider_for_display(
        win.get_display(),
        cssProvider,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
    );

    win.set_content(outerBox);
    win.present();
});

app.run([]);
