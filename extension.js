import St from 'gi://St';
import Meta from 'gi://Meta';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class AlwaysOnTopIndicatorExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._borders = new Map();
        this._handlerIds = new Map();
        this._overviewVisibleId = null;
        this._overviewHiddenId = null;
        this._restackedId = null;
    }

    enable() {
        // Initialize settings
        this._settings = this.getSettings();
        this._borderWidth = this._settings.get_double('border-thickness');
        
        // Watch for settings changes
        this._settingsChangedId = this._settings.connect('changed::border-thickness', () => {
            const newWidth = this._settings.get_double('border-thickness');
            if (newWidth === this._borderWidth) return; // No change
            
            this._borderWidth = newWidth;
            
            // Update all existing borders - just update their style, don't recreate
            this._borders.forEach((borderInfo, metaWindow) => {
                if (borderInfo.actor) {
                    borderInfo.actor.set_style(this._borderStyle());
                    // Update position to account for new border width
                    try {
                        const rect = metaWindow.get_frame_rect();
                        borderInfo.actor.set_position(rect.x - this._borderWidth, rect.y - this._borderWidth);
                        borderInfo.actor.set_size(rect.width + 2 * this._borderWidth, rect.height + 2 * this._borderWidth);
                    } catch (e) {
                        // Window may have been destroyed
                    }
                }
            });
        });
        
        // Connect to window added/removed signals
        this._windowAddedId = global.display.connect('window-created', 
            this._onWindowCreated.bind(this));
        
        // Connect to overview signals to hide/show borders
        this._overviewVisibleId = Main.overview.connect('showing', () => {
            this._hideAllBorders();
        });
        this._overviewHiddenId = Main.overview.connect('hiding', () => {
            this._showAllBorders();
        });
        
        // Keep each border directly above its window when the stack changes.
        // Deferred so mutter has already reordered the window actors.
        this._restackedId = global.display.connect('restacked', () => {
            global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
                this._restackAllBorders();
                return false;
            });
        });
        
        // Process existing windows
        const windowActors = global.get_window_actors();
        for (const windowActor of windowActors) {
            const metaWindow = windowActor.meta_window;
            if (metaWindow) {
                this._setupWindow(metaWindow);
            }
        }
    }

    disable() {
        // Disconnect settings
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        this._settings = null;
        
        // Disconnect signals
        if (this._windowAddedId) {
            global.display.disconnect(this._windowAddedId);
            this._windowAddedId = null;
        }
        
        // Disconnect overview signals
        if (this._overviewVisibleId) {
            Main.overview.disconnect(this._overviewVisibleId);
            this._overviewVisibleId = null;
        }
        if (this._overviewHiddenId) {
            Main.overview.disconnect(this._overviewHiddenId);
            this._overviewHiddenId = null;
        }
        
        // Disconnect restacked signal
        if (this._restackedId) {
            global.display.disconnect(this._restackedId);
            this._restackedId = null;
        }

        // Clean up all borders and handlers
        this._borders.forEach((border, metaWindow) => {
            this._removeBorder(metaWindow);
        });
        
        this._handlerIds.forEach((handlers, metaWindow) => {
            if (metaWindow && handlers) {
                for (const id of Object.values(handlers)) {
                    if (id) {
                        try {
                            metaWindow.disconnect(id);
                        } catch (e) {
                            // Window may be destroyed
                        }
                    }
                }
            }
        });
        
        this._borders.clear();
        this._handlerIds.clear();
    }

    _onWindowCreated(display, window) {
        this._setupWindow(window);
    }

    _setupWindow(metaWindow) {
        if (!metaWindow || metaWindow.get_window_type() !== Meta.WindowType.NORMAL) {
            return;
        }

        // Store all handler IDs in an object
        const handlers = {};
        
        // Connect to above state changes
        handlers.above = metaWindow.connect('notify::above', () => {
            this._updateWindowBorder(metaWindow);
        });
        
        // Connect to minimize/unminimize
        handlers.minimize = metaWindow.connect('notify::minimized', () => {
            this._updateWindowBorder(metaWindow);
        });
        
        // Connect to window unmanaged signal for cleanup
        handlers.unmanaged = metaWindow.connect('unmanaged', () => {
            this._cleanupWindow(metaWindow);
        });
        
        // We'll handle restacking globally in enable() to avoid multiple connections
        
        this._handlerIds.set(metaWindow, handlers);

        // Initial border update
        this._updateWindowBorder(metaWindow);
    }

    _cleanupWindow(metaWindow) {
        const handlers = this._handlerIds.get(metaWindow);
        if (handlers) {
            for (const id of Object.values(handlers)) {
                if (id) {
                    try {
                        metaWindow.disconnect(id);
                    } catch (e) {
                        // Window may be destroyed
                    }
                }
            }
            this._handlerIds.delete(metaWindow);
        }
        
        this._removeBorder(metaWindow);
    }

    _updateWindowBorder(metaWindow) {
        if (metaWindow.is_above() && !metaWindow.minimized) {
            this._addBorder(metaWindow);
        } else {
            this._removeBorder(metaWindow);
        }
    }

    _addBorder(metaWindow) {
        // Remove existing border if any
        this._removeBorder(metaWindow);

        const windowActor = metaWindow.get_compositor_private();
        if (!windowActor) return;

        // Create border actor
        const border = new St.Bin({
            reactive: false,
            can_focus: false,
            track_hover: false,
            style: this._borderStyle(),
        });

        // Set border size and position
        const updateBorderGeometry = () => {
            try {
                const rect = metaWindow.get_frame_rect();
                border.set_position(rect.x - this._borderWidth, rect.y - this._borderWidth);
                border.set_size(rect.width + 2 * this._borderWidth, rect.height + 2 * this._borderWidth);
            } catch (e) {
                // Window may have been destroyed
            }
        };

        updateBorderGeometry();

        // Place the border in the window group directly above its window, so
        // windows stacked higher cover it like they cover the window itself
        global.window_group.insert_child_above(border, windowActor);

        // Follow the window's visibility (e.g. workspace switches)
        windowActor.bind_property('visible', border, 'visible',
            GObject.BindingFlags.SYNC_CREATE);

        // Borders are hidden while the overview is open
        if (Main.overview.visible)
            border.opacity = 0;

        // Keep border updated with window geometry
        const sizeChangedId = metaWindow.connect('size-changed', updateBorderGeometry);
        const positionChangedId = metaWindow.connect('position-changed', updateBorderGeometry);
        
        // Store border and its handler IDs
        this._borders.set(metaWindow, {
            actor: border,
            sizeChangedId: sizeChangedId,
            positionChangedId: positionChangedId,
            windowActor: windowActor,
        });
    }

    _removeBorder(metaWindow) {
        const borderInfo = this._borders.get(metaWindow);
        if (borderInfo) {
            // Disconnect handlers
            if (borderInfo.sizeChangedId && metaWindow) {
                try {
                    metaWindow.disconnect(borderInfo.sizeChangedId);
                } catch (e) {
                    // Window may be destroyed
                }
            }
            if (borderInfo.positionChangedId && metaWindow) {
                try {
                    metaWindow.disconnect(borderInfo.positionChangedId);
                } catch (e) {
                    // Window may be destroyed
                }
            }
            
            // Remove border actor
            if (borderInfo.actor) {
                borderInfo.actor.destroy();
            }
            
            this._borders.delete(metaWindow);
        }
    }

    _hideAllBorders() {
        this._borders.forEach((borderInfo) => {
            if (borderInfo.actor) {
                borderInfo.actor.opacity = 0;
            }
        });
    }

    _showAllBorders() {
        this._borders.forEach((borderInfo) => {
            if (borderInfo.actor) {
                borderInfo.actor.opacity = 255;
            }
        });
    }

    _restackAllBorders() {
        this._borders.forEach((borderInfo) => {
            const {actor, windowActor} = borderInfo;
            if (actor && windowActor && windowActor.get_parent() === global.window_group)
                global.window_group.set_child_above_sibling(actor, windowActor);
        });
    }

    _borderStyle() {
        return `border: ${this._borderWidth}px solid rgba(189, 147, 249, 1);
                background-color: transparent;`;
    }
}