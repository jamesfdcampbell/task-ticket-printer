# Task Ticket Printer

A small web app that prints task tickets to an Epson TM-T88V receipt printer over USB.

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows, Mac, or Linux)
- An Epson TM-T88V connected via USB

## Setup

**1. Find your printer device path**

On Linux, run `ls /dev/usb/` — it will usually be `lp0`.

On Mac, run `ls /dev/usb*` or check System Information. The path will look like `/dev/cu.usbserial-XXXX`.

On Windows, USB serial printers typically need a COM port bridge or a tool like [com0com](https://com0com.sourceforge.net/). Check Device Manager for the port name.

**2. Edit `docker-compose.generic.yml`**

Update the two lines marked below:

```yaml
devices:
  - /dev/usb/lp0:/dev/usb/lp0   # change the left side to your printer's device path
environment:
  - TZ=America/Chicago           # change to your timezone (e.g. Europe/London, Asia/Tokyo)
```

A full list of timezone names is available at: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones

**3. Start the server**

```bash
docker compose -f docker-compose.generic.yml up --build
```

Then open **http://localhost:3000** in your browser.

To run it in the background:

```bash
docker compose -f docker-compose.generic.yml up --build -d
```

To stop it:

```bash
docker compose -f docker-compose.generic.yml down
```

## Printer setup

In the Epson TM-T88V settings, make sure:
- Interface is set to **USB**
- Character set is **PC437** (or any standard Latin codepage)
- Paper width is **80mm**
