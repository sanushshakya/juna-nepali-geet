# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"90s Nepali Songs": a single-page, free, no-signup static PWA. Press play and classic Nepali songs (YouTube, official uploads only) keep playing over an animated inline-SVG Himalayan landscape. Plain HTML/CSS/JS, no framework, no runtime dependencies, no backend. Deployed to Netlify (https://imaginative-faun.netlify.app) by GitHub Actions.

## Commands

```sh
npm run serve          # build + http://localhost:8090 (python http.server; 8080 is taken by nginx on this Mac)
npm run build          # node build.mjs -> dist/
npm run check          # build + assert output + node --check on all built JS and scripts/*.mjs + manifest validation
STRICT=1 npm run check # also fails if the placeholder takedown email is present (CI sets this on main)
npm run verify-songs   # every YouTube ID via oEmbed: exists, embeddable, no duplicates, exactly one `featured`
BASE_URL=<url> npm run smoke      # post-deploy checks (files, cache/security headers, HTTPS); header checks skipped on local servers
npm run lhci           # Lighthouse CI (@lhci/cli 0.13.x = Lighthouse 11) against dist/ with budgets in lighthouserc.json
BASE_URL=<url> npm run loadtest   # see "Load test" below
python3 tools/make-icons.py       # regenerates src/icons/* (needs Pillow)
```

There is no unit-test framework; the gates above are the tests. Local Node is 18.17, CI uses Node 20 (`.nvmrc`); `scripts/*.mjs` must run on both.

## Architecture

**Build (`build.mjs`, zero deps)** turns `src/` into `dist/`: it inlines `style.css` and `hero.svg` into `index.html` (placeholders `{{CSS}}`, `{{HERO}}`, `{{FONT}}`, `{{SONGS}}`, `{{APP}}`), writes `songs.js` / `app.js` with content-hashed names, copies icons and root-level `favicon.ico` / `apple-touch-icon*.png`, generates `sw.js` and `_headers` (Netlify cache/security headers; this is the single source of truth for headers). **It deletes `dist/` on every run**: keep temporary test pages outside it (or copy them in after building). The Google Font request is subset with `&text=` to only the glyphs found in `index.html` + `app.js`, so a new non-ASCII character in either file changes the font URL.

**Service worker (`src/sw.js` template).** The cache name embeds a hash of the built HTML + shell files + icon bytes, so every deploy yields a new cache. Navigations are **cache-first**, so after a deploy a returning visitor sees the old page once and the new one on the next load ("reload twice"). When testing locally in a browser that visited before, unregister the SW and clear caches or you will see stale code.

**Player (`src/app.js`, one IIFE).** Nothing from YouTube loads until the first Play press (facade): then it injects the IFrame API, builds the playlist as featured song first + shuffled rest (`order()`), and drives it with custom controls. State/UI is derived from `onStateChange` and `P.getVideoData().video_id` mapped through `byId`; errors skip to the next video. Keep the player rendered at full size: on phone widths the card is moved off-screen (`left:-2000px`), never `display:none`, because hiding it risks audio stopping. Other pieces in the same file: Media Session handlers, a desktop-only Mini player (Document Picture-in-Picture window with title/artist and prev/play/next that call the main buttons' handlers; `#mp` is shown only when `documentPictureInPicture` exists; the YouTube iframe itself is never moved), Screen Wake Lock (acquired while playing, user-togglable, needs a secure context), Install button (an inline script in `<head>` captures `beforeinstallprompt` early), Kathmandu analog/digital clock (`Intl` with `Asia/Kathmandu`), pause-animations-when-hidden via IntersectionObserver + `visibilitychange`, pointer/scroll parallax on `[data-d]` layers, and the visitor counter.

**Songs (`src/songs.js`).** `window.SONGS = [{title, artist, youtubeId, featured?}]`. Rules from the owner: only official, embeddable uploads from the artist's or label's own channel; no audio is hosted or downloaded; exactly one entry has `featured:true` (it is always played first). Era rule: songs must be from 1990-2019; new entries should carry `year:` (original release year), which `verify-songs` and the weekly job enforce. Verify new IDs with `npm run verify-songs` (or the oEmbed URL in the README). YouTube policy forbids forcing background playback; the app does not try (phones get "Open in YouTube Music" / "Play all on YouTube" links behind a chevron).

**Hero (`src/hero.svg`).** One inline SVG, `viewBox 0 0 1600 900`, target size about 30 KB (currently ~33 KB, avoid growing it). Reuses `<symbol>`/`<use>`; only `transform`/`opacity` are animated, via classes defined in `style.css` (`.cl`, `.pl`, `.bd`, `.rp`, `.sm`, `.wk`, ...); all animation is disabled under `prefers-reduced-motion` and paused when off-screen. Layers are groups with `data-d` (parallax depth); the village/terraces/river group sits inside `translate(0 -50)`, the mountains inside `translate(0 40)`. The sky and foreground have extra rects extending far above/below the viewBox: on phone widths (`max-width:699px`) CSS sizes the SVG element to `177.78vw x 100vw` (shows about 900 of the 1600 units, the whole scene), positions it with `top:max(170px, calc(100svh - 100vw - ...))` and `overflow:visible`, so the extended sky/ground fill the screen above and below it. Desktop uses plain `preserveAspectRatio="xMidYMid slice"` full-bleed. Several overlay rects (`#wm`, `#hz`) must span beyond the scene or a visible seam appears on mobile.

**Layout rules that bite.** Phone widths: compact player, extras (wake-lock switch, YouTube Music links) behind the `#mo` chevron, video card off-screen, title block shifted down. The visitor counter (Abacus, namespace string `juna-nepali-geet-...` in `app.js`) is skipped on localhost, private IPs and hosts containing `--` (Netlify previews); any real-browser visit to the live site (including Lighthouse runs) increments it.

## CI/CD (`.github/workflows/`)

- `main` is protected: changes go through a pull request that needs the `build` and `lighthouse` checks (admins not enforced). Do not push to `main` directly.
- `ci.yml`: `build` (`npm run check`, STRICT on main) -> `lighthouse` -> `songs` (only when `src/songs.js` changed) -> `deploy-preview` (same-repo human PRs; `https://pr-N--<site>.netlify.app`, URL commented on the PR, smoke-tested) or `deploy-production` (push to main; **waits for a manual approval** on the `production` environment, which only `main` may use) -> smoke test. Deploys upload the prebuilt `dist/` with `netlify-cli`; secrets `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` live in GitHub (never print secret names/values; `gh secret list` shows names).
- `song-check.yml`: weekly + manual `verify-songs`; opens an issue on failure.
- `songs-weekly.yml`: Mondays (+ manual), fully hands-off, no approval and no commits (main is protected and the workflow token cannot merge): `scripts/update-songs.mjs --write` prunes dead/non-embeddable songs and any song with a `year` outside 1990-2019 (floor of 30; fails, opening an issue, if the featured favourite itself would be pruned) in the runner's working copy only, then builds, deploys with netlify-cli (repo secrets, no `production` environment) and smoke-tests. The featured song (the owner's favourite, Chahana Eutai Mero) is never rotated. Opens a `songs-weekly` issue on failure. Dry run: `node scripts/update-songs.mjs`.
- `loadtest.yml`: manual only, runs `scripts/loadtest.mjs` against a `*.netlify.app` URL from GitHub's runner (inputs are capped; other hosts are refused). Findings from runner runs: 10/25 warm users (about 120 req/s) and a 100-user cold spike (when run before heavy stages) are clean; about 225 req/s from the single runner IP makes the CDN reset connections and briefly refuse new ones (per-IP throttling, not a capacity limit), so defaults stay at 10,25 users and the spike runs first.
- Netlify rename note: the site's URL changed from `imaginative-faun-f78a65` to `imaginative-faun`; the README and CI use the current one.

## Working conventions here

- Branch -> PR -> checks -> squash merge -> approve the production run in GitHub (the user clicks Approve); verify the live site with `BASE_URL=... npm run smoke`.
- Commits use the repo-local GitHub no-reply identity (global git email is a work address; do not publish it) and end with the `Co-Authored-By: Claude ...` trailer.
- Privacy wording (About text, footer, README) names the two measurement tools: the Abacus visitor counter and Cloudflare Web Analytics (static snippet at the end of `src/index.html`; its token is public). Keep that wording accurate if analytics change, and do not add other third-party scripts without telling the user.
- Stage files explicitly (`git add <paths>`), not `git add -A`: stray screenshots such as `iphone13-preview.png` appear in the project root.
- Browser testing: the Chrome automation tab can be reported as hidden (YouTube blocks autoplay, clock/animations pause) and may be wrapped in a phone-preview frame; use a fresh tab. For phone-size screenshots, render with headless Chrome (`--window-size=390,844 --screenshot`) around an iframe test page kept outside `dist/`.
- Real-device testing needs HTTPS (wake lock, PWA install, correct iPhone home-screen icon): use the Netlify URL in Safari. Plain `http://<LAN IP>:8090` only works as a bookmark.
