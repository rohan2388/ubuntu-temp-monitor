# Ubuntu Temperature Monitor

A minimal GNOME Shell 46 extension that shows AMD CPU and NVIDIA GPU temperatures in the top bar.

## Requirements

- Ubuntu GNOME Shell 46
- `lm-sensors` (`sensors -j`)
- NVIDIA driver utilities (`nvidia-smi`)

The current implementation reads the AMD Ryzen `k10temp` `Tctl` sensor and the first NVIDIA GPU reported by `nvidia-smi`.

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
