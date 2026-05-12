const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const OpenAI = require('openai');

const router = express.Router();

// ── Tables ────────────────────────────────────────────────────────────────────
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS linkedin_settings (
      user_id TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 1,
      comment_length TEXT DEFAULT 'brief',
      tone TEXT DEFAULT 'gracious',
      mention_author INTEGER DEFAULT 0,
      use_emojis INTEGER DEFAULT 0,
      open_ended INTEGER DEFAULT 0,
      offer_services INTEGER DEFAULT 0,
      industry TEXT,
      services_description TEXT,
      reply_keep_short INTEGER DEFAULT 1,
      reply_open_ended INTEGER DEFAULT 0,
      reply_ack_only_own_posts INTEGER DEFAULT 1,
      display_name TEXT,
      headline TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS linkedin_generations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      source_text TEXT,
      author_name TEXT,
      post_url TEXT,
      generated_text TEXT NOT NULL,
      tone TEXT,
      length TEXT,
      options_json TEXT,
      tokens INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_linkedin_generations_user ON linkedin_generations(user_id, created_at DESC);
  `);
} catch (e) { console.error('LinkedIn table init error (non-fatal):', e.message); }

const DEFAULT_SETTINGS = {
  enabled: 1,
  comment_length: 'brief',
  tone: 'gracious',
  mention_author: 0,
  use_emojis: 0,
  open_ended: 0,
  offer_services: 0,
  industry: null,
  services_description: null,
  reply_keep_short: 1,
  reply_open_ended: 0,
  reply_ack_only_own_posts: 1,
  display_name: null,
  headline: null,
};

const VALID_LENGTHS = ['brief', 'medium', 'long'];
const VALID_TONES = [
  'excited', 'happy', 'gracious', 'supportive', 'polite', 'witty',
  'comic', 'respectfully_opposed', 'provocative', 'controversial',
  'disappointed', 'sad',
];

function targetUser(req) {
  const { as_user } = req.query;
  if (as_user && (req.user.role === 'super_admin' || req.user.role === 'admin')) return as_user;
  return req.user.id;
}

function getSettings(userId) {
  const row = db.prepare('SELECT * FROM linkedin_settings WHERE user_id = ?').get(userId);
  if (!row) return { user_id: userId, ...DEFAULT_SETTINGS };
  return row;
}

function upsertSettings(userId, patch) {
  const current = getSettings(userId);
  const merged = { ...current, ...patch, user_id: userId };
  const exists = db.prepare('SELECT 1 FROM linkedin_settings WHERE user_id = ?').get(userId);
  if (exists) {
    db.prepare(`UPDATE linkedin_settings SET
      enabled=?, comment_length=?, tone=?, mention_author=?, use_emojis=?, open_ended=?,
      offer_services=?, industry=?, services_description=?,
      reply_keep_short=?, reply_open_ended=?, reply_ack_only_own_posts=?,
      display_name=?, headline=?, updated_at=CURRENT_TIMESTAMP
      WHERE user_id=?`).run(
      merged.enabled ? 1 : 0, merged.comment_length, merged.tone,
      merged.mention_author ? 1 : 0, merged.use_emojis ? 1 : 0, merged.open_ended ? 1 : 0,
      merged.offer_services ? 1 : 0, merged.industry || null, merged.services_description || null,
      merged.reply_keep_short ? 1 : 0, merged.reply_open_ended ? 1 : 0, merged.reply_ack_only_own_posts ? 1 : 0,
      merged.display_name || null, merged.headline || null,
      userId,
    );
  } else {
    db.prepare(`INSERT INTO linkedin_settings
      (user_id, enabled, comment_length, tone, mention_author, use_emojis, open_ended,
       offer_services, industry, services_description,
       reply_keep_short, reply_open_ended, reply_ack_only_own_posts, display_name, headline)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      userId, merged.enabled ? 1 : 0, merged.comment_length, merged.tone,
      merged.mention_author ? 1 : 0, merged.use_emojis ? 1 : 0, merged.open_ended ? 1 : 0,
      merged.offer_services ? 1 : 0, merged.industry || null, merged.services_description || null,
      merged.reply_keep_short ? 1 : 0, merged.reply_open_ended ? 1 : 0, merged.reply_ack_only_own_posts ? 1 : 0,
      merged.display_name || null, merged.headline || null,
    );
  }
  return getSettings(userId);
}

// ── Settings ──────────────────────────────────────────────────────────────────
router.get('/settings', authenticate, (req, res) => {
  res.json(getSettings(targetUser(req)));
});

router.put('/settings', authenticate, (req, res) => {
  const allowed = [
    'enabled', 'comment_length', 'tone', 'mention_author', 'use_emojis', 'open_ended',
    'offer_services', 'industry', 'services_description',
    'reply_keep_short', 'reply_open_ended', 'reply_ack_only_own_posts',
    'display_name', 'headline',
  ];
  const patch = {};
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
  if (patch.comment_length && !VALID_LENGTHS.includes(patch.comment_length)) {
    return res.status(400).json({ error: 'invalid comment_length' });
  }
  if (patch.tone && !VALID_TONES.includes(patch.tone)) {
    return res.status(400).json({ error: 'invalid tone' });
  }
  res.json(upsertSettings(req.user.id, patch));
});

// ── AI generation ─────────────────────────────────────────────────────────────
function openai() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured on server');
  return new OpenAI({ apiKey });
}

const LENGTH_GUIDE = {
  brief: 'one short sentence (under 20 words)',
  medium: 'two to three sentences (40-70 words)',
  long: 'a short paragraph (80-150 words)',
};

const TONE_GUIDE = {
  excited: 'enthusiastic and energetic',
  happy: 'warm and cheerful',
  gracious: 'gracious and appreciative',
  supportive: 'encouraging and supportive',
  polite: 'polite and respectful',
  witty: 'clever and lightly humorous',
  comic: 'playful and funny',
  respectfully_opposed: 'respectfully disagreeing with a counterpoint',
  provocative: 'thought-provoking, challenging the reader',
  controversial: 'taking a bold contrarian position',
  disappointed: 'expressing measured disappointment',
  sad: 'somber and empathetic',
};

function buildCommentPrompt(opts) {
  const {
    postText, authorName, tone, length, mentionAuthor, useEmojis, openEnded,
    offerServices, industry, servicesDescription, displayName, headline,
  } = opts;

  const lines = [
    'You are an expert LinkedIn engagement assistant. Write a comment to leave under the following LinkedIn post.',
    '',
    'LANGUAGE: Detect the language of the POST BODY ONLY (the quoted post text below) and write your comment in that language. Ignore any UI labels, author name, or other surrounding text — they may be in a different language than the post itself. If the post body is empty or unclear, default to English.',
    `LENGTH: ${LENGTH_GUIDE[length] || LENGTH_GUIDE.brief}.`,
    `TONE: ${TONE_GUIDE[tone] || TONE_GUIDE.gracious}.`,
  ];
  if (mentionAuthor && authorName) lines.push(`Address the author by first name ("${authorName.split(' ')[0]}").`);
  if (useEmojis) lines.push('Include 1–2 tasteful emojis where natural.');
  else lines.push('Do NOT use emojis.');
  if (openEnded) lines.push('End with an open-ended question to invite replies.');
  if (offerServices) {
    const who = displayName ? `I am ${displayName}${headline ? `, ${headline}` : ''}.` : '';
    const what = servicesDescription ? `My services: ${servicesDescription}.` : (industry ? `I work in ${industry}.` : '');
    lines.push(`Subtly mention that I can help — ${who} ${what} Keep the pitch soft and contextual, not salesy.`.trim());
  }
  lines.push('');
  lines.push('Sound like a real person, not an AI. Avoid generic phrases like "Great post!" or "Thanks for sharing!". No hashtags. No quotes around the output.');
  lines.push('');
  lines.push(`POST${authorName ? ` BY ${authorName}` : ''}:`);
  lines.push('"""');
  lines.push(postText || '(no post text provided)');
  lines.push('"""');
  lines.push('');
  lines.push('Return ONLY the comment text, nothing else.');
  return lines.join('\n');
}

function buildReplyPrompt(opts) {
  const {
    commentText, commentAuthor, postText, isOwnPost, settings,
  } = opts;
  const tone = settings.tone || 'gracious';
  const length = settings.reply_keep_short ? 'brief' : (settings.comment_length || 'brief');

  if (isOwnPost && settings.reply_ack_only_own_posts) {
    return [
      'You are replying as the original author of a LinkedIn post to a commenter.',
      'LANGUAGE: Detect the language of the COMMENT TEXT ONLY (the quoted block below) and reply in that language. Ignore UI labels or author info that may be in a different language. If the comment is unclear, default to English.',
      `TONE: ${TONE_GUIDE[tone] || TONE_GUIDE.gracious}.`,
      'Keep it to a short acknowledgement — thank or react to the commenter\'s point in 1 sentence. Do not restate the original post.',
      commentAuthor ? `Commenter first name: "${commentAuthor.split(' ')[0]}".` : '',
      '',
      `COMMENT TO REPLY TO:`,
      '"""',
      commentText || '',
      '"""',
      '',
      'Return ONLY the reply text.',
    ].filter(Boolean).join('\n');
  }

  return [
    'You are replying on LinkedIn to a comment under someone else\'s post.',
    'LANGUAGE: Detect the language of the COMMENT TEXT ONLY (the quoted block below) and reply in that language. Ignore UI labels or author info. If unclear, default to English.',
    `LENGTH: ${LENGTH_GUIDE[length] || LENGTH_GUIDE.brief}.`,
    `TONE: ${TONE_GUIDE[tone] || TONE_GUIDE.gracious}.`,
    settings.reply_open_ended ? 'End with an open-ended question.' : '',
    'Sound like a real human. No hashtags, no quotes.',
    '',
    postText ? `ORIGINAL POST:\n"""\n${postText}\n"""\n` : '',
    `COMMENT TO REPLY TO${commentAuthor ? ` (by ${commentAuthor})` : ''}:`,
    '"""',
    commentText || '',
    '"""',
    '',
    'Return ONLY the reply text.',
  ].filter(Boolean).join('\n');
}

function buildContributionPrompt(opts) {
  const { topic, perspectiveTitle, settings } = opts;
  return [
    'You are writing a LinkedIn "Add your perspective" contribution to a collaborative article — these contributions help earn the "Top Voice" badge.',
    'LANGUAGE: Auto-detect the article topic/prompt language and write in the SAME language.',
    'LENGTH: 350–600 characters (target ~450). Must fit under 750 characters.',
    `TONE: ${TONE_GUIDE[settings.tone] || TONE_GUIDE.gracious}, but professional and insight-rich.`,
    'Structure: open with a 2–4 word hook on a single line, then a substantive insight that adds practical value beyond restating the prompt. Mention a specific example, mechanism, or number if natural.',
    settings.use_emojis ? 'You may use one emoji.' : 'Do not use emojis.',
    'No hashtags. No "great question". No quotes.',
    '',
    perspectiveTitle ? `PROMPT/PERSPECTIVE TITLE: "${perspectiveTitle}"` : '',
    topic ? `ARTICLE TOPIC: "${topic}"` : '',
    '',
    'Return ONLY the contribution text.',
  ].filter(Boolean).join('\n');
}

async function runCompletion(prompt) {
  const client = openai();
  const r = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.85,
    max_tokens: 600,
  });
  const text = ((r.choices[0] && r.choices[0].message && r.choices[0].message.content) || '').trim();
  const tokens = (r.usage && r.usage.total_tokens) || null;
  return { text: text.replace(/^["']|["']$/g, ''), tokens };
}

function logGeneration({ userId, kind, sourceText, authorName, postUrl, generatedText, tone, length, options, tokens }) {
  const id = uuidv4();
  db.prepare(`INSERT INTO linkedin_generations
    (id, user_id, kind, source_text, author_name, post_url, generated_text, tone, length, options_json, tokens)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, kind, sourceText || null, authorName || null, postUrl || null,
    generatedText, tone || null, length || null,
    options ? JSON.stringify(options) : null, tokens || null,
  );
  return id;
}

router.post('/generate-comment', authenticate, async (req, res) => {
  try {
    const settings = getSettings(req.user.id);
    if (!settings.enabled) return res.status(403).json({ error: 'LinkedIn assistant disabled in your settings' });
    const { postText, authorName, postUrl, overrides, imageDescription } = req.body || {};
    // Allow image-only / caption-less posts — we'll generate using author + image context.
    const hasText = postText && postText.trim();
    const hasContext = hasText || imageDescription || authorName;
    if (!hasContext) return res.status(400).json({ error: 'No post content to comment on' });

    const o = overrides || {};
    const tone = o.tone || settings.tone;
    const length = o.comment_length || settings.comment_length;
    const effectivePostText = hasText
      ? postText
      : imageDescription
        ? `[Image-only post${imageDescription ? ' — image shows: ' + imageDescription : ''}]`
        : `[Image-only post by ${authorName || 'this person'} with no caption]`;
    const promptOpts = {
      postText: effectivePostText, authorName,
      tone, length,
      mentionAuthor: 'mention_author' in o ? !!o.mention_author : !!settings.mention_author,
      useEmojis:     'use_emojis'     in o ? !!o.use_emojis     : !!settings.use_emojis,
      openEnded:     'open_ended'     in o ? !!o.open_ended     : !!settings.open_ended,
      offerServices: 'offer_services' in o ? !!o.offer_services : !!settings.offer_services,
      industry: o.industry || settings.industry,
      servicesDescription: o.services_description || settings.services_description,
      displayName: settings.display_name,
      headline: settings.headline,
    };
    const prompt = buildCommentPrompt(promptOpts);
    const { text, tokens } = await runCompletion(prompt);
    const id = logGeneration({
      userId: req.user.id, kind: 'comment',
      sourceText: postText, authorName, postUrl,
      generatedText: text, tone, length, options: promptOpts, tokens,
    });
    res.json({ id, text, tone, length });
  } catch (e) { console.error('[LinkedIn] comment error:', e); res.status(500).json({ error: e.message }); }
});

router.post('/generate-reply', authenticate, async (req, res) => {
  try {
    const settings = getSettings(req.user.id);
    if (!settings.enabled) return res.status(403).json({ error: 'LinkedIn assistant disabled in your settings' });
    const { commentText, commentAuthor, postText, isOwnPost, postUrl } = req.body || {};
    if (!commentText || !commentText.trim()) return res.status(400).json({ error: 'commentText required' });

    const prompt = buildReplyPrompt({ commentText, commentAuthor, postText, isOwnPost: !!isOwnPost, settings });
    const { text, tokens } = await runCompletion(prompt);
    const id = logGeneration({
      userId: req.user.id, kind: 'reply',
      sourceText: commentText, authorName: commentAuthor, postUrl,
      generatedText: text, tone: settings.tone,
      length: settings.reply_keep_short ? 'brief' : settings.comment_length,
      options: { isOwnPost: !!isOwnPost }, tokens,
    });
    res.json({ id, text });
  } catch (e) { console.error('[LinkedIn] reply error:', e); res.status(500).json({ error: e.message }); }
});

router.post('/generate-contribution', authenticate, async (req, res) => {
  try {
    const settings = getSettings(req.user.id);
    if (!settings.enabled) return res.status(403).json({ error: 'LinkedIn assistant disabled in your settings' });
    const { topic, perspectiveTitle, postUrl } = req.body || {};
    if (!topic && !perspectiveTitle) return res.status(400).json({ error: 'topic or perspectiveTitle required' });

    const prompt = buildContributionPrompt({ topic, perspectiveTitle, settings });
    const { text, tokens } = await runCompletion(prompt);
    const id = logGeneration({
      userId: req.user.id, kind: 'contribution',
      sourceText: perspectiveTitle || topic, postUrl,
      generatedText: text, tone: settings.tone, length: 'contribution',
      options: { topic, perspectiveTitle }, tokens,
    });
    res.json({ id, text });
  } catch (e) { console.error('[LinkedIn] contribution error:', e); res.status(500).json({ error: e.message }); }
});

// ── History ───────────────────────────────────────────────────────────────────
router.get('/history', authenticate, (req, res) => {
  const uid = targetUser(req);
  const { kind, limit = 200, offset = 0 } = req.query;
  let q = 'SELECT * FROM linkedin_generations WHERE user_id = ?';
  const params = [uid];
  if (kind) { q += ' AND kind = ?'; params.push(kind); }
  q += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));
  res.json(db.prepare(q).all(...params));
});

router.delete('/history/:id', authenticate, (req, res) => {
  const row = db.prepare('SELECT user_id FROM linkedin_generations WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const isAdmin = req.user.role === 'super_admin' || req.user.role === 'admin';
  if (row.user_id !== req.user.id && !isAdmin) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM linkedin_generations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get('/stats', authenticate, (req, res) => {
  const uid = targetUser(req);
  const { days = 30 } = req.query;
  const since = `datetime('now', '-${Number(days)} days')`;

  const total  = db.prepare(`SELECT COUNT(*) as n FROM linkedin_generations WHERE user_id = ? AND datetime(created_at) >= ${since}`).get(uid).n;
  const byKind = db.prepare(`SELECT kind, COUNT(*) as n FROM linkedin_generations WHERE user_id = ? AND datetime(created_at) >= ${since} GROUP BY kind`).all(uid);
  const byTone = db.prepare(`SELECT tone, COUNT(*) as n FROM linkedin_generations WHERE user_id = ? AND tone IS NOT NULL AND datetime(created_at) >= ${since} GROUP BY tone ORDER BY n DESC`).all(uid);
  const daily  = db.prepare(`SELECT date(created_at) as day, kind, COUNT(*) as n FROM linkedin_generations WHERE user_id = ? AND datetime(created_at) >= ${since} GROUP BY day, kind ORDER BY day ASC`).all(uid);
  const tokens = db.prepare(`SELECT COALESCE(SUM(tokens),0) as n FROM linkedin_generations WHERE user_id = ? AND datetime(created_at) >= ${since}`).get(uid).n;

  res.json({ total, byKind, byTone, daily, tokens });
});

// ── Admin: per-user roll-up ───────────────────────────────────────────────────
router.get('/admin/users', authenticate, (req, res) => {
  if (req.user.role !== 'super_admin' && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const users = db.prepare(`
    SELECT u.id, u.name, u.email,
      (SELECT COUNT(*) FROM linkedin_generations g WHERE g.user_id = u.id) as total_generations,
      (SELECT COUNT(*) FROM linkedin_generations g WHERE g.user_id = u.id AND g.kind = 'comment') as comments,
      (SELECT COUNT(*) FROM linkedin_generations g WHERE g.user_id = u.id AND g.kind = 'reply') as replies,
      (SELECT COUNT(*) FROM linkedin_generations g WHERE g.user_id = u.id AND g.kind = 'contribution') as contributions,
      (SELECT MAX(created_at) FROM linkedin_generations g WHERE g.user_id = u.id) as last_generation
    FROM users u ORDER BY total_generations DESC
  `).all();
  res.json(users);
});

// ── Meta (for extension dropdowns) ────────────────────────────────────────────
router.get('/meta', authenticate, (_req, res) => {
  res.json({
    lengths: VALID_LENGTHS,
    tones: VALID_TONES,
  });
});

module.exports = router;
