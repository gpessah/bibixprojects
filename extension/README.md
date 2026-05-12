# Bibix LinkedIn AI Booster — Chrome extension

A CommenTron-style Chrome extension that generates LinkedIn comments, replies, and "Top Voice" contributions using your Monday backend's OpenAI integration. All data (settings, generation history) is stored per-user in your existing Monday SQLite database; super admins can view all users' activity from `/marketing/linkedin`.

## What's included

- **Popup** (`popup/`) — three-tab UI (Comment / Reply / Account) matching CommenTron's screenshots: length slider, 12 tones, mention author, emojis, open ended, offer services + industry, reply preferences, and an account/sign-out page.
- **Content script** (`content/`) — injects "✨ AI Comment", "✨ AI Reply" and "✨ AI Perspective" buttons next to LinkedIn's editors. Clicking opens a popover with the generated text + Insert / Regenerate.
- **Background worker** (`background.js`) — handles auth, token storage, and all backend calls.
- **Generated icons** (`icons/*.png`) — produced by `node generate-icons.js` (zero deps).

## Install (developer mode)

1. Make sure your Monday backend is running. From the repo root:
   ```bash
   cd backend && npm start
   ```
2. Make sure `OPENAI_API_KEY` is set in `backend/.env`.
3. Open Chrome → `chrome://extensions` → enable **Developer mode** → click **Load unpacked** → select this `extension/` folder.
4. Click the extension icon → enter your Monday backend URL (default `http://localhost:3001`), your Monday email, and password → **Sign in**.
5. Visit `linkedin.com`. You'll see purple "✨ AI Comment / AI Reply / AI Perspective" buttons next to each comment box.

## What hits the backend

All endpoints live under `/api/linkedin` and require a valid Monday JWT (the same token used by the React app).

| Endpoint | Description |
|---|---|
| `GET /api/linkedin/settings` | Read your per-user settings |
| `PUT /api/linkedin/settings` | Update your per-user settings |
| `POST /api/linkedin/generate-comment` | `{ postText, authorName, postUrl, overrides? }` |
| `POST /api/linkedin/generate-reply` | `{ commentText, commentAuthor, postText, isOwnPost, postUrl }` |
| `POST /api/linkedin/generate-contribution` | `{ topic, perspectiveTitle, postUrl }` |
| `GET /api/linkedin/history` | Per-user history (admins can pass `?as_user=ID`) |
| `DELETE /api/linkedin/history/:id` | Delete a generation |
| `GET /api/linkedin/stats?days=30` | Per-user analytics |
| `GET /api/linkedin/admin/users` | Admin/super-admin roll-up across all users |

## Tables created in the existing SQLite DB

- `linkedin_settings` — one row per user
- `linkedin_generations` — one row per AI generation (comment / reply / contribution)

Both are created lazily by `backend/src/routes/linkedin.js` on first request.

## Dashboard (inside Monday)

Open the app → **Marketing → Social Media → LinkedIn**. You'll see:

- **Dashboard** — total generations, daily activity chart, top tones. Super-admins additionally see a per-user roll-up table and can switch view via the "View as" dropdown.
- **History** — full log with copy / delete / CSV export.
- **Settings** — same controls as the popup, kept in sync.

## Privacy & scope

- The extension only talks to (a) the Monday backend you configured and (b) `linkedin.com` (the content script). No third-party services are contacted from the browser; OpenAI is only called server-side via the existing Monday integration.
- Each user can only see their own `linkedin_generations` rows. The `as_user` query parameter is gated to `admin` / `super_admin` roles.

## Regenerate icons

```bash
node generate-icons.js
```
