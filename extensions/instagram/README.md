# Bibix Instagram Extension

Chrome extension for Instagram engagement (likes, replies, follows, DMs),
follower snapshots, scheduled posts and profile research — synced to the
Bibix backend. This folder is the single source of truth; the version is in
`manifest.json`.

## Install once (per machine)

1. Clone or pull this repo (`git clone https://github.com/gpessah/bibixprojects`).
2. Chrome → `chrome://extensions/` → **Developer mode** on (top-right).
3. **Load unpacked** → select this folder (`extensions/instagram/`).
4. If an older copy of "Instagram Extension" from another folder is still
   listed, **Remove** it first — two copies fight over the same Instagram tab.
5. Pin the icon (puzzle piece → pin).

## Connect to Bibix

1. Bibix → **Settings → Instagram Extension** → **Copy** the token
   (production: `bibix.ailabstech.com`, staging: `staging.bibix.ailabstech.com`).
2. Extension popup → **📡 Sync** → paste into **Production** (or enable
   *Also sync to Staging* and paste there) → **Connect**.
3. The row now reads `Connected as <name> (<email>) ✓` — that is the Bibix
   user this browser acts as. `❌ Token rejected` means the token was
   regenerated in Settings; paste the current one.

## Updating to a new version

```bash
cd <path-to-your-clone>
git pull
```

Then `chrome://extensions/` → find "Instagram Extension" → click ↻ **reload**.
The card shows the new version from `manifest.json`. No re-installing.

## Files

| File              | Role |
|-------------------|------|
| `manifest.json`   | Metadata + permissions. Bump `version` on every release. |
| `popup.html/js`   | Popup UI: engagement actions, accounts, schedule, Sync (tokens). |
| `content.js`      | Runs on instagram.com — likes, replies, follows, scans, scheduling. |
| `background.js`   | Service worker: token storage, backend calls, batch queue, watchdog. |
| `fetch-hook.js`   | Page-context hook that reads Instagram's own API responses. |
| `dashboard.*`, `history.*`, `campaigns.*` | Extension-side pages opened from the popup. |

## Changelog (recent)

* **1.46.0** — fix likes/replies stopping far short of the request on
  comment-heavy posts (e.g. 42/200 on a 286-comment post): the incremental
  loader is now persistent — it keeps clicking "load more" and scrolling until
  new comments actually appear, and only declares the post exhausted after a
  sustained stretch with no button and no growth. Still stops the moment the
  target is reached, so memory stays bounded.
* **1.45.0** — likes/replies load comments incrementally: act on what is on
  screen, click ⊕ "load more" only when out of candidates, stop loading when
  the target is reached (faster start, far less memory than pre-loading 2×).
* **1.44.0** — Sync section shows `Connected as <name> (<email>)` and flags
  rejected tokens on every popup open.
