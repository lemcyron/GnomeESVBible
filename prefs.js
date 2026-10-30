import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ESVBiblePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;

        // ── Main page ──────────────────────────────────────────────────────
        const page = new Adw.PreferencesPage({
            title: _('ESV Bible Verses'),
            icon_name: 'accessories-dictionary-symbolic',
        });
        window.add(page);

        // ────────────────────────────────────────────────────────────────────
        // Group 1: API Configuration
        // ────────────────────────────────────────────────────────────────────
        const apiGroup = new Adw.PreferencesGroup({
            title: _('ESV.org API Configuration'),
            description: _('Get a free API key at https://api.esv.org'),
        });
        page.add(apiGroup);

        // API Key row
        const apiKeyRow = new Adw.EntryRow({
            title: _('API Key'),
            show_apply_button: true,
        });
        apiKeyRow.set_text(settings.get_string('api-key'));
        apiKeyRow.set_input_purpose(Gtk.InputPurpose.PASSWORD);
        // Toggle visibility button
        const visBtn = new Gtk.ToggleButton({
            icon_name: 'eye-not-looking-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Show / hide API key'),
        });
        visBtn.connect('toggled', () => {
            const visible = visBtn.get_active();
            visBtn.set_icon_name(visible ? 'eye-open-negative-filled-symbolic' : 'eye-not-looking-symbolic');
            // Adw.EntryRow has no direct visibility API — proxy via CSS class trick
            // The best we can do is show a hint; actual masking depends on GTK entry
        });
        apiKeyRow.add_suffix(visBtn);
        apiKeyRow.connect('apply', () => {
            settings.set_string('api-key', apiKeyRow.get_text().trim());
        });
        apiGroup.add(apiKeyRow);

        // API key info banner
        const infoRow = new Adw.ActionRow({
            title: _('How to get an API key'),
            subtitle: _('1. Visit api.esv.org  2. Create a free account  3. Create an API token  4. Paste it above'),
            activatable: true,
        });
        infoRow.connect('activated', () => {
            Gio.AppInfo.launch_default_for_uri('https://api.esv.org', null);
        });
        infoRow.add_prefix(new Gtk.Image({icon_name: 'help-about-symbolic', pixel_size: 20}));
        apiGroup.add(infoRow);

        // ────────────────────────────────────────────────────────────────────
        // Group 2: Display Options
        // ────────────────────────────────────────────────────────────────────
        const displayGroup = new Adw.PreferencesGroup({
            title: _('Display Options'),
        });
        page.add(displayGroup);

        // Auto-refresh
        const refreshRow = new Adw.SpinRow({
            title: _('Auto-refresh interval (minutes)'),
            subtitle: _('Set to 0 to disable auto-refresh'),
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 1440,
                step_increment: 5,
                page_increment: 30,
                value: settings.get_int('auto-refresh-minutes'),
            }),
        });
        refreshRow.connect('notify::value', () => {
            settings.set_int('auto-refresh-minutes', refreshRow.get_value());
        });
        displayGroup.add(refreshRow);

        // ────────────────────────────────────────────────────────────────────
        // Group 3: Verse List
        // ────────────────────────────────────────────────────────────────────
        const versesGroup = new Adw.PreferencesGroup({
            title: _('Custom Verse List'),
            description: _('Enter Bible references one per line (e.g. "John 3:16"). Leave empty to use the built-in list.'),
        });
        page.add(versesGroup);

        // Multi-line text editor for custom verses
        const scrolled = new Gtk.ScrolledWindow({
            min_content_height: 200,
            max_content_height: 320,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            margin_top: 4,
            margin_bottom: 4,
        });
        const textView = new Gtk.TextView({
            wrap_mode: Gtk.WrapMode.WORD_CHAR,
            monospace: false,
            top_margin: 8,
            bottom_margin: 8,
            left_margin: 12,
            right_margin: 12,
        });
        const currentVerses = settings.get_strv('custom-verses');
        textView.buffer.text = currentVerses.join('\n');
        scrolled.set_child(textView);

        const versesRow = new Adw.PreferencesRow({
            child: scrolled,
        });
        versesGroup.add(versesRow);

        // Save verses button
        const saveVersesRow = new Adw.ActionRow();
        const saveBtn = new Gtk.Button({
            label: _('Save Verse List'),
            css_classes: ['suggested-action'],
            valign: Gtk.Align.CENTER,
            margin_top: 4,
            margin_bottom: 4,
        });
        saveBtn.connect('clicked', () => {
            const raw = textView.buffer.text;
            const verses = raw
                .split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0);
            settings.set_strv('custom-verses', verses);

            // Visual confirmation
            saveBtn.set_label(_('Saved ✓'));
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
                saveBtn.set_label(_('Save Verse List'));
                return GLib.SOURCE_REMOVE;
            });
        });

        const resetBtn = new Gtk.Button({
            label: _('Reset to Defaults'),
            valign: Gtk.Align.CENTER,
            margin_start: 8,
            margin_top: 4,
            margin_bottom: 4,
        });
        resetBtn.connect('clicked', () => {
            settings.set_strv('custom-verses', []);
            textView.buffer.text = '';
        });

        const btnBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 0,
            margin_bottom: 8,
            halign: Gtk.Align.END,
            margin_end: 8,
        });
        btnBox.append(resetBtn);
        btnBox.append(saveBtn);
        saveVersesRow.set_child(btnBox);
        versesGroup.add(saveVersesRow);

        // ────────────────────────────────────────────────────────────────────
        // Group 4: About
        // ────────────────────────────────────────────────────────────────────
        const aboutGroup = new Adw.PreferencesGroup({
            title: _('About'),
        });
        page.add(aboutGroup);

        const aboutRow = new Adw.ActionRow({
            title: _('ESV Bible Verses Extension'),
            subtitle: _('Version 1 · Uses the ESV API from Crossway · api.esv.org'),
        });
        aboutGroup.add(aboutRow);

        const licenseRow = new Adw.ActionRow({
            title: _('ESV® Bible'),
            subtitle: _('The Holy Bible, English Standard Version. ESV® Text Edition: 2016. Copyright © 2001 by Crossway Bibles, a publishing ministry of Good News Publishers.'),
        });
        aboutGroup.add(licenseRow);
    }
}
