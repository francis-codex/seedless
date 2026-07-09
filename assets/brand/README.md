# Brand assets

Source lockups and exported cards for Seedless. HTML files are the editable
source (render to PNG via headless Chrome `--screenshot`); PNGs are the exports
used in posts, the store, and partner channels.

## Logos & core marks
- `logo.png` — primary Seedless mark
- `banner.png`, `banner-dexscreener.png`, `banner-dexscreener@2x.png` — profile/listing banners

## Partnership lockups
- `partnership-alchemy.html` / `.png`, `alchemy.png`
- `partnership-bags.html` / `.png`, `bags.png`
- `lazorkit.png`, `jupiter.png`, `ika.png`, `colosseum.png`

## Campaign & update cards
- `flagship-teaser.html` / `.png` — "what's our flagship feature?" teaser
- `update-jul07.html` / `.png` — State of Seedless July update card
- `month-6-cover.html` / `.png` — month-6 recap cover
- `goseedless-prize.html` / `.png` — #GoSeedless campaign prize card
- `claude-clock-cover.html` / `.png` — claude-clock OSS cover
- `seedlesslabs-launch.png` — launch hero screenshot

## Conventions
- Keep the HTML source alongside every exported PNG so cards stay editable.
- Export at 2x for banners; 1080x1920 for phone frames (see `store-assets/`).
- Fonts and assets are embedded/base64 in the HTML so cards render offline.
