# Bibix TikTok Extension

Chrome extension for manual + (later) automated engagement on TikTok, synced
to the Bibix backend.

## Install once (per machine)

1. Clone or pull this repo — this folder (`extensions/tiktok/`) is the
   extension source.
2. Open Chrome: `chrome://extensions/`
3. Toggle **Developer mode** on (top-right).
4. Click **Load unpacked** → select this folder (`extensions/tiktok/`).
5. The extension card appears with version from `manifest.json`.
6. Click the puzzle-piece icon in Chrome's toolbar → pin the extension.

## First-time setup

1. Click the extension icon → popup opens.
2. In Monday (`staging.bibix.ailabstech.com`) → **Settings → Instagram
   Extension** section → copy your API token.
3. Paste into the popup's "API Token" field → **Save token**.
4. The popup header should now show `Env: staging  ·  Token: ✓ set`.

## Updating to a new version

When a new version ships:

```bash
cd <path-to-your-clone>
git pull
```

Then in Chrome:

1. Open `chrome://extensions/`
2. Find "Bibix TikTok Extension"
3. Click the ↻ **reload** icon on the card (rightmost icon).

That's it. No re-installing, no re-selecting the folder. The extension picks
up the new code immediately.

## Files

| File            | Role |
|-----------------|------|
| `manifest.json` | Extension metadata + permissions. Bump `version` on every release. |
| `popup.html`    | Popup UI shown when the extension icon is clicked. |
| `popup.js`      | Popup logic — reads inputs, sends messages to the active tab. |
| `content.js`    | Runs on `tiktok.com` pages. Handles like / reply / advance actions. |
| `background.js` | Service worker. Holds API token, proxies backend calls. |
| `icon.png`      | Extension icon shared across the 16/48/128 sizes. |

## Troubleshooting

* Popup says **Token: missing** → set the token in the popup.
* Popup says **⚠ Open tiktok.com first** → the active tab isn't a TikTok
  URL. Open TikTok in the same tab before clicking Like/Reply.
* Popup status shows **⚠ Click didn't register** → TikTok's React handler
  didn't accept our synthetic click. The extension tries 3 fallbacks
  (L keyboard shortcut → button click → double-tap video) — if all fail,
  TikTok's anti-bot is rejecting untrusted events. Requires
  `chrome.debugger` API to escalate (bigger feature bump).
* Nothing loads at all → open the TikTok tab's DevTools console
  (right-click → Inspect → Console) and look for `[BibixTikTok]` logs.
  Paste them into Bibix chat to diagnose.
