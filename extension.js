import St from 'gi://St';
import Meta from 'gi://Meta';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const BORDER_WIDTH = 1;

export default class AlwaysOnTopIndicatorExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._borders = new Map();
        this._handlerIds = new Map();
    }

    enable() {
        // Connect to window added/removed signals
        this._windowAddedId = global.display.connect('window-created', 
            this._onWindowCreated.bind(this));
        
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
        // Disconnect signals
        if (this._windowAddedId) {
            global.display.disconnect(this._windowAddedId);
            this._windowAddedId = null;
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
            style: `border: ${BORDER_WIDTH}px solid rgba(189, 147, 249, 1);
                    background-color: transparent;`
        });

        // Set border size and position
        const updateBorderGeometry = () => {
            try {
                const rect = metaWindow.get_frame_rect();
                border.set_position(rect.x - BORDER_WIDTH, rect.y - BORDER_WIDTH);
                border.set_size(rect.width + 2 * BORDER_WIDTH, rect.height + 2 * BORDER_WIDTH);
            } catch (e) {
                // Window may have been destroyed
            }
        };

        updateBorderGeometry();

        // Add to UI group
        Main.layoutManager.addChrome(border);

        // Keep border updated with window geometry
        const sizeChangedId = metaWindow.connect('size-changed', updateBorderGeometry);
        const positionChangedId = metaWindow.connect('position-changed', updateBorderGeometry);
        
        // Store border and its handler IDs
        this._borders.set(metaWindow, {
            actor: border,
            sizeChangedId: sizeChangedId,
            positionChangedId: positionChangedId
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
                Main.layoutManager.removeChrome(borderInfo.actor);
                borderInfo.actor.destroy();
            }
            
            this._borders.delete(metaWindow);
        }
    }
}