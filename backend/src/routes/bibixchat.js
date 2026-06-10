// ── BibixChat · HTTP API ──────────────────────────────────────────────────────
// Inbox, subscribers, tags, keyword triggers, Instagram OAuth + webhook, and a
// simulator endpoint to exercise the whole pipeline before Meta credentials exist.
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');
const core = require('../services/bibixchat');
const igAdapter = require('../services/channels/instagram');

const db = core.db;
const router = express.Router();

// Register channel adapters
core.registerAdapter(igAdapter);

// ── Channels ────────────────────────────────────────────────────────────────
router.get('/channels', authenticate, (req, res) => {
  const rows = db.prepare('SELECT id, user_id, type, external_id, name, status, token_expires_at, created_at FROM bc_channels WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.user.id);
  res.json(rows);
});

router.delete('/channels/:id', authenticate, (req, res) => {
  const ch = db.prepare('SELECT * FROM bc_channels WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!ch) return res.status(404).json({ error: 'Channel not found' });
  db.prepare('DELETE FROM bc_channels WHERE id = ?').run(ch.id);
  res.json({ success: true });
});

// ── Instagram OAuth ───────────────────────────────────────────────────────────
// Owner clicks "Connect Instagram" → we redirect to Meta consent.
router.get('/instagram/connect', authenticate, (req, res) => {
  if (!igAdapter.isConfigured()) {
    return res.status(400).json({ error: 'Instagram not configured. Set IG_APP_ID, IG_APP_SECRET, IG_REDIRECT_URI in backend/.env.' });
  }
  // state carries the user id so the callback knows who connected (JWT can't ride the redirect).
  res.json({ url: igAdapter.getAuthUrl(req.user.id) });
});

// Meta redirects here with ?code & ?state — public (no auth header on a browser redirect).
router.get('/instagram/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send('Missing code/state');
    const info = await igAdapter.exchangeCode(code);
    const existing = core.getChannelByExternal('instagram', info.externalId);
    if (existing) {
      db.prepare('UPDATE bc_channels SET access_token = ?, token_expires_at = ?, name = ?, status = ?, meta = ? WHERE id = ?')
        .run(info.accessToken, info.expiresAt, info.name, 'active', JSON.stringify(info.meta || {}), existing.id);
    } else {
      db.prepare(`INSERT INTO bc_channels (id, user_id, type, external_id, name, access_token, token_expires_at, status, meta)
                  VALUES (?, ?, 'instagram', ?, ?, ?, ?, 'active', ?)`)
        .run(uuidv4(), state, info.externalId, info.name, info.accessToken, info.expiresAt, JSON.stringify(info.meta || {}));
    }
    res.send('<html><body style="font-family:sans-serif;padding:40px"><h2>✅ Instagram connected</h2><p>You can close this window and return to BibixChat.</p></body></html>');
  } catch (e) {
    console.error('[BibixChat] IG callback error:', e);
    res.status(500).send('Instagram connection failed: ' + e.message);
  }
});

// ── Instagram webhook (Meta calls these) ──────────────────────────────────────
// GET = verification handshake. POST = inbound messages/comments. Public by design.
router.get('/webhook/instagram', (req, res) => {
  const challenge = igAdapter.verifyWebhook(req.query);
  if (challenge) return res.status(200).send(challenge);
  res.sendStatus(403);
});

router.post('/webhook/instagram', async (req, res) => {
  res.sendStatus(200); // ack fast; Meta retries on non-200
  try {
    const events = igAdapter.parseWebhook(req.body);
    for (const ev of events) {
      await core.ingestInbound({ ...ev, channelType: 'instagram' });
    }
  } catch (e) {
    console.error('[BibixChat] IG webhook processing error:', e);
  }
});

// ── Inbox: conversations list ──────────────────────────────────────────────────
router.get('/conversations', authenticate, (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, s.name AS sub_name, s.username AS sub_username, s.profile_pic AS sub_pic,
           ch.type AS channel_type, ch.name AS channel_name
    FROM bc_conversations c
    JOIN bc_subscribers s ON s.id = c.subscriber_id
    JOIN bc_channels ch   ON ch.id = c.channel_id
    WHERE ch.user_id = ?
    ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
  `).all(req.user.id);
  res.json(rows);
});

// Messages in a conversation
router.get('/conversations/:id/messages', authenticate, (req, res) => {
  const conv = ownedConversation(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  const msgs = db.prepare('SELECT * FROM bc_messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(conv.id);
  // mark read
  db.prepare('UPDATE bc_conversations SET unread_count = 0 WHERE id = ?').run(conv.id);
  res.json(msgs.map(m => ({ ...m, payload: safeParse(m.payload) })));
});

// Human reply
router.post('/conversations/:id/reply', authenticate, async (req, res) => {
  const conv = ownedConversation(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'text required' });
  try {
    const msg = await core.sendOutbound({ conversationId: conv.id, text: text.trim(), sentBy: req.user.id, source: 'human' });
    res.json(msg);
  } catch (e) {
    res.status(502).json({ error: e.message }); // surface Meta 24h-window / opt-in errors
  }
});

// Pause/resume automation (human takeover)
router.put('/conversations/:id', authenticate, (req, res) => {
  const conv = ownedConversation(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  const { automation_paused, status } = req.body;
  db.prepare('UPDATE bc_conversations SET automation_paused = COALESCE(?, automation_paused), status = COALESCE(?, status) WHERE id = ?')
    .run(automation_paused !== undefined ? (automation_paused ? 1 : 0) : null, status || null, conv.id);
  res.json(db.prepare('SELECT * FROM bc_conversations WHERE id = ?').get(conv.id));
});

// ── Tags ────────────────────────────────────────────────────────────────────
router.get('/tags', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM bc_tags WHERE user_id = ? ORDER BY name').all(req.user.id));
});
router.post('/tags', authenticate, (req, res) => {
  const { name, color } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  db.prepare('INSERT INTO bc_tags (id, user_id, name, color) VALUES (?, ?, ?, ?)')
    .run(id, req.user.id, name.trim(), color || '#0073ea');
  res.json(db.prepare('SELECT * FROM bc_tags WHERE id = ?').get(id));
});
router.post('/subscribers/:id/tags/:tagId', authenticate, (req, res) => {
  core.addTag(req.params.id, req.params.tagId);
  res.json({ success: true });
});
router.delete('/subscribers/:id/tags/:tagId', authenticate, (req, res) => {
  db.prepare('DELETE FROM bc_subscriber_tags WHERE subscriber_id = ? AND tag_id = ?').run(req.params.id, req.params.tagId);
  res.json({ success: true });
});

// ── Keyword triggers ──────────────────────────────────────────────────────────
router.get('/keyword-triggers', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM bc_keyword_triggers WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id));
});
router.post('/keyword-triggers', authenticate, (req, res) => {
  const { channel_id, keyword, match_type, reply_text, add_tag_id } = req.body;
  if (!keyword || !keyword.trim()) return res.status(400).json({ error: 'keyword required' });
  const id = uuidv4();
  db.prepare(`INSERT INTO bc_keyword_triggers (id, user_id, channel_id, keyword, match_type, reply_text, add_tag_id)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, req.user.id, channel_id || null, keyword.trim(), match_type || 'contains', reply_text || null, add_tag_id || null);
  res.json(db.prepare('SELECT * FROM bc_keyword_triggers WHERE id = ?').get(id));
});
router.put('/keyword-triggers/:id', authenticate, (req, res) => {
  const trg = db.prepare('SELECT * FROM bc_keyword_triggers WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!trg) return res.status(404).json({ error: 'Not found' });
  const { keyword, match_type, reply_text, add_tag_id, enabled, channel_id } = req.body;
  db.prepare(`UPDATE bc_keyword_triggers SET keyword = COALESCE(?, keyword), match_type = COALESCE(?, match_type),
              reply_text = COALESCE(?, reply_text), add_tag_id = ?, enabled = COALESCE(?, enabled), channel_id = ? WHERE id = ?`)
    .run(keyword || null, match_type || null, reply_text || null,
      add_tag_id !== undefined ? add_tag_id : trg.add_tag_id,
      enabled !== undefined ? (enabled ? 1 : 0) : null,
      channel_id !== undefined ? channel_id : trg.channel_id, trg.id);
  res.json(db.prepare('SELECT * FROM bc_keyword_triggers WHERE id = ?').get(trg.id));
});
router.delete('/keyword-triggers/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM bc_keyword_triggers WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// ── Simulator (dev/testing without Meta) ──────────────────────────────────────
// Creates a fake "simulator" channel + injects an inbound message so you can see
// the inbox, keyword auto-replies and SSE working end-to-end today.
router.post('/simulate/inbound', authenticate, async (req, res) => {
  const { from = 'test_user', name = 'Test User', text = 'hi' } = req.body;
  let channel = core.getChannelByExternal('simulator', 'sim:' + req.user.id);
  if (!channel) {
    const id = uuidv4();
    db.prepare(`INSERT INTO bc_channels (id, user_id, type, external_id, name, status) VALUES (?, ?, 'simulator', ?, 'Simulator', 'active')`)
      .run(id, req.user.id, 'sim:' + req.user.id);
    channel = core.getChannel(id);
  }
  const result = await core.ingestInbound({
    channelType: 'simulator', channelExternalId: channel.external_id,
    senderId: from, senderName: name, text, kind: 'message',
  });
  res.json({ ok: true, conversationId: result && result.conversation.id });
});

// The simulator adapter just records outbound (no external send).
core.registerAdapter({
  type: 'simulator',
  send: async () => ({ externalMid: 'sim-' + uuidv4() }),
});

// ── helpers ────────────────────────────────────────────────────────────────────
function ownedConversation(convId, userId) {
  return db.prepare(`SELECT c.* FROM bc_conversations c JOIN bc_channels ch ON ch.id = c.channel_id
                     WHERE c.id = ? AND ch.user_id = ?`).get(convId, userId);
}
function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }

module.exports = router;
