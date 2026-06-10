// ── BibixChat · core engine ───────────────────────────────────────────────────
// Channel-agnostic chat-marketing core (the "ManyChat" brain):
//   • subscribers / tags / conversations / messages  (the audience + inbox)
//   • keyword triggers                                (auto-reply rules)
//   • adapter registry                                (instagram, telegram, …)
//
// Adapters implement: send({ channel, subscriber, text }) -> { externalMid }
// Inbound events from any channel funnel through ingestInbound().
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { emit } = require('../sse');

// ── Schema (self-contained, like the instagram/automations routes) ────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS bc_channels (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,                 -- instagram | telegram
    external_id TEXT,                   -- IG user id / bot id
    name TEXT,                          -- handle / display
    access_token TEXT,
    token_expires_at DATETIME,
    status TEXT DEFAULT 'active',
    meta TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(type, external_id)
  );
  CREATE TABLE IF NOT EXISTS bc_subscribers (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    external_id TEXT NOT NULL,          -- IG-scoped id / chat_id
    name TEXT,
    username TEXT,
    profile_pic TEXT,
    custom_fields TEXT DEFAULT '{}',
    last_inbound_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(channel_id, external_id)
  );
  CREATE TABLE IF NOT EXISTS bc_tags (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#0073ea',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS bc_subscriber_tags (
    subscriber_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (subscriber_id, tag_id)
  );
  CREATE TABLE IF NOT EXISTS bc_conversations (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    subscriber_id TEXT NOT NULL,
    status TEXT DEFAULT 'open',         -- open | closed
    automation_paused INTEGER DEFAULT 0,-- human takeover toggle
    last_message_at DATETIME,
    last_message_preview TEXT,
    unread_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(channel_id, subscriber_id)
  );
  CREATE TABLE IF NOT EXISTS bc_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    direction TEXT NOT NULL,            -- in | out
    kind TEXT DEFAULT 'message',        -- message | comment
    text TEXT,
    payload TEXT DEFAULT '{}',
    external_mid TEXT,
    sent_by TEXT,                       -- user id for human/auto replies; null for inbound
    source TEXT,                        -- keyword | human | flow | comment
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS bc_keyword_triggers (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    channel_id TEXT,                    -- null = applies to all channels of the user
    keyword TEXT NOT NULL,
    match_type TEXT DEFAULT 'contains', -- exact | contains | starts
    reply_text TEXT,
    add_tag_id TEXT,
    enabled INTEGER DEFAULT 1,
    hits INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Adapter registry ──────────────────────────────────────────────────────────
const adapters = {};
function registerAdapter(adapter) { adapters[adapter.type] = adapter; }
function getAdapter(type) { return adapters[type]; }

// ── Helpers ────────────────────────────────────────────────────────────────────
function getChannel(id) { return db.prepare('SELECT * FROM bc_channels WHERE id = ?').get(id); }
function getChannelByExternal(type, externalId) {
  return db.prepare('SELECT * FROM bc_channels WHERE type = ? AND external_id = ?').get(type, externalId);
}

function upsertSubscriber(channelId, externalId, { name, username, profilePic } = {}) {
  let sub = db.prepare('SELECT * FROM bc_subscribers WHERE channel_id = ? AND external_id = ?')
    .get(channelId, externalId);
  if (sub) {
    db.prepare(`UPDATE bc_subscribers SET name = COALESCE(?, name), username = COALESCE(?, username),
                profile_pic = COALESCE(?, profile_pic), last_inbound_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(name || null, username || null, profilePic || null, sub.id);
    return db.prepare('SELECT * FROM bc_subscribers WHERE id = ?').get(sub.id);
  }
  const id = uuidv4();
  db.prepare(`INSERT INTO bc_subscribers (id, channel_id, external_id, name, username, profile_pic, last_inbound_at)
              VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
    .run(id, channelId, externalId, name || null, username || null, profilePic || null);
  return db.prepare('SELECT * FROM bc_subscribers WHERE id = ?').get(id);
}

function upsertConversation(channelId, subscriberId) {
  let conv = db.prepare('SELECT * FROM bc_conversations WHERE channel_id = ? AND subscriber_id = ?')
    .get(channelId, subscriberId);
  if (conv) return conv;
  const id = uuidv4();
  db.prepare('INSERT INTO bc_conversations (id, channel_id, subscriber_id) VALUES (?, ?, ?)')
    .run(id, channelId, subscriberId);
  return db.prepare('SELECT * FROM bc_conversations WHERE id = ?').get(id);
}

function recordMessage(conversationId, { direction, kind, text, payload, externalMid, sentBy, source }) {
  const id = uuidv4();
  db.prepare(`INSERT INTO bc_messages (id, conversation_id, direction, kind, text, payload, external_mid, sent_by, source)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, conversationId, direction, kind || 'message', text || '',
      JSON.stringify(payload || {}), externalMid || null, sentBy || null, source || null);
  const preview = (text || '').slice(0, 120);
  db.prepare(`UPDATE bc_conversations SET last_message_at = CURRENT_TIMESTAMP, last_message_preview = ?,
              unread_count = unread_count + ? WHERE id = ?`)
    .run(preview, direction === 'in' ? 1 : 0, conversationId);
  return db.prepare('SELECT * FROM bc_messages WHERE id = ?').get(id);
}

function addTag(subscriberId, tagId) {
  try { db.prepare('INSERT INTO bc_subscriber_tags (subscriber_id, tag_id) VALUES (?, ?)').run(subscriberId, tagId); }
  catch (_) { /* already tagged */ }
}

// ── Keyword trigger evaluation ─────────────────────────────────────────────────
function matchKeyword(text, keyword, matchType) {
  const t = (text || '').toLowerCase().trim();
  const k = (keyword || '').toLowerCase().trim();
  if (!k) return false;
  if (matchType === 'exact') return t === k;
  if (matchType === 'starts') return t.startsWith(k);
  return t.includes(k); // contains (default)
}

async function runKeywordTriggers({ channel, conversation, subscriber, text }) {
  const triggers = db.prepare(
    `SELECT * FROM bc_keyword_triggers WHERE user_id = ? AND enabled = 1
       AND (channel_id IS NULL OR channel_id = ?) ORDER BY created_at ASC`
  ).all(channel.user_id, channel.id);

  for (const trg of triggers) {
    if (!matchKeyword(text, trg.keyword, trg.match_type)) continue;
    db.prepare('UPDATE bc_keyword_triggers SET hits = hits + 1 WHERE id = ?').run(trg.id);
    if (trg.add_tag_id) addTag(subscriber.id, trg.add_tag_id);
    if (trg.reply_text && !conversation.automation_paused) {
      await sendOutbound({
        conversationId: conversation.id,
        text: trg.reply_text,
        source: 'keyword',
      }).catch(err => console.error('[BibixChat] keyword reply failed:', err.message));
    }
    break; // first matching trigger wins
  }
}

// ── Inbound: every channel funnels here ────────────────────────────────────────
// evt: { channelExternalId, channelType, senderId, senderUsername, text, externalMid, kind, raw }
async function ingestInbound(evt) {
  const channel = getChannelByExternal(evt.channelType, evt.channelExternalId);
  if (!channel) {
    console.warn('[BibixChat] inbound for unknown channel', evt.channelType, evt.channelExternalId);
    return null;
  }
  const subscriber = upsertSubscriber(channel.id, evt.senderId, {
    username: evt.senderUsername, name: evt.senderName,
  });
  const conversation = upsertConversation(channel.id, subscriber.id);
  const message = recordMessage(conversation.id, {
    direction: 'in', kind: evt.kind || 'message', text: evt.text,
    externalMid: evt.externalMid, payload: evt.raw, source: evt.kind,
  });

  emit(channel.user_id, 'bc:message', {
    conversationId: conversation.id, direction: 'in', message,
    subscriber, channelId: channel.id,
  });

  await runKeywordTriggers({ channel, conversation, subscriber, text: evt.text });
  return { channel, subscriber, conversation, message };
}

// ── Outbound: send a reply through the conversation's channel ──────────────────
async function sendOutbound({ conversationId, text, sentBy, source }) {
  const conversation = db.prepare('SELECT * FROM bc_conversations WHERE id = ?').get(conversationId);
  if (!conversation) throw new Error('Conversation not found');
  const channel = getChannel(conversation.channel_id);
  const subscriber = db.prepare('SELECT * FROM bc_subscribers WHERE id = ?').get(conversation.subscriber_id);
  const adapter = getAdapter(channel.type);
  if (!adapter) throw new Error('No adapter for channel type ' + channel.type);

  const result = await adapter.send({ channel, subscriber, text });
  const message = recordMessage(conversationId, {
    direction: 'out', text, externalMid: result && result.externalMid,
    sentBy, source: source || (sentBy ? 'human' : 'flow'),
  });
  emit(channel.user_id, 'bc:message', {
    conversationId, direction: 'out', message, channelId: channel.id,
  });
  return message;
}

module.exports = {
  db,
  registerAdapter, getAdapter,
  getChannel, getChannelByExternal,
  upsertSubscriber, upsertConversation, recordMessage, addTag,
  ingestInbound, sendOutbound, runKeywordTriggers,
};
