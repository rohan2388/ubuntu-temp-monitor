# Ubuntu Temperature Monitor

A compact GNOME Shell 46 dashboard for the top bar. It shows twelve logical CPU load tiles, a CPU temperature summary tile, and an NVIDIA GPU temperature summary tile.

## Requirements

- Ubuntu GNOME Shell 46
- `lm-sensors` (`sensors -j`)
- NVIDIA driver utilities (`nvidia-smi`)

The current implementation reads logical CPU utilization from `/proc/stat`, AMD Ryzen `k10temp` `Tctl`, and the first NVIDIA GPU reported by `nvidia-smi`. The twelve small tiles correspond to Linux logical CPUs, arranged in two rows of six, and show load values without a percent glyph. `k10temp` exposes package temperature only, which is displayed in the CPU summary tile.

Temperature colors progress from green to red: green below 55°C, amber at 55-69°C, orange at 70-79°C, deep orange at 80-89°C, and red at 90°C or higher.

Click the monitor to open GNOME System Monitor on its Resources tab.

## Package

From this project directory:

```bash
gnome-extensions pack --force --out-dir=dist ubuntu-temp-monitor@local
```

This creates `dist/ubuntu-temp-monitor@local.shell-extension.zip`.

## Install and Enable

```bash
gnome-extensions install --force dist/ubuntu-temp-monitor@local.shell-extension.zip
gnome-extensions enable ubuntu-temp-monitor@local
```

The extension is loaded automatically on future GNOME logins. No separate autostart entry or system service is needed.

This system uses X11. To reload GNOME Shell after installing or updating the extension, press `Alt+F2`, enter `r`, and press Enter.

## Update

Repackage and reinstall after changing the source:

```bash
gnome-extensions pack --force --out-dir=dist ubuntu-temp-monitor@local
gnome-extensions install --force dist/ubuntu-temp-monitor@local.shell-extension.zip
```

Then reload GNOME Shell with `Alt+F2`, `r`, Enter.

## Status and Debugging

```bash
gnome-extensions info ubuntu-temp-monitor@local
gnome-extensions list --enabled
journalctl -f -o cat /usr/bin/gnome-shell
```

Verify the data sources directly:

```bash
sensors -j
nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits
```

## Disable or Uninstall

Disable it while retaining the installed extension:

```bash
gnome-extensions disable ubuntu-temp-monitor@local
```

Re-enable it later:

```bash
gnome-extensions enable ubuntu-temp-monitor@local
```

Remove it completely:

```bash
gnome-extensions disable ubuntu-temp-monitor@local
gnome-extensions uninstall ubuntu-temp-monitor@local
```
