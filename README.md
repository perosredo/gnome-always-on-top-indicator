# Always On Top Indicator

GNOME Shell extension that adds visual accent borders to windows set as always-on-top.

https://extensions.gnome.org/extension/8561/always-on-top-indicator/

## Features

- 1px-10px customizable border thickness  
- Automatic border hiding when windows are minimized
- Live settings adjustment without restart
- Respects GNOME accent color theme

## Installation

```bash
git clone https://github.com/perosredo/gnome-always-on-top-indicator.git
cd gnome-always-on-top-indicator
ln -sf $(pwd) ~/.local/share/gnome-shell/extensions/always-on-top-indicator@sredojevic.ca
```

Restart GNOME Shell (`Alt+F2`, type `r`) and enable via Extensions app.

## Requirements

- GNOME Shell 45-48
- Wayland or X11

## Development

Developed entirely by Claude with micromanagement from PS.

## License

GPL-3.0
