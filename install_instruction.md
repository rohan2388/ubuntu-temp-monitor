# How to Install

This adds a small temperature and CPU monitor to the top bar of your Ubuntu desktop.

## What you need first

- Ubuntu with GNOME Shell version 46
- The `lm-sensors` program (for CPU temperature)
- An NVIDIA graphics card with its driver installed (for GPU temperature)

If you don't have an NVIDIA card, everything else still works. The GPU tile just shows `--`.

## Steps

### 1. Install the helper programs

Open a terminal and run:

```bash
sudo apt update
sudo apt install lm-sensors gnome-shell-extension-prefs
```

### 2. Set up the temperature sensors

Run this once and accept the defaults:

```bash
sudo sensors-detect --auto
```

### 3. Check that temperatures can be read

```bash
sensors
```

You should see a `k10temp` section with a `Tctl` temperature. If you do, you're good.

### 4. Build the extension

From inside the project folder:

```bash
gnome-extensions pack --force --out-dir=dist ubuntu-temp-monitor@local
```

### 5. Install it

```bash
gnome-extensions install --force dist/ubuntu-temp-monitor@local.shell-extension.zip
gnome-extensions enable ubuntu-temp-monitor@local
```

### 6. Turn it on

- **On X11:** press `Alt+F2`, type `r`, press Enter.
- **On Wayland:** log out and log back in.

You should now see the monitor on the left side of the top bar.

## Updating it later

After you make changes to the code, run steps 4 and 5 again, then step 6.

## If something doesn't show up

- Check it's on: `gnome-extensions info ubuntu-temp-monitor@local`
- Watch for errors: `journalctl -f -o cat /usr/bin/gnome-shell`
- Temperature shows `--`? Run `sensors -j` and make sure there is a `k10temp` entry with `Tctl`.
- GPU shows `--`? Make sure `nvidia-smi` works by running it in a terminal.
