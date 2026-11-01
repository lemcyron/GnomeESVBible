#!/usr/bin/env gjs
// ─────────────────────────────────────────────────────────────────────────────
// bible-browser.js — ESV Bible Browser (GTK4 / Adwaita, 3-column layout)
//
// Standalone GJS script (NOT ESM -m mode) so it can be launched directly:
//   ESV_API_KEY=token gjs /path/to/bible-browser.js
//
// The extension spawns it via Gio.SubprocessLauncher with ESV_API_KEY in the environment.
// ─────────────────────────────────────────────────────────────────────────────

// Legacy imports.gi — works with plain `gjs`, no -m flag needed
// Versions MUST be set before the libraries are imported.
imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Adw = '1';
imports.gi.versions.Soup = '3.0';

const { GLib, Gio, GObject } = imports.gi;
const Gtk = imports.gi.Gtk;
const Adw = imports.gi.Adw;
const Soup = imports.gi.Soup;

// ─── Bible books ─────────────────────────────────────────────────────────────
const BIBLE_BOOKS = [
    {name: 'Genesis',         chapters: 50},
    {name: 'Exodus',          chapters: 40},
    {name: 'Leviticus',       chapters: 27},
    {name: 'Numbers',         chapters: 36},
    {name: 'Deuteronomy',     chapters: 34},
    {name: 'Joshua',          chapters: 24},
    {name: 'Judges',          chapters: 21},
    {name: 'Ruth',            chapters: 4},
    {name: '1 Samuel',        chapters: 31},
    {name: '2 Samuel',        chapters: 24},
    {name: '1 Kings',         chapters: 22},
    {name: '2 Kings',         chapters: 25},
    {name: '1 Chronicles',    chapters: 29},
    {name: '2 Chronicles',    chapters: 36},
    {name: 'Ezra',            chapters: 10},
    {name: 'Nehemiah',        chapters: 13},
    {name: 'Esther',          chapters: 10},
    {name: 'Job',             chapters: 42},
    {name: 'Psalms',          chapters: 150},
    {name: 'Proverbs',        chapters: 31},
    {name: 'Ecclesiastes',    chapters: 12},
    {name: 'Song of Solomon', chapters: 8},
    {name: 'Isaiah',          chapters: 66},
    {name: 'Jeremiah',        chapters: 52},
    {name: 'Lamentations',    chapters: 5},
    {name: 'Ezekiel',         chapters: 48},
    {name: 'Daniel',          chapters: 12},
    {name: 'Hosea',           chapters: 14},
    {name: 'Joel',            chapters: 3},
    {name: 'Amos',            chapters: 9},
    {name: 'Obadiah',         chapters: 1},
    {name: 'Jonah',           chapters: 4},
    {name: 'Micah',           chapters: 7},
    {name: 'Nahum',           chapters: 3},
    {name: 'Habakkuk',        chapters: 3},
    {name: 'Zephaniah',       chapters: 3},
    {name: 'Haggai',          chapters: 2},
    {name: 'Zechariah',       chapters: 14},
    {name: 'Malachi',         chapters: 4},
    {name: 'Matthew',         chapters: 28},
    {name: 'Mark',            chapters: 16},
    {name: 'Luke',            chapters: 24},
    {name: 'John',            chapters: 21},
    {name: 'Acts',            chapters: 28},
    {name: 'Romans',          chapters: 16},
    {name: '1 Corinthians',   chapters: 16},
    {name: '2 Corinthians',   chapters: 13},
    {name: 'Galatians',       chapters: 6},
    {name: 'Ephesians',       chapters: 6},
    {name: 'Philippians',     chapters: 4},
    {name: 'Colossians',      chapters: 4},
    {name: '1 Thessalonians', chapters: 5},
    {name: '2 Thessalonians', chapters: 3},
    {name: '1 Timothy',       chapters: 6},
    {name: '2 Timothy',       chapters: 4},
    {name: 'Titus',           chapters: 3},
    {name: 'Philemon',        chapters: 1},
    {name: 'Hebrews',         chapters: 13},
    {name: 'James',           chapters: 5},
    {name: '1 Peter',         chapters: 5},
    {name: '2 Peter',         chapters: 3},
    {name: '1 John',          chapters: 5},
    {name: '2 John',          chapters: 1},
    {name: '3 John',          chapters: 1},
    {name: 'Jude',            chapters: 1},
    {name: 'Revelation',      chapters: 22},
];

// ─── API key from environment ─────────────────────────────────────────────────
const API_KEY = GLib.getenv('ESV_API_KEY') || '';

// ─── HTTP session ─────────────────────────────────────────────────────────────
const httpSession = new Soup.Session();
httpSession.timeout = 20;

function fetchPassage(reference, callback) {
    if (!API_KEY) {
        callback(null, 'No API key. Set it in the extension Preferences then reopen.');
        return;
    }
    const enc = GLib.uri_escape_string(reference.trim(), null, true);
    const url = `https://api.esv.org/v3/passage/text/?q=${enc}` +
                `&include-headings=false&include-footnotes=false` +
                `&include-verse-numbers=true&include-short-copyright=false` +
                `&include-passage-references=false`;

    const msg = Soup.Message.new('GET', url);
    msg.request_headers.append('Authorization', `Token ${API_KEY.trim()}`);

    httpSession.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (session, result) => {
        try {
            const bytes = session.send_and_read_finish(result);
            const status = msg.get_status();
            if (status === 401) { callback(null, 'Invalid API key (401).'); return; }
            if (status !== 200) { callback(null, `HTTP error ${status}`); return; }
            const body = new TextDecoder('utf-8').decode(bytes.get_data());
            const data = JSON.parse(body);
            const passages = data.passages || [];
            if (!passages.length) { callback(null, 'No passage returned.'); return; }
            callback(passages[0].trim(), null);
        } catch (e) {
            callback(null, `Error: ${e.message}`);
        }
    });
}

// ─── Bookmarks (persisted as JSON in the user's config dir) ──────────────────
const BOOKMARKS_DIR  = GLib.build_filenamev([GLib.get_user_config_dir(), 'esv-bible-verses']);
const BOOKMARKS_PATH = GLib.build_filenamev([BOOKMARKS_DIR, 'bookmarks.json']);

function bookmarkKey(bm) { return `${bm.book}|${bm.chapter}|${bm.verse}`; }

function sortBookmarks(list) {
    const idx = name => BIBLE_BOOKS.findIndex(b => b.name === name);
    return list.sort((a, b) =>
        idx(a.book) - idx(b.book) || a.chapter - b.chapter || a.verse - b.verse);
}

function loadBookmarks() {
    try {
        const [ok, bytes] = GLib.file_get_contents(BOOKMARKS_PATH);
        if (!ok) return [];
        const data = JSON.parse(new TextDecoder('utf-8').decode(bytes));
        if (!Array.isArray(data)) return [];
        const seen = new Set();
        const valid = [];
        for (const bm of data) {
            const book = BIBLE_BOOKS.find(b => b.name === bm?.book);
            if (!book || !Number.isInteger(bm.chapter) || !Number.isInteger(bm.verse)) continue;
            if (bm.chapter < 1 || bm.chapter > book.chapters || bm.verse < 1) continue;
            const clean = {book: book.name, chapter: bm.chapter, verse: bm.verse};
            if (seen.has(bookmarkKey(clean))) continue;
            seen.add(bookmarkKey(clean));
            valid.push(clean);
        }
        return sortBookmarks(valid);
    } catch (e) {
        return [];   // missing or unreadable file → start empty
    }
}

function saveBookmarks(list) {
    try {
        GLib.mkdir_with_parents(BOOKMARKS_DIR, 0o700);
        GLib.file_set_contents(BOOKMARKS_PATH, new TextEncoder().encode(JSON.stringify(list)));
    } catch (e) {
        printerr(`[ESVBible] Could not save bookmarks: ${e.message}`);
    }
}

// Parse a single-chapter reference ("John 3", "Psalm 23:1-6") into {bookIdx, chapter}.
// Returns null for anything that spans chapters or can't be matched to a book.
function parseRef(ref) {
    const m = ref.trim().match(/^(.+?)\s+(\d+)(?::[\d,\s\-–]+)?$/);
    if (!m) return null;
    const name = m[1].trim().toLowerCase();
    const bookIdx = BIBLE_BOOKS.findIndex(b =>
        b.name.toLowerCase() === name || (name === 'psalm' && b.name === 'Psalms'));
    if (bookIdx < 0) return null;
    const chapter = parseInt(m[2], 10);
    if (chapter < 1 || chapter > BIBLE_BOOKS[bookIdx].chapters) return null;
    return {bookIdx, chapter};
}

// ─── Parse verse-numbered text into [{num, text}] ────────────────────────────
function parseVerses(raw) {
    const verses = [];
    const parts = raw.split(/(?=\[\d+\])/);
    for (const part of parts) {
        const t = part.trim();
        if (!t) continue;
        const m = t.match(/^\[(\d+)\]\s*([\s\S]+)$/);
        if (m) verses.push({num: m[1], text: m[2].replace(/\s+/g, ' ').trim()});
        else   verses.push({num: '',   text: t.replace(/\s+/g, ' ')});
    }
    return verses;
}

// ─── Application ──────────────────────────────────────────────────────────────
Gtk.init();
Adw.init();

const app = new Adw.Application({
    application_id: 'org.gnome.shell.extensions.esv_bible_browser',
    flags: Gio.ApplicationFlags.FLAGS_NONE,
});

app.connect('activate', () => {
    const win = new Adw.ApplicationWindow({
        application: app,
        title: 'ESV Bible Browser',
        default_width: 1100,
        default_height: 720,
    });

    // ── CSS ──────────────────────────────────────────────────────────────────
    const css = new Gtk.CssProvider();
    css.load_from_string(`
        .esv-col { border-right: 1px solid rgba(128,128,128,0.25); }
        .esv-bm-col { border-left: 1px solid rgba(128,128,128,0.25); }
        .esv-col-header { font-weight: bold; font-size: 0.8em; padding: 8px 12px 6px 12px; opacity: 0.6; }
        .esv-col listbox row:selected { background-color: #7e3ebe; color: #ffffff; }
        .esv-col listbox row:selected label { color: #ffffff; }
        .esv-verse-list row.esv-verse-row:hover { background-color: rgba(126,62,190,0.12); }
        .esv-verse-list row.esv-verse-row:selected { background-color: #7e3ebe; }
        .esv-verse-list row.esv-verse-row:selected label { color: #ffffff; }
        .esv-verse-num { font-size: 0.78em; font-weight: bold; color: #7e3ebe; min-width: 22px; margin-top: 2px; }
        .esv-verse-list row:selected .esv-verse-num { color: rgba(255,255,255,0.8); }
        .esv-verse-text-lbl { font-size: 14px; }
        .esv-copied-badge { font-size: 0.78em; color: #7e3ebe; font-weight: bold; margin-left: 4px; }
        .esv-verse-list row:selected .esv-copied-badge { color: rgba(255,255,255,0.85); }
        progressbar trough progress { background-color: #7e3ebe; }
    `);
    Gtk.StyleContext.add_provider_for_display(
        win.get_display(),
        css,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
    );

    // ── Header ───────────────────────────────────────────────────────────────
    const header = new Adw.HeaderBar();
    const searchEntry = new Gtk.SearchEntry({
        placeholder_text: 'Jump to reference… e.g. "Romans 8"',
        width_chars: 30,
        valign: Gtk.Align.CENTER,
    });
    header.set_title_widget(searchEntry);

    const copyBtn = new Gtk.Button({icon_name: 'edit-copy-symbolic', tooltip_text: 'Copy chapter', valign: Gtk.Align.CENTER});
    const webBtn  = new Gtk.Button({icon_name: 'web-browser-symbolic', tooltip_text: 'Open on ESV.org', valign: Gtk.Align.CENTER});
    header.pack_end(copyBtn);
    header.pack_end(webBtn);

    // ── Root ─────────────────────────────────────────────────────────────────
    const rootBox = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});
    rootBox.append(header);

    // Homogeneous 20-unit grid → columns are exactly 20% / 15% / 50% / 15% of the window.
    const colsBox = new Gtk.Grid({column_homogeneous: true, vexpand: true, hexpand: true});
    rootBox.append(colsBox);

    // ── Column helper ────────────────────────────────────────────────────────
    function makeCol(title) {
        const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, hexpand: true, vexpand: true, css_classes: ['esv-col']});
        box.append(new Gtk.Label({label: title.toUpperCase(), xalign: 0, css_classes: ['esv-col-header']}));
        box.append(new Gtk.Separator({orientation: Gtk.Orientation.HORIZONTAL}));
        const scroll = new Gtk.ScrolledWindow({hscrollbar_policy: Gtk.PolicyType.NEVER, vscrollbar_policy: Gtk.PolicyType.AUTOMATIC, vexpand: true, hexpand: true});
        const list = new Gtk.ListBox({selection_mode: Gtk.SelectionMode.SINGLE, css_classes: ['navigation-sidebar']});
        scroll.set_child(list);
        box.append(scroll);
        return {box, list};
    }

    // ── Col 1: Books (20%) ───────────────────────────────────────────────────
    const {box: bookBox, list: bookList} = makeCol('Books');
    colsBox.attach(bookBox, 0, 0, 4, 1);
    BIBLE_BOOKS.forEach((book, idx) => {
        const row = new Gtk.ListBoxRow({activatable: true});
        row._bookIdx = idx;
        row.set_child(new Gtk.Label({label: book.name, xalign: 0, margin_start: 12, margin_end: 8, margin_top: 5, margin_bottom: 5}));
        bookList.append(row);
    });

    // ── Col 2: Chapters (15%) ────────────────────────────────────────────────
    const {box: chapBox, list: chapList} = makeCol('Chapters');
    colsBox.attach(chapBox, 4, 0, 3, 1);

    // ── Col 3: Verses (50%) ──────────────────────────────────────────────────
    const readBox = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, vexpand: true, hexpand: true});
    colsBox.attach(readBox, 7, 0, 10, 1);

    // ── Col 4: Bookmarks (15%) ───────────────────────────────────────────────
    const {box: bmBox, list: bmList} = makeCol('Bookmarks');
    bmBox.remove_css_class('esv-col');   // rightmost column: border on the left instead
    bmBox.add_css_class('esv-bm-col');
    bmList.set_selection_mode(Gtk.SelectionMode.NONE);
    colsBox.attach(bmBox, 17, 0, 3, 1);

    const titleLbl = new Gtk.Label({label: 'Select a book and chapter', css_classes: ['title-3'], xalign: 0, ellipsize: 3, margin_start: 20, margin_end: 20, margin_top: 14, margin_bottom: 10});
    readBox.append(titleLbl);
    readBox.append(new Gtk.Separator({orientation: Gtk.Orientation.HORIZONTAL}));

    const verseScroll = new Gtk.ScrolledWindow({hscrollbar_policy: Gtk.PolicyType.NEVER, vscrollbar_policy: Gtk.PolicyType.AUTOMATIC, vexpand: true, hexpand: true});
    const verseList = new Gtk.ListBox({selection_mode: Gtk.SelectionMode.SINGLE, css_classes: ['esv-verse-list']});
    verseList.set_show_separators(true);
    verseScroll.set_child(verseList);
    readBox.append(verseScroll);

    const loadingBar = new Gtk.ProgressBar({visible: false, pulse_step: 0.08});
    readBox.append(loadingBar);

    // ── State ────────────────────────────────────────────────────────────────
    let selectedBook = null;
    let pulseId = null;
    let currentVerses = [];
    let suppressChapterLoad = false;
    let bookmarks = loadBookmarks();

    function isBookmarked(bm) { return bookmarks.some(b => bookmarkKey(b) === bookmarkKey(bm)); }

    function refreshStars() {
        let c = verseList.get_first_child();
        while (c) {
            if (c._starBtn) c._starBtn.set_icon_name(isBookmarked(c._bm) ? 'starred-symbolic' : 'non-starred-symbolic');
            c = c.get_next_sibling();
        }
    }

    function removeBookmark(bm) {
        bookmarks = bookmarks.filter(b => bookmarkKey(b) !== bookmarkKey(bm));
        saveBookmarks(bookmarks);
        rebuildBookmarks();
        refreshStars();
    }

    function toggleBookmark(bm) {
        if (isBookmarked(bm)) { removeBookmark(bm); return; }
        bookmarks = sortBookmarks([...bookmarks, bm]);
        saveBookmarks(bookmarks);
        rebuildBookmarks();
        refreshStars();
    }

    function rebuildBookmarks() {
        let c = bmList.get_first_child();
        while (c) { const n = c.get_next_sibling(); bmList.remove(c); c = n; }
        bookmarks.forEach(bm => {
            const row = new Gtk.ListBoxRow({activatable: true});
            row._bm = bm;
            const box = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 4, margin_start: 12, margin_end: 4, margin_top: 2, margin_bottom: 2});
            box.append(new Gtk.Label({label: `${bm.book} ${bm.chapter}:${bm.verse}`, xalign: 0, hexpand: true, ellipsize: 3}));
            const rm = new Gtk.Button({icon_name: 'window-close-symbolic', tooltip_text: 'Remove bookmark', css_classes: ['flat', 'circular'], valign: Gtk.Align.CENTER});
            rm.connect('clicked', () => removeBookmark(bm));
            box.append(rm);
            row.set_child(box);
            bmList.append(row);
        });
    }

    function clearList() {
        let c = verseList.get_first_child();
        while (c) { const n = c.get_next_sibling(); verseList.remove(c); c = n; }
        currentVerses = [];
    }

    function startLoading() {
        clearList();
        loadingBar.visible = true;
        pulseId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => { loadingBar.pulse(); return GLib.SOURCE_CONTINUE; });
    }

    function stopLoading() {
        if (pulseId !== null) { GLib.source_remove(pulseId); pulseId = null; }
        loadingBar.visible = false;
    }

    function showError(msg) {
        clearList();
        const row = new Gtk.ListBoxRow({activatable: false, selectable: false});
        row.set_child(new Gtk.Label({label: `⚠  ${msg}`, wrap: true, xalign: 0, margin_start: 20, margin_end: 20, margin_top: 16, margin_bottom: 16}));
        verseList.append(row);
    }

    function populateVerses(verses, ref) {
        clearList();
        currentVerses = verses;
        if (!verses.length) { showError('No verses found.'); return; }
        const parsed = parseRef(ref);
        verses.forEach(verse => {
            const row = new Gtk.ListBoxRow({activatable: true, selectable: true, css_classes: ['esv-verse-row']});
            row._verseNum  = verse.num;
            row._verseText = verse.text;
            row._reference = ref;

            const box = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, margin_start: 16, margin_end: 16, margin_top: 8, margin_bottom: 8, spacing: 10});
            if (verse.num) {
                box.append(new Gtk.Label({label: verse.num, css_classes: ['esv-verse-num'], valign: Gtk.Align.START, width_chars: 3, xalign: 1}));
            }
            box.append(new Gtk.Label({label: verse.text, wrap: true, wrap_mode: 2, xalign: 0, hexpand: true, selectable: false, css_classes: ['esv-verse-text-lbl']}));
            const badge = new Gtk.Label({label: '✓ Copied', css_classes: ['esv-copied-badge'], visible: false, valign: Gtk.Align.CENTER});
            box.append(badge);
            row._badge = badge;
            if (parsed && verse.num) {
                const bm = {book: BIBLE_BOOKS[parsed.bookIdx].name, chapter: parsed.chapter, verse: parseInt(verse.num, 10)};
                const star = new Gtk.Button({
                    icon_name: isBookmarked(bm) ? 'starred-symbolic' : 'non-starred-symbolic',
                    tooltip_text: 'Bookmark verse',
                    css_classes: ['flat', 'circular'],
                    valign: Gtk.Align.START,
                });
                star.connect('clicked', () => toggleBookmark(bm));
                box.append(star);
                row._bm = bm;
                row._starBtn = star;
            }
            row.set_child(box);
            verseList.append(row);
        });
    }

    // Select (and scroll to) a verse in the current passage.
    function selectVerse(num) {
        let c = verseList.get_first_child();
        while (c) {
            if (c._verseNum === num) {
                verseList.select_row(c);
                c.grab_focus();
                return;
            }
            c = c.get_next_sibling();
        }
    }

    function selectVerseSoon(num) {
        // Wait for layout so the row can be scrolled into view.
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => { selectVerse(num); return GLib.SOURCE_REMOVE; });
    }

    function loadPassage(ref, focusVerse = null) {
        titleLbl.label = ref;
        startLoading();
        fetchPassage(ref, (text, err) => {
            stopLoading();
            if (err) { showError(err); return; }
            populateVerses(parseVerses(text), ref);
            verseScroll.get_vadjustment().set_value(0);
            if (focusVerse) selectVerseSoon(focusVerse);
        });
    }

    // ── Bookmark → navigate to verse ─────────────────────────────────────────
    function goToBookmark(bm) {
        const bookIdx = BIBLE_BOOKS.findIndex(b => b.name === bm.book);
        if (bookIdx < 0) return;
        const ref = `${bm.book} ${bm.chapter}`;
        const verse = String(bm.verse);

        // Sync the book/chapter columns without triggering extra fetches.
        suppressChapterLoad = true;
        bookList.select_row(bookList.get_row_at_index(bookIdx));
        chapList.select_row(chapList.get_row_at_index(bm.chapter - 1));
        suppressChapterLoad = false;

        if (titleLbl.label === ref && currentVerses.length) selectVerseSoon(verse);
        else loadPassage(ref, verse);
    }

    bmList.connect('row-activated', (_lb, row) => { if (row._bm) goToBookmark(row._bm); });
    rebuildBookmarks();

    // ── Click verse → copy ───────────────────────────────────────────────────
    verseList.connect('row-activated', (_lb, row) => {
        if (!row._verseText) return;
        const ref = row._verseNum ? `${row._reference}:${row._verseNum}` : row._reference;
        win.get_clipboard().set_text(`${row._verseText} — ${ref} (ESV)`);
        if (row._badge) {
            row._badge.visible = true;
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1600, () => { row._badge.visible = false; return GLib.SOURCE_REMOVE; });
        }
    });

    // ── Book → Chapters ──────────────────────────────────────────────────────
    bookList.connect('row-selected', (_lb, row) => {
        if (!row) return;
        selectedBook = BIBLE_BOOKS[row._bookIdx];
        let c = chapList.get_first_child();
        while (c) { const n = c.get_next_sibling(); chapList.remove(c); c = n; }
        for (let ch = 1; ch <= selectedBook.chapters; ch++) {
            const r = new Gtk.ListBoxRow({activatable: true});
            r._chapter = ch;
            r.set_child(new Gtk.Label({label: `${ch}`, xalign: 0, margin_start: 16, margin_end: 8, margin_top: 5, margin_bottom: 5}));
            chapList.append(r);
        }
        const first = chapList.get_row_at_index(0);
        if (first) chapList.select_row(first);
    });

    // ── Chapter → Verses ─────────────────────────────────────────────────────
    chapList.connect('row-selected', (_lb, row) => {
        if (suppressChapterLoad || !row || !selectedBook) return;
        loadPassage(`${selectedBook.name} ${row._chapter}`);
    });

    // ── Search ───────────────────────────────────────────────────────────────
    searchEntry.connect('activate', () => {
        const q = searchEntry.get_text().trim();
        if (!q) return;
        searchEntry.set_text('');
        loadPassage(q);
    });

    // ── Copy chapter button ───────────────────────────────────────────────────
    copyBtn.connect('clicked', () => {
        if (!currentVerses.length) return;
        const full = currentVerses.map(v => v.num ? `[${v.num}] ${v.text}` : v.text).join('\n');
        win.get_clipboard().set_text(`${full}\n\n— ${titleLbl.label} (ESV)`);
        copyBtn.set_icon_name('object-select-symbolic');
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1400, () => { copyBtn.set_icon_name('edit-copy-symbolic'); return GLib.SOURCE_REMOVE; });
    });

    // ── Open on ESV.org ───────────────────────────────────────────────────────
    webBtn.connect('clicked', () => {
        const ref = titleLbl.label;
        if (ref === 'Select a book and chapter') return;
        Gio.AppInfo.launch_default_for_uri(`https://www.esv.org/verses/${GLib.uri_escape_string(ref, null, true)}/`, null);
    });

    win.set_content(rootBox);
    win.present();
});

app.run(ARGV);
