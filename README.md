# 90s Nepali Songs · जुना नेपाली गीत

**Live site:** https://imaginative-faun.netlify.app (deployed from `main` by the CI/CD pipeline below)

A single page. Press play and classic Nepali songs from the 90s to 2010s keep playing. No song list, search or accounts. A personal, non-commercial project.

- Plain HTML/CSS/JS, no framework, no backend, no libraries, no analytics or trackers. The one exception is a simple visitor counter (below).
- Audio is **not** hosted: songs stream through the YouTube IFrame Player API from official artist/label uploads.
- Nothing from YouTube loads until the first press of play (the API script and player are created on demand; a `preconnect` is added when the play button is hovered/focused/touched).
- The hero is a detailed inline-SVG illustration (Gaurishankar's twin-peak silhouette (Shankar and Gauri with the saddle between), glacier, lake, river, terraces, village, a stupa with a vajra, a gumba, a Shiva temple with trishul, animals, people, foreground) animated with `transform`/`opacity` only. Animations pause when the tab is hidden or the hero is off-screen, and are disabled under `prefers-reduced-motion`.

## Develop

```sh
npm run serve     # builds to dist/ and serves http://localhost:8080
```

Serve over `http://` (not `file://`): YouTube embeds need a real origin/referrer.

Source is in `src/`:

| File | Purpose |
| --- | --- |
| `index.html` | page shell (CSS and SVG are inlined at build time) |
| `style.css` | critical CSS + SVG keyframes |
| `hero.svg` | the hero scene |
| `songs.js` | the song list: `{title, artist, youtubeId}` |
| `app.js` | facade loader, custom controls, parallax, pause-when-hidden |

`node build.mjs` (no dependencies) writes `dist/`: `index.html` with CSS + SVG inlined, `songs.<hash>.js` and `app.<hash>.js` (content-hashed, safe to cache forever), and a `_headers` file for Netlify. The Google Font request is limited (`&text=`) to the glyphs the page can show, which keeps the font to about 30 KB.

Measured locally with Lighthouse 11 (mobile): Performance 100, Accessibility 100, Best Practices 100, SEO 100, see the Lighthouse run for current transfer size.

## Editing the songs

Add or remove entries in `src/songs.js`. Only use embeddable videos from the artist's or label's own channel. To check an ID:

```sh
curl -s "https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=VIDEO_ID"
```

A `200` response with the right `author_name` means it is embeddable and from the expected channel; `401` means embedding is disabled (drop it). Songs that fail to play are skipped automatically at runtime.

## Deploy

- **Netlify (recommended):** deployed by the GitHub Actions pipeline described in [CI/CD](#cicd). Manual fallback: `node build.mjs && npx netlify-cli deploy --dir=dist --prod`.
- **Vercel:** build command `node build.mjs`, publish directory `dist`.

The `_headers` cache rules are applied by Netlify. Hashed JS is safe to cache everywhere because the filename changes with its content.

## Installable app (PWA)

The site installs to a phone or desktop home screen and opens full-screen like an app.

- `src/manifest.webmanifest` + `src/icons/` (regenerate with `python3 tools/make-icons.py`, needs Pillow): standalone display, theme colour, maskable icon.
- `src/sw.js` is turned into `dist/sw.js` by the build. It precaches the app shell (page, hashed JS, manifest, icons), so the app opens instantly and works offline. Songs themselves still need a connection (they stream from YouTube); offline, the play button says so. Google Fonts are cached after first use. The cache name changes with every build, so deploys replace old files automatically.
- The "Install app" pill (under the clock) shows whenever the app is not already installed. An inline script in `<head>` catches the browser's `beforeinstallprompt` event even if it fires before `app.js` loads; tapping the pill opens the native install dialog, which saves the app to the device. Where the browser gives no prompt (iPhone/iPad Safari, Firefox, Safari on Mac, or after a dismissed prompt) it opens a small popup with the right manual steps for that browser.
- Lock-screen/notification controls come from the Media Session API. Note that iOS may pause YouTube audio when the app is backgrounded; that is a platform limit.

- Background audio: YouTube's developer policies prohibit background play through the embedded player, so the app does not try to force it. Instead it holds a Screen Wake Lock while a song plays (released on pause, re-acquired when you return to the app) so the screen does not time out, and on phones it shows an "Open in YouTube Music" button and a "Play all on YouTube" link for real background playback in the native apps. Wake Lock works in Chrome on Android; on iPhone it works in Safari and in home-screen apps from iOS 18.4.

Lighthouse 11 (mobile): PWA 100, Performance 99, Accessibility 100, Best Practices 100, SEO 100.

## Visitor counter

After load, `app.js` makes one request to the free keyless [Abacus](https://abacus.jasoncameron.dev) counter API: `hit` the first time a browser visits (remembered in `localStorage`), `get` afterwards, so each browser counts once. The count shows under the clock and stays hidden if the request fails. It is skipped entirely on localhost, private-network addresses and Netlify preview hosts (`--` in the hostname), so testing never changes the live number. The counter name is the `juna-nepali-geet-...` string in `src/app.js`; change it to start a new count. It is not secret, so anyone who knows it could bump the number.

## Featured song

`src/songs.js` marks one entry `featured:true` (currently *Chahana Eutai Mero*). It is the chip under the title and always the first song played; the rest are shuffled after it.

## Video card

The YouTube player starts covered by a "Want to watch the video?" panel; the viewer taps to reveal it (and can hide it again). The player stays rendered at 356x200 underneath, so playback is unaffected.

## Before publishing

Replace `your-email@example.com` in `src/index.html` with the takedown contact address.

## CI/CD

GitHub Actions builds, checks and deploys to Netlify (`.github/workflows/ci.yml`).

```
pull request ─> build+check ─> lighthouse ─> (songs, only if src/songs.js changed) ─> Netlify PREVIEW ─> smoke ─> PR comment
push to main ─> build+check(STRICT) ─> lighthouse ─> (songs) ─> Netlify PRODUCTION (environment: production) ─> smoke
every Monday ─> weekly song check ─> opens an issue if a YouTube video is no longer embeddable
```

| Gate | What it does | Run it locally |
| --- | --- | --- |
| `build` | `scripts/check.mjs`: builds, asserts every expected file, parses the built JS, validates the manifest. With `STRICT=1` (set on `main`) it **blocks while the placeholder takedown email is still in the page**. | `npm run check` |
| `lighthouse` | Lighthouse CI (`lighthouserc.json`): performance >= 0.9; accessibility, best-practices, SEO >= 0.95; PWA >= 0.9; total weight <= 150 KB. | `npm run lhci` |
| `songs` | `scripts/verify-songs.mjs`: every ID exists, is embeddable (oEmbed), no duplicates, exactly one `featured`. | `npm run verify-songs` |
| `smoke` | `scripts/smoke.mjs` against the deployed URL: page, manifest, `sw.js`, icons, hashed JS load; on Netlify it also checks cache and security headers and HTTPS. | `BASE_URL=http://localhost:8090 npm run smoke` |

### One-time setup
1. Install and log in to the GitHub CLI: `brew install gh`, then `gh auth login`.
2. Create the repo: `git init -b main`, commit, then `gh repo create juna-nepali-geet --source=. --push`.
3. Netlify: create a site **without Git** (Add new site > Deploy manually) and copy its **Site ID**; create a **Personal access token** (User settings > Applications).
4. Add both as repository secrets: `gh secret set NETLIFY_AUTH_TOKEN` and `gh secret set NETLIFY_SITE_ID`.
5. Create the `production` environment (Settings > Environments) and, to practise approval gates, add yourself as a required reviewer.
6. Protect `main` (Settings > Branches): require a pull request and the `build` and `lighthouse` status checks.
7. Replace `your-email@example.com` in `src/index.html` before the first production deploy (the strict check enforces it).

PR previews only run for branches in the same repository (forks do not receive secrets). Preview and local hosts skip the visitor counter so they do not change the live count.

### Rolling back
Netlify > Deploys > pick the previous good deploy > **Publish deploy** (instant), or `git revert <commit>` and push to redeploy through the pipeline.

### Practise the failure paths
Use throwaway PRs: a fake video ID in `songs.js` (songs gate fails), a large image (Lighthouse byte budget fails), or leaving the placeholder email on `main` (strict check fails).
