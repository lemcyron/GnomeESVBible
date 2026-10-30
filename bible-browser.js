#!/usr/bin/env -S gjs -m
// ─────────────────────────────────────────────────────────────────────────────
// bible-browser.js — ESV Bible Browser (GTK4 / Adwaita, 3-column layout)
//
// Launched by the GNOME Shell extension:
//   gjs -m /path/to/bible-browser.js --api-key TOKEN
// ─────────────────────────────────────────────────────────────────────────────

import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

// ─── Bible books (canonical order, correct chapter counts) ───────────────────
const BIBLE_BOOKS = [
    // Old Testament
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
    // New Testament
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

// ─── CLI args: read from the environment variable set by the extension ────────
// GJS ESM mode: ARGV is not available. The extension sets ESV_API_KEY env var.
const API_KEY = GLib.getenv('ESV_API_KEY') ?? '';

// ─── HTTP session ─────────────────────────────────────────────────────────────
const httpSession = new Soup.Session();
httpSession.timeout = 20;
httpSession.user_agent = 'GnomeESVBibleBrowser/1.0';

function fetchPassage(reference, callback) {
    if (!API_KEY || API_KEY.trim() === '') {
        callback(null, 'No API key found.\nSet your key in the extension Preferences, then reopen Bible Browser.');
        return;
    }
    const enc = GLib.uri_escape_string(reference.trim(), null, true);
    const url =
        `https://api.esv.org/v3/passage/text/?q=${enc}` +
        `&include-headings=false` +
        `&include-footnotes=false` +
        `&include-verse-numbers=true` +
        `&include-short-copyright=false` +
        `&include-passage-references=false`;

    const msg = Soup.Message.new('GET', url);
    msg.request_headers.append('Authorization', `Token ${API_KEY.trim()}`);

    httpSession.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (session, result) => {
        try {
            const bytes = session.send_and_read_finish(result);
            const status = msg.get_status();
            if (status === 401) { callback(null, 'Invalid API key (401). Check Preferences.'); return; }
            if (status !== 200) { callback(null, `HTTP error ${status}`); return; }
            const body = new TextDecoder('utf-8').decode(bytes.get_data());
            const data = JSON.parse(body);
            const passages = data.passages ?? [];
            if (passages.length === 0) { callback(null, 'No passage returned by the API.'); return; }
            callback(passages[0].trim(), null);
        } catch (e) {
            callback(null, `Parse error: ${e.message}`);
        }
    });
}

// ─── Application ──────────────────────────────────────────────────────────────
const app = new Adw.Application({
    application_id: 'org.gnome.shell.extensions.esv_bible_verses.browser',
    flags: Gio.ApplicationFlags.FLAGS_NONE,
});

app.connect('activate', () => {

    // ── Window ──────────────────────────────────────────────────────────────
    const win = new Adw.ApplicationWindow({
        application: app,
        title: 'ESV Bible Browser',
        default_width: 1100,
        default_height: 720,
    });

    // Apply CSS to this window's display
    const css2 = new Gtk.CssProvider();
    css2.load_from_string(`
        /* Purple selection highlight on book/chapter columns */
        .esv-col listbox row:selected,
        .esv-col listbox row:selected:focus {
            background-color: #7e3ebe;
            color: #ffffff;
        }
        .esv-col listbox row:selected label,
        .esv-col listbox row:selected:focus label {
            color: #ffffff;
        }

        /* Column header labels */
        .esv-col-header {
            font-weight: bold;
            font-size: 0.8em;
            padding: 8px 12px 6px 12px;
            opacity: 0.6;
        }

        /* Vertical separator between columns */
        .esv-col {
            border-right: 1px solid rgba(128,128,128,0.25);
        }

        /* Verse rows — hover tint */
        .esv-verse-list row.esv-verse-row:hover {
            background-color: rgba(126,62,190,0.12);
        }

        /* Purple selection on verse rows */
        .esv-verse-list row.esv-verse-row:selected,
        .esv-verse-list row.esv-verse-row:selected:focus {
            background-color: #7e3ebe;
        }
        .esv-verse-list row.esv-verse-row:selected label,
        .esv-verse-list row.esv-verse-row:selected:focus label {
            color: #ffffff;
        }

        /* Verse number badge */
        .esv-verse-num {
            font-size: 0.78em;
            font-weight: bold;
            color: #7e3ebe;
            min-width: 22px;
            margin-top: 2px;
        }
        .esv-verse-list row:selected .esv-verse-num {
            color: rgba(255,255,255,0.8);
        }

        /* Verse text */
        .esv-verse-text-lbl {
            font-size: 14px;
        }

        /* "✓ Copied" transient badge */
        .esv-copied-badge {
            font-size: 0.78em;
            color: #7e3ebe;
            font-weight: bold;
            margin-left: 4px;
        }
        .esv-verse-list row:selected .esv-copied-badge {
            color: rgba(255,255,255,0.85);
        }

        /* Progress bar */
        progressbar trough progress {
            background-color: #7e3ebe;
        }
    `);
    Gtk.style_context_add_provider_for_display(
        win.get_display(),
        css2,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
    );

    // ── Header bar ──────────────────────────────────────────────────────────
    const header = new Adw.HeaderBar();

    const searchEntry = new Gtk.SearchEntry({
        placeholder_text: 'Jump to reference… e.g. "Romans 8"',
        width_chars: 30,
        valign: Gtk.Align.CENTER,
    });
    header.set_title_widget(searchEntry);

    const copyBtn = new Gtk.Button({
        icon_name: 'edit-copy-symbolic',
        tooltip_text: 'Copy passage to clipboard',
        valign: Gtk.Align.CENTER,
    });
    header.pack_end(copyBtn);

    const webBtn = new Gtk.Button({
        icon_name: 'web-browser-symbolic',
        tooltip_text: 'Open on ESV.org',
        valign: Gtk.Align.CENTER,
    });
    header.pack_end(webBtn);

    // ── Root layout: header + 3-column row ──────────────────────────────────
    const rootBox = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});
    rootBox.append(header);

    const columnsBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        vexpand: true,
        hexpand: true,
    });
    rootBox.append(columnsBox);

    // ── Helper: make a labelled scrollable column ────────────────────────────
    function makeColumn(headerText, widthRequest) {
        const colBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            width_request: widthRequest,
            css_classes: ['esv-col'],
        });
        const lbl = new Gtk.Label({
            label: headerText.toUpperCase(),
            xalign: 0,
            css_classes: ['esv-col-header'],
        });
        colBox.append(lbl);
        colBox.append(new Gtk.Separator({orientation: Gtk.Orientation.HORIZONTAL}));
        const scroll = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            vexpand: true,
            hexpand: true,
        });
        const listBox = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.SINGLE,
            css_classes: ['navigation-sidebar'],
        });
        scroll.set_child(listBox);
        colBox.append(scroll);
        return {colBox, listBox, scroll};
    }

    // ── Column 1: Books ──────────────────────────────────────────────────────
    const {colBox: bookColBox, listBox: bookList} = makeColumn('Books', 190);
    columnsBox.append(bookColBox);

    BIBLE_BOOKS.forEach((book, idx) => {
        const row = new Gtk.ListBoxRow({activatable: true});
        row._bookIdx = idx;
        const lbl = new Gtk.Label({
            label: book.name,
            xalign: 0,
            margin_start: 12,
            margin_end: 8,
            margin_top: 5,
            margin_bottom: 5,
        });
        row.set_child(lbl);
        bookList.append(row);
    });

    // ── Column 2: Chapters ───────────────────────────────────────────────────
    const {colBox: chapColBox, listBox: chapList} = makeColumn('Chapters', 130);
    columnsBox.append(chapColBox);

    // ── Column 3: Verses (clickable list) ───────────────────────────────────
    const readingColBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        vexpand: true,
        hexpand: true,
    });
    columnsBox.append(readingColBox);

    const passageTitle = new Gtk.Label({
        label: 'Select a book and chapter',
        css_classes: ['title-3'],
        xalign: 0,
        margin_start: 20,
        margin_end: 20,
        margin_top: 14,
        margin_bottom: 10,
    });
    readingColBox.append(passageTitle);
    readingColBox.append(new Gtk.Separator({orientation: Gtk.Orientation.HORIZONTAL}));

    // Scrollable verse list — each verse is a clickable row
    const verseScroll = new Gtk.ScrolledWindow({
        hscrollbar_policy: Gtk.PolicyType.NEVER,
        vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        vexpand: true,
        hexpand: true,
    });
    const verseList = new Gtk.ListBox({
        selection_mode: Gtk.SelectionMode.SINGLE,
        css_classes: ['esv-verse-list'],
    });
    verseList.set_show_separators(true);
    verseScroll.set_child(verseList);
    readingColBox.append(verseScroll);

    const loadingBar = new Gtk.ProgressBar({visible: false, pulse_step: 0.08});
    readingColBox.append(loadingBar);

    // ── State ────────────────────────────────────────────────────────────────
    let selectedBook = null;
    let pulseId = null;
    // Stores all verses of the current chapter as {num, text} for copyBtn
    let currentVerses = [];

    // Parse ESV API plain text (verse-numbers=true) into individual verse objects.
    // The API returns text like: "[1] In the beginning... [2] The earth was..."
    function parseVerses(rawText) {
        const verses = [];
        // Split on verse number markers like "[1]", "[12]" etc.
        const parts = rawText.split(/(?=\[\d+\])/);
        for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            const match = trimmed.match(/^\[(\d+)\]\s*([\s\S]+)$/);
            if (match) {
                verses.push({num: match[1], text: match[2].replace(/\s+/g, ' ').trim()});
            } else {
                // Unnumbered leading text (e.g. psalm superscriptions)
                verses.push({num: '', text: trimmed.replace(/\s+/g, ' ')});
            }
        }
        return verses;
    }

    function clearVerseList() {
        let child = verseList.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            verseList.remove(child);
            child = next;
        }
        currentVerses = [];
    }

    function populateVerses(verses, reference) {
        clearVerseList();
        currentVerses = verses;

        if (verses.length === 0) {
            const row = new Gtk.ListBoxRow({activatable: false, selectable: false});
            row.set_child(new Gtk.Label({
                label: '⚠  No verses found.',
                xalign: 0,
                margin_start: 20,
                margin_top: 12,
                margin_bottom: 12,
            }));
            verseList.append(row);
            return;
        }

        verses.forEach((verse) => {
            const row = new Gtk.ListBoxRow({
                activatable: true,
                selectable: true,
                css_classes: ['esv-verse-row'],
            });
            row._verseNum  = verse.num;
            row._verseText = verse.text;
            row._reference = reference;

            const rowBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                margin_start: 16,
                margin_end: 16,
                margin_top: 8,
                margin_bottom: 8,
                spacing: 10,
            });

            if (verse.num) {
                const numLbl = new Gtk.Label({
                    label: verse.num,
                    css_classes: ['esv-verse-num'],
                    valign: Gtk.Align.START,
                    yalign: 0,
                    width_chars: 3,
                    xalign: 1,
                });
                rowBox.append(numLbl);
            }

            const textLbl = new Gtk.Label({
                label: verse.text,
                wrap: true,
                wrap_mode: 2, // WORD_CHAR
                xalign: 0,
                hexpand: true,
                selectable: false,
                css_classes: ['esv-verse-text-lbl'],
            });
            rowBox.append(textLbl);

            // Clipboard feedback label (hidden until clicked)
            const copiedLbl = new Gtk.Label({
                label: '✓ Copied',
                css_classes: ['esv-copied-badge'],
                visible: false,
                valign: Gtk.Align.CENTER,
            });
            rowBox.append(copiedLbl);

            row.set_child(rowBox);
            verseList.append(row);
        });
    }

    function showError(msg) {
        clearVerseList();
        const row = new Gtk.ListBoxRow({activatable: false, selectable: false});
        row.set_child(new Gtk.Label({
            label: `⚠  ${msg}`,
            wrap: true,
            xalign: 0,
            margin_start: 20,
            margin_end: 20,
            margin_top: 16,
            margin_bottom: 16,
        }));
        verseList.append(row);
    }

    function startLoading() {
        clearVerseList();
        loadingBar.visible = true;
        pulseId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
            loadingBar.pulse();
            return GLib.SOURCE_CONTINUE;
        });
    }

    function stopLoading() {
        if (pulseId !== null) { GLib.source_remove(pulseId); pulseId = null; }
        loadingBar.visible = false;
    }

    function loadPassage(reference) {
        passageTitle.label = reference;
        startLoading();
        fetchPassage(reference, (text, err) => {
            stopLoading();
            if (err) {
                showError(err);
            } else {
                populateVerses(parseVerses(text), reference);
                // Scroll to top
                const adj = verseScroll.get_vadjustment();
                adj.set_value(adj.get_lower());
            }
        });
    }

    // ── Click a verse row → copy to clipboard ────────────────────────────────
    verseList.connect('row-activated', (_lb, row) => {
        if (!row._verseText) return;
        const ref = row._verseNum
            ? `${row._reference}:${row._verseNum}`
            : row._reference;
        const clip = `${row._verseText} — ${ref} (ESV)`;
        win.get_clipboard().set_text(clip);

        // Show "✓ Copied" badge briefly on the clicked row
        const rowBox = row.get_child();
        const copiedLbl = rowBox.get_last_child();
        if (copiedLbl) {
            copiedLbl.visible = true;
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1600, () => {
                copiedLbl.visible = false;
                return GLib.SOURCE_REMOVE;
            });
        }
    });

    // ── Book selection → populate chapters ───────────────────────────────────
    bookList.connect('row-selected', (_lb, row) => {
        if (!row) return;
        selectedBook = BIBLE_BOOKS[row._bookIdx];

        // Clear chapter list
        let child = chapList.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            chapList.remove(child);
            child = next;
        }

        // Populate with correct chapter count
        for (let ch = 1; ch <= selectedBook.chapters; ch++) {
            const chRow = new Gtk.ListBoxRow({activatable: true});
            chRow._chapter = ch;
            const chLbl = new Gtk.Label({
                label: `${ch}`,
                xalign: 0,
                margin_start: 16,
                margin_end: 8,
                margin_top: 5,
                margin_bottom: 5,
            });
            chRow.set_child(chLbl);
            chapList.append(chRow);
        }

        // Select chapter 1 automatically (triggers row-selected → loadPassage)
        const firstChRow = chapList.get_row_at_index(0);
        if (firstChRow) chapList.select_row(firstChRow);
    });

    // ── Chapter selection → fetch passage ────────────────────────────────────
    chapList.connect('row-selected', (_lb, row) => {
        if (!row || !selectedBook) return;
        loadPassage(`${selectedBook.name} ${row._chapter}`);
    });

    // ── Search bar ───────────────────────────────────────────────────────────
    searchEntry.connect('activate', () => {
        const query = searchEntry.get_text().trim();
        if (!query) return;
        searchEntry.set_text('');
        loadPassage(query);
    });

    // ── Copy button → copy entire chapter ────────────────────────────────────
    copyBtn.connect('clicked', () => {
        if (currentVerses.length === 0) return;
        const full = currentVerses
            .map(v => v.num ? `[${v.num}] ${v.text}` : v.text)
            .join('\n');
        win.get_clipboard().set_text(`${full}\n\n— ${passageTitle.label} (ESV)`);
        copyBtn.set_icon_name('object-select-symbolic');
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1400, () => {
            copyBtn.set_icon_name('edit-copy-symbolic');
            return GLib.SOURCE_REMOVE;
        });
    });

    // ── Open on ESV.org ───────────────────────────────────────────────────────
    webBtn.connect('clicked', () => {
        const ref = passageTitle.label;
        if (!ref || ref === 'Select a book and chapter') return;
        const enc = GLib.uri_escape_string(ref, null, true);
        Gio.AppInfo.launch_default_for_uri(`https://www.esv.org/verses/${enc}/`, null);
    });

    win.set_content(rootBox);
    win.present();
});

app.run([]);
