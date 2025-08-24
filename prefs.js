import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class AlwaysOnTopIndicatorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        // Create a preferences page
        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'dialog-information-symbolic',
        });
        window.add(page);

        // Create a preferences group
        const group = new Adw.PreferencesGroup({
            title: _('Appearance'),
            description: _('Configure the appearance of the border'),
        });
        page.add(group);

        // Create a spin row for border thickness  
        const thicknessRow = new Adw.SpinRow({
            title: _('Border Thickness'),
            subtitle: _('Thickness of the border in pixels'),
            adjustment: new Gtk.Adjustment({
                lower: 0.25,
                upper: 10.0,
                step_increment: 0.25,
                page_increment: 1.0,
                value: 1.0,
            }),
            digits: 2,  // Show two decimal places
            width_chars: 6,
        });
        group.add(thicknessRow);

        // Bind the setting
        const settings = this.getSettings();
        settings.bind('border-thickness', thicknessRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);
    }
}