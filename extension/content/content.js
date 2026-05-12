// Bibix LinkedIn AI Booster — content script
// Injects "✨ AI" buttons next to LinkedIn comment boxes, "Add your perspective"
// contribution prompts, and reply boxes. On click, generates text via the Monday
// backend and inserts it into the editor.

(function () {
  'use strict';

  const PROCESSED_ATTR = 'data-bibix-processed';
  const BTN_CLASS = 'bibix-ai-btn';

  function send(type, payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, payload }, (res) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(res);
        });
      } catch (e) { resolve({ ok: false, error: e.message }); }
    });
  }

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const k in props) {
      if (k === 'style' && typeof props[k] === 'object') Object.assign(node.style, props[k]);
      else if (k === 'className') node.className = props[k];
      else if (k === 'onClick') node.addEventListener('click', props[k]);
      else if (k.startsWith('on') && typeof props[k] === 'function')
        node.addEventListener(k.slice(2).toLowerCase(), props[k]);
      else node.setAttribute(k, props[k]);
    }
    for (const c of (Array.isArray(children) ? children : [children])) {
      if (c == null) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  // ── Extract post info ────────────────────────────────────────────────────────
  function findPostContainer(node) {
    // Pass 1 — use closest() to find a known post wrapper. Stops at the
    // CLOSEST matching ancestor (not the largest), which is what we want.
    const known = node.closest && node.closest(
      '[data-urn*="urn:li:activity"], [data-urn*="urn:li:ugcPost"], [data-urn*="urn:li:share"], '
      + '.feed-shared-update-v2, [class*="feed-shared-update"], [class*="feed-shared-post"], '
      + 'article'
    );
    if (known) return known;

    // Pass 2 — bounded size heuristic. Walk up until an ancestor is plausibly
    // a single post (160–1200px tall). Stop hard at 1200px so we never grab
    // the whole feed column.
    const editorHeight = (node.offsetHeight || 40);
    const minPostHeight = Math.max(160, editorHeight * 3);
    let p = node.parentElement;
    let depth = 0;
    while (p && p !== document.body && depth < 15) {
      const h = p.offsetHeight || 0;
      if (h >= minPostHeight && h <= 1500 && (p.innerText || '').trim().length > 30) {
        return p;
      }
      if (h > 1500) return null; // overshooting — better to fail than use the whole feed
      p = p.parentElement;
      depth++;
    }
    return null;
  }

  function extractPostText(container) {
    if (!container) return '';
    // Use ONLY known post-text selectors. Falling back to container.innerText
    // would include LinkedIn's UI chrome (which is in the user's UI language
    // — e.g. Hebrew — even when the actual post is in English) and confuse
    // the language detector. Better to return empty and let the backend
    // generate from image/author context.
    const selectors = [
      '.update-components-text',
      '.feed-shared-update-v2__description',
      '.feed-shared-text',
      '.update-components-update-v2__commentary',
      '[data-test-id="main-feed-activity-card__commentary"]',
      '[class*="update-components-text"]',
      '[class*="feed-shared-text"]',
      '[class*="update-components-update-v2__commentary"]',
    ];
    for (const sel of selectors) {
      const node = container.querySelector(sel);
      if (node) {
        const t = (node.innerText || '').trim();
        if (t.length > 5) return t.replace(/\s+\n/g, '\n').slice(0, 3000);
      }
    }
    return '';
  }

  function extractImageDescription(container) {
    if (!container) return '';
    const imgs = container.querySelectorAll('img');
    const alts = [];
    imgs.forEach((img) => {
      const a = (img.getAttribute('alt') || '').trim();
      if (a && a.length > 3 && !/^(profile|photo)$/i.test(a) && !alts.includes(a)) alts.push(a);
    });
    return alts.slice(0, 2).join('; ').slice(0, 500);
  }

  function extractAuthor(container) {
    if (!container) return '';
    const a = container.querySelector(
      '.update-components-actor__name, .update-components-actor__title span[dir="ltr"], .feed-shared-actor__name'
    );
    if (!a) return '';
    const visible = a.querySelector('span[aria-hidden="true"]') || a;
    return (visible.innerText || '').trim().split('\n')[0];
  }

  function extractPostUrl(container) {
    if (!container) return location.href;
    const urn = container.getAttribute('data-urn') || '';
    if (urn) {
      const match = urn.match(/urn:li:activity:(\d+)/);
      if (match) return 'https://www.linkedin.com/feed/update/urn:li:activity:' + match[1] + '/';
    }
    return location.href;
  }

  function isOwnPost(container) {
    if (!container) return false;
    return !!container.querySelector('[data-control-name="actor.see_your_post"]')
      || /\byou\b/i.test((container.querySelector('.update-components-actor__description') || {}).innerText || '');
  }

  // ── Find the LinkedIn editor element to insert text into ─────────────────────
  function findEditorWithin(box) {
    if (!box) return null;
    return box.querySelector('.ql-editor[contenteditable="true"], [contenteditable="true"][role="textbox"], .editor-content [contenteditable="true"]');
  }

  function insertText(editor, text) {
    if (!editor) return false;
    editor.focus();
    // Replace any "placeholder" empty state
    editor.innerHTML = '';
    const lines = text.split(/\n/);
    lines.forEach((line, i) => {
      const p = document.createElement('p');
      if (line) p.textContent = line; else p.innerHTML = '<br/>';
      editor.appendChild(p);
    });
    // Trigger LinkedIn's input handler so the Post button enables
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
    return true;
  }

  // ── Popover ──────────────────────────────────────────────────────────────────
  let activePopover = null;
  function closePopover() { if (activePopover) { activePopover.remove(); activePopover = null; } }

  function openPopover(anchor, opts) {
    closePopover();
    const rect = anchor.getBoundingClientRect();
    const pop = el('div', { className: 'bibix-popover' });
    const header = el('div', { className: 'bibix-popover-header' }, [
      el('div', { className: 'bibix-popover-title' }, '✨ Bibix AI · ' + opts.title),
      el('button', { className: 'bibix-popover-close', onClick: closePopover }, '×'),
    ]);
    const errBox = el('div', { className: 'bibix-error' });
    errBox.hidden = true;
    const body = el('div', { className: 'bibix-popover-text' }, [
      el('div', { className: 'bibix-popover-loading' }, [
        el('span', { className: 'bibix-dot' }), el('span', { className: 'bibix-dot' }), el('span', { className: 'bibix-dot' }),
        ' generating…',
      ]),
    ]);
    const actions = el('div', { className: 'bibix-popover-actions' }, [
      el('button', { onClick: closePopover }, 'Cancel'),
      el('button', { className: 'primary', onClick: () => {
        if (opts.onInsert) opts.onInsert(body.textContent.trim());
        closePopover();
      } }, 'Insert into comment'),
    ]);
    const regen = el('button', { onClick: () => generate() }, '↻ Regenerate');
    actions.insertBefore(regen, actions.firstChild);

    pop.appendChild(header);
    pop.appendChild(errBox);
    pop.appendChild(body);
    pop.appendChild(actions);

    document.body.appendChild(pop);
    activePopover = pop;
    // Popover uses position:fixed, so use viewport coords (no scroll offset).
    const top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 280));
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 380));
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';

    async function generate() {
      errBox.hidden = true;
      body.innerHTML = '';
      const loading = el('div', { className: 'bibix-popover-loading' }, [
        el('span', { className: 'bibix-dot' }), el('span', { className: 'bibix-dot' }), el('span', { className: 'bibix-dot' }),
        ' generating…',
      ]);
      body.appendChild(loading);
      const res = await opts.runGenerate();
      if (res.ok) {
        body.textContent = res.data.text || '';
      } else {
        body.textContent = '';
        errBox.hidden = false;
        errBox.textContent = res.error || 'Generation failed';
        if (res.status === 401) errBox.textContent += ' — open the extension and sign in.';
      }
    }
    generate();

    setTimeout(() => {
      document.addEventListener('mousedown', (e) => {
        if (activePopover && !activePopover.contains(e.target) && e.target !== anchor) closePopover();
      }, { once: true });
    }, 50);
  }

  function alreadyHasBibixButton(node) {
    if (!node) return false;
    if (node.querySelector && node.querySelector('.' + BTN_CLASS)) return true;
    // Also check nearby siblings — LinkedIn occasionally re-mounts wrappers
    let p = node.parentElement;
    for (let i = 0; i < 3 && p; i++) {
      if (p.querySelector && p.querySelector('.' + BTN_CLASS)) return true;
      p = p.parentElement;
    }
    return false;
  }

  // ── Inject buttons next to comment boxes ─────────────────────────────────────
  function injectIntoCommentBox(box) {
    if (!box || box.getAttribute(PROCESSED_ATTR)) return;
    if (alreadyHasBibixButton(box)) { box.setAttribute(PROCESSED_ATTR, '1'); return; }
    box.setAttribute(PROCESSED_ATTR, '1');

    const postContainer = findPostContainer(box);
    const actions = box.querySelector('.comments-comment-box__detour-container, .comments-comment-texteditor__footer, .comments-comment-box__form-container');
    // Best fallback: append directly inside the box
    const host = actions || box;

    const btn = el('button', {
      className: BTN_CLASS,
      type: 'button',
      onClick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        const editor = findEditorWithin(box);
        // Re-resolve post container at click time — by now LinkedIn may have
        // rendered the post DOM that was lazy at injection time.
        const container = findPostContainer(box) || postContainer;
        const postText = extractPostText(container);
        const imageDescription = extractImageDescription(container);
        const author = extractAuthor(container);
        const url = extractPostUrl(container);
        console.log('[Bibix LinkedIn AI] generating with:', {
          author,
          postTextPreview: (postText || '').slice(0, 160),
          imageDescriptionPreview: (imageDescription || '').slice(0, 160),
          url,
          containerTag: container && container.tagName,
          containerCls: container && (container.className || '').toString().slice(0, 120),
        });
        if (!postText && !imageDescription && !author) {
          openPopover(btn, {
            title: 'Comment',
            runGenerate: () => Promise.resolve({ ok: false, error: 'Could not read this post. Try opening it in a dedicated page (click the timestamp) and try again.' }),
          });
          return;
        }
        openPopover(btn, {
          title: 'Comment',
          runGenerate: () => send('generateComment', { postText, imageDescription, authorName: author, postUrl: url }),
          onInsert: (text) => insertText(editor, text),
        });
      },
    }, [el('span', { className: 'bibix-spark' }, '✨'), 'AI Comment']);

    host.insertBefore(btn, host.firstChild);
  }

  function injectIntoReplyBox(box) {
    if (!box || box.getAttribute(PROCESSED_ATTR)) return;
    if (alreadyHasBibixButton(box)) { box.setAttribute(PROCESSED_ATTR, '1'); return; }
    box.setAttribute(PROCESSED_ATTR, '1');

    // Find the comment we're replying to
    const commentRoot = box.closest('.comments-comment-item, .comments-comment-entity');
    const commentTextEl = commentRoot && commentRoot.querySelector('.comments-comment-item__main-content, .update-components-text, .comments-comment-item-content-body');
    const commentText = commentTextEl ? commentTextEl.innerText.trim() : '';
    const commentAuthorEl = commentRoot && commentRoot.querySelector('.comments-post-meta__name-text, .comments-post-meta__actor-link');
    const commentAuthor = commentAuthorEl ? commentAuthorEl.innerText.trim().split('\n')[0] : '';

    const postContainer = findPostContainer(box);
    const postText = extractPostText(postContainer);
    const url = extractPostUrl(postContainer);
    const ownPost = isOwnPost(postContainer);

    const btn = el('button', {
      className: BTN_CLASS,
      type: 'button',
      onClick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        const editor = findEditorWithin(box);
        openPopover(btn, {
          title: 'Reply',
          runGenerate: () => send('generateReply', {
            commentText, commentAuthor, postText, isOwnPost: ownPost, postUrl: url,
          }),
          onInsert: (text) => insertText(editor, text),
        });
      },
    }, [el('span', { className: 'bibix-spark' }, '✨'), 'AI Reply']);

    const host = box.querySelector('.comments-comment-box__detour-container, .comments-comment-texteditor__footer') || box;
    host.insertBefore(btn, host.firstChild);
  }

  // ── Inject button for "Add your perspective" (Top Voice contributions) ───────
  function injectIntoContributionBox(box) {
    if (!box || box.getAttribute(PROCESSED_ATTR)) return;
    if (alreadyHasBibixButton(box)) { box.setAttribute(PROCESSED_ATTR, '1'); return; }
    box.setAttribute(PROCESSED_ATTR, '1');

    const titleEl = document.querySelector('h1, .article-header__title, .contribution-prompt__title');
    const perspectiveEl = box.closest('[data-test-id*="perspective"], section') || document.body;
    const promptEl = perspectiveEl.querySelector('h2, h3, .contribution-prompt__title');
    const perspectiveTitle = promptEl ? promptEl.innerText.trim() : '';
    const topic = titleEl ? titleEl.innerText.trim() : document.title;

    const btn = el('button', {
      className: BTN_CLASS,
      type: 'button',
      onClick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        const editor = findEditorWithin(box);
        openPopover(btn, {
          title: 'Contribution',
          runGenerate: () => send('generateContribution', { topic, perspectiveTitle, postUrl: location.href }),
          onInsert: (text) => insertText(editor, text),
        });
      },
    }, [el('span', { className: 'bibix-spark' }, '✨'), 'AI Perspective']);

    const host = box.querySelector('.comments-comment-texteditor__footer, .ql-toolbar') || box;
    host.insertBefore(btn, host.firstChild);
  }

  // ── Discovery: walk up from every contenteditable to find a "comment box"
  // host element. This is resilient to LinkedIn renaming classes — it works
  // off the universal contenteditable role rather than specific class names.

  function ancestorMatching(node, predicate, maxDepth = 12) {
    let cur = node;
    for (let i = 0; i < maxDepth && cur && cur !== document.body; i++) {
      if (predicate(cur)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function looksLikeCommentBox(node) {
    const cls = (node.className && typeof node.className === 'string') ? node.className : '';
    // Match comment-related wrappers but NOT the "Start a post" composer or contribution boxes
    return /comments?-comment-box|comments?-comment-texteditor|comments?-comments?-box/i.test(cls);
  }

  function looksLikePostShareComposer(node) {
    const cls = (node.className && typeof node.className === 'string') ? node.className : '';
    return /share-creation-state|share-box-modal|share-box|sharing-box/i.test(cls);
  }

  function looksLikeReplyBox(node) {
    const cls = (node.className && typeof node.className === 'string') ? node.className : '';
    return /comment-box--reply|reply-editor|comments-reply/i.test(cls);
  }

  function looksLikeContributionBox(node) {
    const cls = (node.className && typeof node.className === 'string') ? node.className : '';
    return /contribution-prompt|perspective|article-contrib/i.test(cls);
  }

  function findEditorHost(editor) {
    return ancestorMatching(editor, looksLikeCommentBox);
  }

  // Universal injection: for every contenteditable that looks like a LinkedIn
  // comment/reply/contribution editor, find a sensible mount target and place
  // a single button there. Deduplication: skip if any .bibix-ai-btn already
  // exists in the mount target or its ancestors.
  function injectButtonNearEditor(editor) {
    if (editor.getAttribute(PROCESSED_ATTR) === '1') return;
    if (ancestorMatching(editor, looksLikePostShareComposer)) return;
    if (alreadyHasBibixButton(editor)) { editor.setAttribute(PROCESSED_ATTR, '1'); return; }

    // Prefer a known comment-box wrapper.
    let mountTarget = ancestorMatching(editor, looksLikeCommentBox);
    if (!mountTarget) {
      // No known wrapper class — walk up to a slightly larger container.
      let p = editor.parentElement;
      for (let i = 0; i < 5 && p && p !== document.body; i++) {
        if (p.offsetHeight > editor.offsetHeight + 4) { mountTarget = p; break; }
        p = p.parentElement;
      }
      if (!mountTarget) mountTarget = editor.parentElement;
    }
    if (!mountTarget) return;
    editor.setAttribute(PROCESSED_ATTR, '1');

    if (ancestorMatching(editor, looksLikeContributionBox)) {
      injectIntoContributionBox(mountTarget);
      return;
    }
    if (looksLikeReplyBox(mountTarget) || ancestorMatching(editor, looksLikeReplyBox)) {
      injectIntoReplyBox(mountTarget);
      return;
    }
    injectIntoCommentBox(mountTarget);
  }

  function scan() {
    // 1. Find every plausible comment editor on the page.
    const editors = document.querySelectorAll(
      '.ql-editor[contenteditable="true"], '
      + 'div[contenteditable="true"][role="textbox"], '
      + 'div[contenteditable="true"][aria-label*="comment" i], '
      + 'div[contenteditable="true"][aria-label*="reply" i], '
      + 'div[contenteditable="true"][aria-placeholder*="comment" i], '
      + 'div[contenteditable="true"][data-placeholder*="comment" i]'
    );
    editors.forEach(injectButtonNearEditor);

    // 2. Also: handle collapsed comment-box placeholders (visible BEFORE user
    // clicks them). Tight selector to avoid matching individual comment items.
    document.querySelectorAll(
      '.comments-comment-box:not(.comments-comment-box--reply), '
      + '[class*="comments-comment-box"]:not([class*="reply"])'
    ).forEach((box) => {
      if (box.getAttribute(PROCESSED_ATTR) === '1') return;
      if (box.querySelector('[contenteditable="true"]')) return;
      if (box.querySelector('.' + BTN_CLASS)) return;
      if (ancestorMatching(box, looksLikePostShareComposer)) return;
      injectIntoCommentBox(box);
    });
  }

  let scanTimer = null;
  function scheduleScan() { clearTimeout(scanTimer); scanTimer = setTimeout(scan, 200); }

  document.addEventListener('focusin', (e) => {
    if (e.target && e.target.matches && e.target.matches('[contenteditable="true"]')) {
      scheduleScan();
    }
  }, true);

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleScan();
  // Re-scan a few times during initial page load — LinkedIn's SPA mounts
  // post DOM in waves, and we want buttons to appear without waiting for
  // user interaction.
  setTimeout(scheduleScan, 500);
  setTimeout(scheduleScan, 1500);
  setTimeout(scheduleScan, 3500);

  console.log('[Bibix LinkedIn AI] content script loaded (v0.1.3)');
  // Periodic count log to aid debugging in production.
  setInterval(() => {
    const n = document.querySelectorAll('.' + BTN_CLASS).length;
    if (n > 0) return; // only log when zero, to surface visibility issues
    const editors = document.querySelectorAll('[contenteditable="true"]').length;
    if (editors > 0) console.log('[Bibix LinkedIn AI] No buttons injected — editors on page:', editors);
  }, 5000);
})();
