// ── BibixChat · Instagram channel adapter ─────────────────────────────────────
// Official Meta integration via the "Instagram API with Instagram Login" path
// (no Facebook Page required). Talks to graph.instagram.com server-side.
//
// Env config (set in backend/.env when ready — adapter degrades gracefully if absent):
//   IG_APP_ID                Meta app ID
//   IG_APP_SECRET            Meta app secret
//   IG_REDIRECT_URI          OAuth redirect, e.g. https://yourhost/api/bibixchat/instagram/callback
//   IG_WEBHOOK_VERIFY_TOKEN  arbitrary string you also enter in the Meta webhook config
//   IG_GRAPH_VERSION         optional, defaults to v21.0
//
// Meta rules baked into the product (see send()):
//   • You may only message users who messaged you first.
//   • 24-hour window for free-form replies after the user's last message.
//   • ~200 automated messages/hour per account.
const fetch = require('node-fetch');

const GRAPH = 'https://graph.instagram.com';
const VERSION = process.env.IG_GRAPH_VERSION || 'v21.0';
const SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments',
].join(',');

const type = 'instagram';

function isConfigured() {
  return !!(process.env.IG_APP_ID && process.env.IG_APP_SECRET && process.env.IG_REDIRECT_URI);
}

// ── OAuth: build the consent URL the account owner visits to connect ──────────
function getAuthUrl(state) {
  const p = new URLSearchParams({
    client_id: process.env.IG_APP_ID,
    redirect_uri: process.env.IG_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    state: state || '',
  });
  return `https://www.instagram.com/oauth/authorize?${p.toString()}`;
}

// ── OAuth: exchange the ?code for a long-lived (60-day) access token ──────────
async function exchangeCode(code) {
  // 1) code → short-lived token
  const form = new URLSearchParams({
    client_id: process.env.IG_APP_ID,
    client_secret: process.env.IG_APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: process.env.IG_REDIRECT_URI,
    code,
  });
  const shortRes = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const short = await shortRes.json();
  if (!shortRes.ok || !short.access_token) {
    throw new Error('IG token exchange failed: ' + JSON.stringify(short));
  }

  // 2) short-lived → long-lived (60 days)
  const longRes = await fetch(
    `${GRAPH}/access_token?grant_type=ig_exchange_token` +
    `&client_secret=${process.env.IG_APP_SECRET}&access_token=${short.access_token}`
  );
  const long = await longRes.json();
  const accessToken = long.access_token || short.access_token;
  const expiresIn = long.expires_in || 3600; // seconds

  // 3) fetch the connected account's profile
  const meRes = await fetch(`${GRAPH}/${VERSION}/me?fields=user_id,username,name&access_token=${accessToken}`);
  const me = await meRes.json();

  return {
    accessToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    externalId: String(me.user_id || short.user_id || ''),
    name: me.username || me.name || 'Instagram account',
    meta: me,
  };
}

// ── Refresh a long-lived token before it expires (every ~50 days) ─────────────
async function refreshToken(accessToken) {
  const res = await fetch(
    `${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${accessToken}`
  );
  const data = await res.json();
  if (!data.access_token) throw new Error('IG token refresh failed: ' + JSON.stringify(data));
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + (data.expires_in || 5184000) * 1000).toISOString(),
  };
}

// ── Send a DM. channel = bc_channels row, subscriber = bc_subscribers row ─────
async function send({ channel, subscriber, text }) {
  if (!isConfigured()) throw new Error('Instagram adapter not configured (missing IG_APP_ID/SECRET/REDIRECT_URI)');
  const res = await fetch(`${GRAPH}/${VERSION}/${channel.external_id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: subscriber.external_id },
      message: { text },
      access_token: channel.access_token,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    // Surface Meta's 24h-window / opt-in errors verbatim so the inbox can show them.
    throw new Error('IG send failed: ' + JSON.stringify(data.error || data));
  }
  return { externalMid: data.message_id || null };
}

// ── Webhook verification handshake (GET) ──────────────────────────────────────
function verifyWebhook(query) {
  if (
    query['hub.mode'] === 'subscribe' &&
    query['hub.verify_token'] === process.env.IG_WEBHOOK_VERIFY_TOKEN
  ) {
    return query['hub.challenge'];
  }
  return null;
}

// ── Parse an inbound webhook POST body into normalized inbound events ─────────
// Returns: [{ channelExternalId, senderId, text, externalMid, kind, raw }]
function parseWebhook(body) {
  const events = [];
  if (!body || !Array.isArray(body.entry)) return events;

  for (const entry of body.entry) {
    const channelExternalId = String(entry.id || '');

    // Direct messages
    for (const m of entry.messaging || []) {
      if (m.message && !m.message.is_echo) {
        events.push({
          channelExternalId,
          senderId: String(m.sender && m.sender.id),
          text: m.message.text || '',
          externalMid: m.message.mid || null,
          kind: 'message',
          raw: m,
        });
      }
    }

    // Comments (for comment-to-DM). Delivered under "changes" with field "comments".
    for (const c of entry.changes || []) {
      if (c.field === 'comments' && c.value) {
        events.push({
          channelExternalId,
          senderId: String(c.value.from && c.value.from.id),
          senderUsername: c.value.from && c.value.from.username,
          text: c.value.text || '',
          externalMid: c.value.id || null,
          kind: 'comment',
          raw: c.value,
        });
      }
    }
  }
  return events;
}

module.exports = {
  type,
  isConfigured,
  getAuthUrl,
  exchangeCode,
  refreshToken,
  send,
  verifyWebhook,
  parseWebhook,
};
