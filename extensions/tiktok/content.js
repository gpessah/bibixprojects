// Content script for TikTok — comment engagement.
//
// v2 (renamed pattern): mirrors what the Instagram extension does — the
// user opens a video's comment panel, then the popup fires "like N comments"
// or "reply to N comments" against THIS video's comments (not the feed).
//
// Runs on every tiktok.com page. Listens for:
//   TIKTOK_LIKE  — like N comments in the current video's comment panel
//   TIKTOK_REPLY — reply to N comments (optional AI)
//   TIKTOK_STOP  — abort any in-flight run
//
// Every action POSTs to /api/tiktok/actions via background.js so the backend
// records it. Failures log but don't stop the run.

console.log('✅ Bibix TikTok content.js loaded');

let STOP = false;

// ── Helpers ─────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand  = (max) => Math.floor(Math.random() * max);
const pick  = (arr) => arr[rand(arr.length)];

function progress(text) {
  console.log(`[BibixTikTok] ${text}`);
  chrome.runtime.sendMessage({ type: 'TIKTOK_PROGRESS', text }).catch(() => {});
}
function done(summary) {
  chrome.runtime.sendMessage({ type: 'TIKTOK_DONE', summary }).catch(() => {});
}

// Realistic pointer + mouse + click sequence — plain el.click() often does
// nothing on TikTok because their React synthetic-event system rejects it.
function humanClick(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };
  try {
    el.dispatchEvent(new PointerEvent('pointerover', { ...opts, pointerType: 'mouse' }));
    el.dispatchEvent(new PointerEvent('pointerenter', { ...opts, pointerType: 'mouse' }));
    el.dispatchEvent(new PointerEvent('pointerdown',  { ...opts, pointerType: 'mouse' }));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup',   { ...opts, pointerType: 'mouse' }));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
    if (typeof el.click === 'function') el.click();
    return true;
  } catch (_) {
    try { el.click(); return true; } catch (_) { return false; }
  }
}

// ── Current video context ──────────────────────────────────────────────────
function getVideoUrl() { return window.location.href; }
function getVideoAuthor() {
  const m = window.location.pathname.match(/^\/@([\w.]+)\/video\//);
  return m ? m[1] : null;
}

// ── Comment panel discovery ────────────────────────────────────────────────
// TikTok renders each comment as a container with data-e2e="comment-item"
// (or a variation). Inside each: username link, text, and a heart icon with
// data-e2e="comment-like-icon" (unliked → outline; liked → filled TikTok red).
function findCommentItems() {
  return Array.from(document.querySelectorAll(
    '[data-e2e="comment-item"], [data-e2e*="comment-level-1"], [data-e2e*="comment-list-item"], div[class*="DivCommentItem"]'
  ));
}

// The heart button inside one comment item.
function findCommentLikeBtn(item) {
  const anchors = [
    '[data-e2e="comment-like-icon"]',
    '[data-e2e*="like"]',
    'svg[aria-label*="like" i]',
    'span[aria-label*="like" i]',
  ];
  for (const s of anchors) {
    const el = item.querySelector(s);
    if (!el) continue;
    return el.closest('button, [role="button"], span, div') || el.parentElement;
  }
  return null;
}

// The @username of the comment author.
function findCommentAuthor(item) {
  const link = item.querySelector('a[href^="/@"]');
  if (!link) return null;
  const m = link.getAttribute('href').match(/\/@([\w.]+)/);
  return m ? m[1] : null;
}

// The comment text (for AI context).
function findCommentText(item) {
  // The text usually lives in [data-e2e="comment-text"] OR the first p/span
  // that isn't the username.
  const el = item.querySelector('[data-e2e="comment-level-1"] p, [data-e2e*="comment-text"], p, span');
  return (el && el.innerText || '').trim().slice(0, 300);
}

// Is this comment already liked? Check the heart's fill or aria-pressed.
function isCommentLiked(item) {
  const btn = findCommentLikeBtn(item);
  if (!btn) return false;
  if (btn.getAttribute('aria-pressed') === 'true') return true;
  const svg = btn.querySelector('svg');
  if (svg) {
    const readFill = (el) => (el && (el.getAttribute('fill') || (el.style && el.style.fill) || '')).toString().toLowerCase().replace('#', '').trim();
    const isRed = (f) => /^(fe2c55|ff0050|ff004[0-9a-f]|e91e63)/.test(f);
    if (isRed(readFill(svg))) return true;
    const path = svg.querySelector('path[fill]');
    if (path && isRed(readFill(path))) return true;
  }
  const cls = ' ' + ((btn.className || '').toString().toLowerCase()) + ' ';
  if (/[\s\-_](liked)[\s\-_]/.test(cls)) return true;
  return false;
}

// ── Comment panel: scroll to load more ──────────────────────────────────────
// TikTok lazy-loads more comments as you scroll the panel. This helper
// scrolls the panel to the bottom and waits for new items to render.
async function scrollCommentPanel() {
  // Try to find the scrollable panel: an ancestor of a comment-item that
  // has overflow-y: scroll/auto.
  const items = findCommentItems();
  let panel = null;
  if (items.length > 0) {
    let el = items[0].parentElement;
    while (el && el !== document.body) {
      const cs = getComputedStyle(el);
      if ((cs.overflowY === 'scroll' || cs.overflowY === 'auto') && el.scrollHeight > el.clientHeight + 10) {
        panel = el;
        break;
      }
      el = el.parentElement;
    }
  }
  if (!panel) return false;
  panel.scrollTop = panel.scrollHeight;
  return true;
}

// ── Ensure comment panel is open ───────────────────────────────────────────
// On a video page, TikTok shows comments in a side panel by default. On the
// feed, we need to click the comment icon to open the panel first.
async function ensureCommentsOpen() {
  if (findCommentItems().length > 0) return true;
  // Click the video's comment icon.
  const btn = document.querySelector('[data-e2e="comment-icon"], [data-e2e="browse-comment-icon"], button[aria-label*="Comment" i]');
  if (!btn) return false;
  humanClick(btn.closest('button, [role="button"]') || btn);
  // Wait up to 4s for comments to render.
  for (let i = 0; i < 8; i++) {
    await sleep(500);
    if (findCommentItems().length > 0) return true;
  }
  return false;
}

// ── Save action to backend ─────────────────────────────────────────────────
function saveAction(payload) {
  chrome.runtime.sendMessage({ action: 'BIBIX_TIKTOK_SAVE', payload }).catch(() => {});
}

// ── Like N comments on the current video ───────────────────────────────────
async function handleLike(count) {
  STOP = false;
  progress(`Liking up to ${count} comments on this video…`);
  progress(`  · Video: ${getVideoUrl()}`);

  const opened = await ensureCommentsOpen();
  if (!opened) {
    progress(`⚠ Couldn't open comments panel — abort.`);
    done('failed');
    return;
  }

  const seenAuthors = new Set();  // dedup — one like per author per run
  let liked = 0, skipped = 0, alreadyLiked = 0;

  while (liked < count) {
    if (STOP) { progress('Stopped.'); break; }

    // Grab all currently rendered comments; pick the next one we haven't
    // engaged with in this run.
    const items = findCommentItems();
    const targets = items.filter(item => {
      const author = findCommentAuthor(item);
      if (!author || seenAuthors.has(author)) return false;
      return !isCommentLiked(item);
    });

    if (targets.length === 0) {
      // Try to load more.
      progress(`  · No fresh unliked comments visible — scrolling…`);
      const scrolled = await scrollCommentPanel();
      await sleep(1500 + rand(400));
      if (!scrolled) { progress(`⚠ Can't scroll comments — reached the end.`); break; }
      if (findCommentItems().length === items.length) {
        skipped++;
        if (skipped >= 3) { progress(`⚠ No new comments after 3 scrolls — end of feed.`); break; }
        continue;
      }
      skipped = 0;
      continue;
    }

    const item = targets[0];
    const author = findCommentAuthor(item);
    seenAuthors.add(author);

    const btn = findCommentLikeBtn(item);
    if (!btn) { progress(`  · No like button on comment by @${author} — skip.`); continue; }
    btn.scrollIntoView({ block: 'center' });
    await sleep(150);
    humanClick(btn);

    // Verification note: TikTok re-renders comment items after a like,
    // which invalidates the `item` reference. Rather than trying to
    // chase the re-render (fragile), we do a brief "did state change on
    // the CURRENT element for this author?" check by finding the comment
    // item afresh by author + looking at its heart. If we can't find it
    // (it scrolled off / got recycled), we optimistically count success
    // since the click didn't throw.
    await sleep(400);
    let confirmed = true; // optimistic default
    const freshItems = findCommentItems();
    const stillUnliked = freshItems.find(it => findCommentAuthor(it) === author && !isCommentLiked(it));
    if (stillUnliked) {
      // We can still see the un-liked state after 400ms — the click likely
      // didn't take. Try once more.
      const btn2 = findCommentLikeBtn(stillUnliked);
      if (btn2) {
        humanClick(btn2);
        await sleep(400);
        const check = findCommentItems().find(it => findCommentAuthor(it) === author && !isCommentLiked(it));
        confirmed = !check; // if we can't find the un-liked comment now, it flipped
      }
    }

    if (confirmed) {
      liked++;
      progress(`❤️ Liked ${liked}/${count} — @${author}`);
      saveAction({
        type: 'like',
        video_url: getVideoUrl(),
        target_username: author,
        reply_text: null,
      });
    } else {
      progress(`⚠ Heart didn't flip for @${author} — skipping.`);
    }
    // Shorter pacing than v2.0.0 — each like was ~2s before, now ~1s.
    await sleep(500 + rand(300));
  }

  done(`liked=${liked}`);
}

// ── Reply to N comments ────────────────────────────────────────────────────
// For each comment: click its "Reply" link → type text → post.
// If useAI is on, ask backend for a reply based on the comment text.
async function handleReply(count, replies, useAI) {
  STOP = false;
  progress(`Replying to up to ${count} comments (AI=${useAI ? 'on' : 'off'})…`);
  progress(`  · Video: ${getVideoUrl()}`);

  const opened = await ensureCommentsOpen();
  if (!opened) { progress(`⚠ Couldn't open comments — abort.`); done('failed'); return; }

  const seenAuthors = new Set();
  let replied = 0, skipped = 0;

  while (replied < count) {
    if (STOP) { progress('Stopped.'); break; }

    const items = findCommentItems();
    const targets = items.filter(item => {
      const author = findCommentAuthor(item);
      if (!author || seenAuthors.has(author)) return false;
      // Comment needs a Reply link inside.
      return !!Array.from(item.querySelectorAll('span, button, [role="button"]'))
        .find(el => (el.innerText || '').trim().toLowerCase() === 'reply');
    });

    if (targets.length === 0) {
      progress(`  · No fresh comments — scrolling…`);
      const scrolled = await scrollCommentPanel();
      await sleep(1500 + rand(400));
      if (!scrolled) { progress(`⚠ Can't scroll — done.`); break; }
      if (findCommentItems().length === items.length) {
        skipped++;
        if (skipped >= 3) break;
        continue;
      }
      skipped = 0;
      continue;
    }

    const item = targets[0];
    const author = findCommentAuthor(item);
    const commentText = findCommentText(item);
    seenAuthors.add(author);

    // Click the Reply link.
    const replyLink = Array.from(item.querySelectorAll('span, button, [role="button"]'))
      .find(el => (el.innerText || '').trim().toLowerCase() === 'reply');
    if (!replyLink) { progress(`  · No Reply link for @${author} — skip.`); continue; }
    humanClick(replyLink);
    await sleep(800 + rand(300));

    // Find the reply input (the comment-text contenteditable field).
    const input = document.querySelector('[data-e2e="comment-text"], div[contenteditable="true"]');
    if (!input) { progress(`  · No reply input visible — skip.`); continue; }

    // Resolve reply text.
    let text = null;
    if (useAI) {
      progress(`🤖 Generating AI reply for @${author}…`);
      text = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'GET_AI_REPLY',
          comment: commentText || `TikTok comment by @${author}`,
          post_owner: getVideoAuthor(),
        }, (res) => resolve(res?.reply || null));
      });
      if (!text && replies.length > 0) {
        text = pick(replies);
        progress(`  · AI empty — fallback "${text}"`);
      } else if (!text) {
        progress(`  · AI failed and no fallback — skipping @${author}.`);
        continue;
      }
    } else {
      text = pick(replies);
    }

    input.focus();
    input.innerText = text;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
    await sleep(400 + rand(200));

    // Submit — TikTok's Post button.
    const post = Array.from(document.querySelectorAll('button, [role="button"]'))
      .find(b => ['post', 'reply', 'send'].includes((b.innerText || '').trim().toLowerCase()));
    if (!post) { progress(`  · No Post button — skip.`); continue; }
    humanClick(post);

    replied++;
    progress(`💬 Replied ${replied}/${count} to @${author} — "${text}"`);
    saveAction({
      type: 'reply',
      video_url: getVideoUrl(),
      target_username: author,
      reply_text: text,
    });
    await sleep(1200 + rand(400));
  }

  done(`replied=${replied}`);
}

// ── Message handler ────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  sendResponse({ ok: true });
  if (msg.action === 'TIKTOK_STOP')  { STOP = true; return; }
  if (msg.action === 'TIKTOK_LIKE')  { handleLike(parseInt(msg.count, 10) || 1); }
  if (msg.action === 'TIKTOK_REPLY') { handleReply(parseInt(msg.count, 10) || 1, msg.replies || [], !!msg.useAI); }
});
