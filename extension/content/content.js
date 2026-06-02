// Bibix LinkedIn AI Booster — content script
// Injects "✨ AI" buttons next to LinkedIn comment boxes, "Add your perspective"
// contribution prompts, and reply boxes. On click, generates text via the Monday
// backend and inserts it into the editor.

(function () {
  'use strict';

  const PROCESSED_ATTR = 'data-bibix-processed';
  const BTN_CLASS = 'bibix-ai-btn';

  const ORPHANED_MSG = 'Extension was updated — please reload this LinkedIn tab (Cmd+R) and try again.';
  function send(type, payload) {
    return new Promise((resolve) => {
      if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage || !chrome.runtime.id) {
        return resolve({ ok: false, error: ORPHANED_MSG });
      }
      try {
        chrome.runtime.sendMessage({ type, payload }, (res) => {
          if (chrome.runtime.lastError) {
            const msg = chrome.runtime.lastError.message || '';
            if (/context invalidated|receiving end does not exist/i.test(msg)) {
              resolve({ ok: false, error: ORPHANED_MSG });
            } else resolve({ ok: false, error: msg });
          } else resolve(res);
        });
      } catch (e) {
        const msg = (e && e.message) || '';
        if (/sendMessage|invalidated|undefined/i.test(msg)) {
          resolve({ ok: false, error: ORPHANED_MSG });
        } else resolve({ ok: false, error: msg });
      }
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

  const POST_TEXT_SELECTORS = [
    '.update-components-text',
    '.feed-shared-update-v2__description',
    '.feed-shared-text',
    '.update-components-update-v2__commentary',
    '[data-test-id="main-feed-activity-card__commentary"]',
    '[class*="update-components-text"]',
    '[class*="feed-shared-text"]',
    '[class*="update-components-update-v2__commentary"]',
    '[class*="feed-shared-inline-show-more-text"]',
    '[class*="break-words"]',
  ].join(', ');

  function readTextFrom(node) {
    if (!node) return '';
    const t = (node.innerText || '').trim();
    if (t.length < 5) return '';
    return t.replace(/\s+\n/g, '\n').slice(0, 3000);
  }

  function extractPostText(container) {
    if (!container) return '';
    // Pass 1 — known selectors inside the container
    const node = container.querySelector(POST_TEXT_SELECTORS);
    const fromContainer = readTextFrom(node);
    if (fromContainer) return fromContainer;
    // Pass 2 — search the whole document. In LinkedIn's comment-overlay/modal
    // view, the post text element may live outside our local container.
    // Pick the LARGEST visible match — usually the main post body.
    let best = '';
    document.querySelectorAll(POST_TEXT_SELECTORS).forEach((n) => {
      const t = readTextFrom(n);
      if (t.length > best.length) best = t;
    });
    return best;
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
  let outsideClickHandler = null;
  function closePopover() {
    if (activeDialog) {
      try { if (activeDialog.open) activeDialog.close(); } catch (_) {}
      activeDialog.remove();
      activeDialog = null;
    }
    activePopover = null;
    if (outsideClickHandler) {
      document.removeEventListener('keydown', outsideClickHandler);
      outsideClickHandler = null;
    }
  }

  // Active <dialog> element. Using a native <dialog> via showModal() puts
  // our popover into the browser's top layer, which always renders above
  // every regular element — and competes correctly with LinkedIn's own
  // <dialog>-based fullscreen image viewer (last opened wins by DOM order).
  let activeDialog = null;

  function openPopover(anchor, opts) {
    console.log('[Bibix LinkedIn AI] openPopover called', opts && opts.title);
    closePopover();
    const pop = document.createElement('dialog');
    pop.className = 'bibix-popover';
    Object.assign(pop.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      margin: '0',
      padding: '18px',
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '14px',
      boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
      width: '440px',
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: 'calc(100vh - 48px)',
      overflow: 'auto',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '13px',
      color: '#1f2937',
      zIndex: '2147483647',
    });
    // Style the ::backdrop (dialog's built-in dimmer) via a stylesheet hook.
    // The class .bibix-popover already styles the dialog backdrop via CSS.
    pop.addEventListener('click', (e) => {
      // Native <dialog> sends a click event on the dialog itself when the
      // user clicks the ::backdrop. Detect that and close.
      if (e.target === pop) closePopover();
    });
    pop.addEventListener('close', () => closePopover());
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

    document.documentElement.appendChild(pop);
    try { pop.showModal(); } catch (_) { /* fallback: just attach */ }
    activeDialog = pop;
    activePopover = pop;

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

    // Esc key also dismisses
    outsideClickHandler = (e) => {
      if (e.key === 'Escape') closePopover();
    };
    document.addEventListener('keydown', outsideClickHandler);
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

    // Always inject a Bulk Actions button alongside AI Comment. Use the post
    // container if we found one, otherwise fall back to the comment box —
    // the dialog itself does a document-wide search for comments either way.
    const bulkPost = postContainer || box;
    if (bulkPost && bulkPost.getAttribute(BULK_PROCESSED) !== '1' && !host.querySelector('.' + BULK_BTN_CLASS)) {
      bulkPost.setAttribute(BULK_PROCESSED, '1');
      const bulkBtn = el('button', {
        className: BULK_BTN_CLASS,
        type: 'button',
        title: 'Bibix Bulk Actions — auto-reply / auto-like multiple comments',
        onClick: (e) => {
          e.preventDefault(); e.stopPropagation();
          openBulkDialog(bulkPost);
        },
      }, [el('span', { className: 'bibix-spark' }, '✨'), 'Bulk']);
      host.insertBefore(bulkBtn, host.firstChild);
    }

    const btn = el('button', {
      className: BTN_CLASS,
      type: 'button',
      onClick: (e) => {
        console.log('[Bibix LinkedIn AI] AI Comment button clicked');
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

    // 3. Inject Bulk Actions button into each post's social-action bar.
    injectBulkButtons();
    // 4. If on a profile page, inject the "Find Contact" button.
    injectFindContactButton();
  }

  // ── Bulk Actions: auto-reply / random-like across many comments ────────────
  const BULK_BTN_CLASS = 'bibix-bulk-btn';
  const BULK_PROCESSED = 'data-bibix-bulk-processed';
  let bulkAborted = false;

  function rand(min, max) { return Math.floor(min + Math.random() * (max - min)); }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function injectBulkButtons() {
    // Find each post wrapper that has a social-actions bar (Like/Comment/Repost row)
    document.querySelectorAll(
      '[data-urn*="urn:li:activity"], [data-urn*="urn:li:ugcPost"], [data-urn*="urn:li:share"], '
      + '.feed-shared-update-v2, [class*="feed-shared-update"], article'
    ).forEach((post) => {
      if (post.getAttribute(BULK_PROCESSED) === '1') return;
      const bar = post.querySelector(
        '.feed-shared-social-action-bar, .social-actions-bar, [class*="social-action"], '
        + '[class*="social-actions"], .update-v2-social-activity'
      );
      if (!bar) return;
      // Skip if already injected
      if (bar.querySelector('.' + BULK_BTN_CLASS)) { post.setAttribute(BULK_PROCESSED, '1'); return; }
      post.setAttribute(BULK_PROCESSED, '1');

      const btn = el('button', {
        className: BULK_BTN_CLASS,
        type: 'button',
        title: 'Bibix Bulk Actions — auto-reply / auto-like multiple comments',
        onClick: (e) => {
          e.preventDefault(); e.stopPropagation();
          openBulkDialog(post);
        },
      }, [el('span', { className: 'bibix-spark' }, '✨'), 'Bulk']);
      bar.appendChild(btn);
    });
  }

  // -- Comment discovery on a post --
  const COMMENT_ITEM_SELECTORS = [
    '.comments-comment-item',
    '.comments-comment-entity',
    '[class*="comments-comment-item"]',
    '[class*="comments-comment-entity"]',
    '[class*="comments-comments-entity"]',
    '[class*="comment-entity-v"]',
    '[data-id*="urn:li:comment"]',
    'article[class*="comment"]',
  ];
  const COMMENT_ITEM_SELECTOR = COMMENT_ITEM_SELECTORS.join(', ');

  function findCommentItems(post) {
    // Search post-local first
    let items = Array.from(post.querySelectorAll(COMMENT_ITEM_SELECTOR))
      .filter((c) => c.offsetHeight > 0);
    if (items.length > 0) return items;
    // Fallback: scan the whole document by class.
    items = Array.from(document.querySelectorAll(COMMENT_ITEM_SELECTOR))
      .filter((c) => c.offsetHeight > 0);
    if (items.length > 0) return items;
    // Last-resort heuristic: data-id urn pattern.
    items = Array.from(document.querySelectorAll('[data-id]'))
      .filter((n) => /urn:li:(comment|reply)/i.test(n.getAttribute('data-id') || '') && n.offsetHeight > 0);
    if (items.length > 0) return items;
    // Final fallback: LinkedIn class names are obfuscated. Find comment items
    // structurally — every comment has a Like-type button (aria-label or
    // class-based) AND a Reply-type button nearby. Walk up from each Like
    // button to find the smallest ancestor that also contains a Reply
    // button — that's the comment wrapper.
    return findCommentItemsStructurally();
  }

  function findLikeButtonsGlobal() {
    const P = '[Bibix Bulk]';
    // Strategy 1 — aria-label patterns (multilingual)
    let likeBtns = Array.from(document.querySelectorAll(
      'button[aria-label*="Like" i], button[aria-label*="React" i], '
      + 'button[aria-label*="לייק" i], button[aria-label*="אהבתי" i], button[aria-label*="הגב" i], '
      + 'button[aria-label*="Me gusta" i], button[aria-label*="J\'aime" i], '
      + 'button[aria-label*="Gefällt" i], button[aria-label*="Mi piace" i]'
    ));
    console.log(P, 'like via aria-label:', likeBtns.length);
    // Strategy 2 — data-control-name
    if (likeBtns.length === 0) {
      likeBtns = Array.from(document.querySelectorAll(
        'button[data-control-name*="react" i], button[data-control-name*="like" i]'
      ));
      console.log(P, 'like via data-control-name:', likeBtns.length);
    }
    // Strategy 3 — class name patterns
    if (likeBtns.length === 0) {
      likeBtns = Array.from(document.querySelectorAll(
        'button[class*="react-button"], button[class*="reactions"], button[class*="like-button"]'
      ));
      console.log(P, 'like via class hints:', likeBtns.length);
    }
    // Strategy 4 — last resort: any button with aria-pressed (toggleable) +
    // an SVG icon inside. Captures icon-only like/react buttons.
    if (likeBtns.length === 0) {
      likeBtns = Array.from(document.querySelectorAll('button[aria-pressed]'))
        .filter((b) => b.querySelector('svg, [data-test-icon]'));
      console.log(P, 'like via aria-pressed+svg:', likeBtns.length);
    }
    return likeBtns.filter((b) => b.offsetHeight > 0 && b.offsetWidth > 0);
  }

  function findCommentItemsStructurally() {
    const P = '[Bibix Bulk]';
    const likeBtns = findLikeButtonsGlobal();
    console.log(P, 'likeBtns visible:', likeBtns.length);
    const seen = new Set();
    const items = [];
    likeBtns.forEach((btn) => {
      // Walk up looking for an ancestor that also contains a Reply trigger
      let p = btn.parentElement;
      for (let i = 0; i < 12 && p && p !== document.body; i++) {
        const candidates = Array.from(p.querySelectorAll('button, a[role="button"]'));
        const hasReply = candidates.some((c) => {
          if (c === btn) return false;
          const cls = (c.className || '').toString().toLowerCase();
          const dcn = (c.getAttribute('data-control-name') || '').toLowerCase();
          const txt = (c.innerText || '').trim();
          const lbl = (c.getAttribute('aria-label') || '').trim();
          return /reply/.test(cls) || /reply/.test(dcn)
            || /^(reply|respond|responder|antworten|תגובה|השב|להגיב|rispondi|svar)\b/i.test(txt + ' ' + lbl);
        });
        if (hasReply && p.offsetHeight > 30 && p.offsetHeight < 800) {
          if (!seen.has(p)) { seen.add(p); items.push(p); }
          break;
        }
        p = p.parentElement;
      }
    });
    console.log(P, 'structural items found:', items.length);
    return items;
  }

  function dumpCommentDiagnostic(label) {
    const P = '[Bibix Bulk]';
    console.log(P, label, '— diagnostic dump:');
    COMMENT_ITEM_SELECTORS.forEach((sel) => {
      console.log(P, '  selector:', sel, '→', document.querySelectorAll(sel).length, 'matches');
    });
    const dataIds = Array.from(document.querySelectorAll('[data-id]'));
    console.log(P, '  total [data-id] elements:', dataIds.length);
    dataIds.slice(0, 6).forEach((n, i) => console.log(P, '   data-id #' + i + ':', n.getAttribute('data-id'), '|', (n.className || '').toString().slice(0, 60)));
    const dataUrns = Array.from(document.querySelectorAll('[data-urn]'));
    console.log(P, '  total [data-urn] elements:', dataUrns.length);
    dataUrns.slice(0, 6).forEach((n, i) => console.log(P, '   data-urn #' + i + ':', n.getAttribute('data-urn'), '|', (n.className || '').toString().slice(0, 60)));
    const classComment = Array.from(document.querySelectorAll('[class*="comment"]'));
    console.log(P, '  total elements with "comment" in class:', classComment.length);
    const classes = new Set();
    classComment.forEach((n) => {
      ((n.className || '').toString().split(/\s+/)).forEach((c) => {
        if (c.toLowerCase().includes('comment')) classes.add(c);
      });
    });
    console.log(P, '  distinct class tokens with "comment":', Array.from(classes).slice(0, 30));
  }

  function commentText(item) {
    const t = item.querySelector(
      '.comments-comment-item__main-content, .update-components-text, '
      + '.comments-comment-item-content-body, [class*="comments-comment-item__main-content"]'
    );
    return t ? (t.innerText || '').trim() : '';
  }

  function commentAuthor(item) {
    const a = item.querySelector(
      '.comments-post-meta__name-text, .comments-post-meta__actor-link, '
      + '[class*="comments-post-meta__name"]'
    );
    return a ? (a.innerText || '').trim().split('\n')[0] : '';
  }

  // Restrict to buttons that belong to *this* comment, not to its nested
  // replies (which live inside a child comment-list container).
  function buttonsBelongingTo(item) {
    const all = Array.from(item.querySelectorAll('button, a[role="button"]'));
    // Identify any nested reply containers within this item
    const nestedContainers = Array.from(item.querySelectorAll(
      '[class*="comments-comment-list__container"], [class*="comments-replies"], [class*="comment-replies"]'
    ));
    return all.filter((b) => !nestedContainers.some((c) => c.contains(b)));
  }

  function findLikeButton(item) {
    const candidates = buttonsBelongingTo(item).filter((b) => {
      const cls = (b.className || '').toString().toLowerCase();
      const dcn = (b.getAttribute('data-control-name') || '').toLowerCase();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      // Class / data hints (language-agnostic)
      if (/react-button|reactions-react-button/.test(cls)) return true;
      if (/react|like/.test(dcn)) return true;
      // aria-label patterns across common LinkedIn locales
      if (/\blike\b|\bלייק\b|\bאהבתי\b|me gusta|j['']aime|gefällt mir|mi piace/i.test(aria)) return true;
      // SVG button with aria-pressed (toggleable react button)
      if (b.getAttribute('aria-pressed') !== null && b.querySelector('svg, [data-test-icon]')) return true;
      return false;
    });
    for (const b of candidates) {
      if (b.getAttribute('aria-pressed') === 'true') continue;
      const cls = (b.className || '').toString().toLowerCase();
      if (/active|selected|liked/.test(cls)) continue;
      return b;
    }
    return null;
  }

  function findReplyTrigger(item) {
    // Language-agnostic: prefer class/data hints; fall back to text only for
    // English UIs.
    const candidates = buttonsBelongingTo(item);
    // Pass 1 — class/data hints
    for (const b of candidates) {
      const cls = (b.className || '').toString().toLowerCase();
      const dcn = (b.getAttribute('data-control-name') || '').toLowerCase();
      if (/reply-action|reply-button|comments-comment-social-bar__reply/.test(cls)) return b;
      if (/reply/.test(dcn)) return b;
    }
    // Pass 2 — multilingual text/aria-label patterns (English/Hebrew/Spanish/etc.)
    const REPLY_WORDS = /^(reply|respond|respondre|responder|antworten|תגובה|השב|להגיב|rispondi|svar)\b/i;
    for (const b of candidates) {
      const txt = (b.innerText || '').trim();
      const label = (b.getAttribute('aria-label') || '').trim();
      if (REPLY_WORDS.test(txt) || REPLY_WORDS.test(label)) return b;
    }
    return null;
  }

  function findSubmitInside(box) {
    if (!box) return null;
    const buttons = box.querySelectorAll('button');
    // Pass 1 — class hints (language-agnostic)
    for (const b of buttons) {
      const cls = (b.className || '').toString().toLowerCase();
      if (/comments-comment-box__submit|submit-button|post-button/.test(cls) && !b.disabled) return b;
    }
    // Pass 2 — multilingual text/aria-label patterns
    const SUBMIT_WORDS = /^(post|reply|comment|publicar|enviar|publish|publicar|publier|פרסם|פרסום|תגובה)\b/i;
    for (const b of buttons) {
      const txt = (b.innerText || '').trim();
      const label = (b.getAttribute('aria-label') || '').trim();
      if ((SUBMIT_WORDS.test(txt) || SUBMIT_WORDS.test(label)) && !b.disabled) return b;
    }
    return null;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  async function scrollAndLoadComments(post, targetCount) {
    // LinkedIn lazy-loads comments; click "See more comments" buttons until we
    // have enough or run out.
    for (let i = 0; i < 6; i++) {
      const items = findCommentItems(post);
      if (items.length >= targetCount) return items;
      const more = document.querySelector(
        'button.comments-comments-list__load-more-comments-button, '
        + 'button[aria-label*="more comment" i], '
        + 'button[aria-label*="previous reply" i], '
        + 'button[aria-label*="load more" i]'
      );
      if (!more) break;
      more.scrollIntoView({ block: 'center' });
      more.click();
      await wait(rand(1200, 2200));
    }
    return findCommentItems(post);
  }

  function openBulkDialog(post) {
    closePopover();
    const pop = document.createElement('dialog');
    pop.className = 'bibix-popover';
    Object.assign(pop.style, {
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      margin: '0', padding: '20px', background: '#fff', border: '1px solid #e2e8f0',
      borderRadius: '14px', boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
      width: '420px', maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 48px)',
      overflow: 'auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '13px', color: '#1f2937', zIndex: '2147483647',
    });
    pop.innerHTML = `
      <div style="font-weight:700;font-size:14px;margin-bottom:6px;background:linear-gradient(135deg,#4338ca,#6366f1);-webkit-background-clip:text;background-clip:text;color:transparent">
        ✨ Bibix Bulk Actions
      </div>
      <div style="font-size:11px;color:#94a3b8;margin-bottom:14px">
        Acts on the comments under this post. Random 5–15s delays. Click Cancel anytime to stop.
      </div>
      <div style="margin-bottom:14px;padding:12px;border:1px solid #e2e8f0;border-radius:10px">
        <div style="font-weight:600;margin-bottom:6px">🤖 Auto-Reply</div>
        <div style="font-size:11px;color:#64748b;margin-bottom:8px">Generate AI replies to the first N comments and post them.</div>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="bibix-reply-count" type="number" min="1" max="25" value="3" style="width:60px;padding:6px;border:1px solid #e2e8f0;border-radius:6px">
          <span style="font-size:12px;color:#64748b">comments</span>
          <button id="bibix-go-reply" style="margin-left:auto;background:linear-gradient(135deg,#4338ca,#6366f1);color:#fff;border:none;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Start replying</button>
        </div>
      </div>
      <div style="margin-bottom:14px;padding:12px;border:1px solid #e2e8f0;border-radius:10px">
        <div style="font-weight:600;margin-bottom:6px">👍 Random Likes</div>
        <div style="font-size:11px;color:#64748b;margin-bottom:8px">Like N randomly-chosen comments.</div>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="bibix-like-count" type="number" min="1" max="25" value="5" style="width:60px;padding:6px;border:1px solid #e2e8f0;border-radius:6px">
          <span style="font-size:12px;color:#64748b">comments</span>
          <button id="bibix-go-like" style="margin-left:auto;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Start liking</button>
        </div>
      </div>
      <div id="bibix-bulk-status" style="font-size:12px;color:#475569;min-height:18px;margin-bottom:10px"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button id="bibix-bulk-close" style="background:#f1f5f9;border:1px solid #e2e8f0;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Close</button>
      </div>
    `;
    document.documentElement.appendChild(pop);
    try { pop.showModal(); } catch (_) {}
    activeDialog = pop;
    activePopover = pop;

    const status = pop.querySelector('#bibix-bulk-status');
    const setStatus = (s) => { if (status) status.textContent = s; };
    pop.querySelector('#bibix-bulk-close').addEventListener('click', () => { bulkAborted = true; closePopover(); });
    pop.addEventListener('click', (e) => { if (e.target === pop) { bulkAborted = true; closePopover(); } });
    pop.querySelector('#bibix-go-reply').addEventListener('click', async () => {
      bulkAborted = false;
      const n = Math.max(1, Math.min(25, Number(pop.querySelector('#bibix-reply-count').value) || 3));
      await runBulkReply(post, n, setStatus);
    });
    pop.querySelector('#bibix-go-like').addEventListener('click', async () => {
      bulkAborted = false;
      const n = Math.max(1, Math.min(25, Number(pop.querySelector('#bibix-like-count').value) || 5));
      await runBulkLike(post, n, setStatus);
    });
  }

  async function runBulkReply(post, count, setStatus) {
    setStatus(`Loading comments…`);
    const items = await scrollAndLoadComments(post, count);
    const targets = items.slice(0, count);
    if (targets.length === 0) {
      dumpCommentDiagnostic('No comments found for reply');
      setStatus('No comments found. See console for details.');
      return;
    }
    setStatus(`Found ${targets.length} comments. Starting…`);
    const postText = extractPostText(findPostContainer(post) || post);
    const postUrl = extractPostUrl(post);

    let done = 0, errors = 0;
    for (let i = 0; i < targets.length; i++) {
      if (bulkAborted) { setStatus(`Stopped after ${done}/${targets.length}.`); return; }
      const item = targets[i];
      const author = commentAuthor(item);
      const text = commentText(item);
      setStatus(`Replying to ${i + 1}/${targets.length}${author ? ' — ' + author : ''}…`);
      try {
        // 1. Generate reply via background worker
        const gen = await send('generateReply', {
          commentText: text, commentAuthor: author, postText, isOwnPost: false, postUrl,
        });
        if (!gen.ok) throw new Error(gen.error || 'AI error');
        const replyText = gen.data.text;

        // 2. Click the comment's Reply trigger to open its inline editor
        const trigger = findReplyTrigger(item);
        if (!trigger) throw new Error('Could not find Reply button');
        trigger.click();
        // 3. Wait for the editor to appear
        let editor = null;
        for (let t = 0; t < 30; t++) {
          editor = item.querySelector('[contenteditable="true"][role="textbox"], .ql-editor[contenteditable="true"]');
          if (editor) break;
          await wait(150);
        }
        if (!editor) throw new Error('Reply editor never appeared');
        // 4. Insert generated text
        insertText(editor, replyText);
        await wait(rand(600, 1100));
        // 5. Find and click the Post/Reply submit button
        const box = ancestorMatching(editor, looksLikeCommentBox) || editor.parentElement;
        const submit = findSubmitInside(box);
        if (!submit) throw new Error('Could not find Post/Reply submit button');
        submit.click();
        done++;
        setStatus(`Posted ${done}/${targets.length}. Waiting…`);
      } catch (e) {
        errors++;
        console.warn('[Bibix Bulk] reply error:', e.message);
        setStatus(`Skipped ${i + 1} (${e.message}). Continuing…`);
      }
      // Random delay between actions (5–15s) to look human
      if (i < targets.length - 1) await wait(rand(5000, 15000));
    }
    setStatus(`Done. ${done} posted, ${errors} skipped.`);
  }

  async function runBulkLike(post, count, setStatus) {
    setStatus(`Loading comments…`);
    const items = await scrollAndLoadComments(post, count * 2);
    // Filter to ones we haven't liked yet
    const candidates = items.filter((it) => findLikeButton(it));
    if (candidates.length === 0) {
      if (items.length === 0) {
        dumpCommentDiagnostic('No comments found for like');
      } else {
        const sample = items[0];
        const btns = buttonsBelongingTo(sample);
        console.log('[Bibix Bulk] Found', items.length, 'comments but no like button. Sample buttons:');
        btns.forEach((b, i) => console.log(' ', i, {
          cls: (b.className || '').toString().slice(0, 80),
          dcn: b.getAttribute('data-control-name'),
          aria: b.getAttribute('aria-label'),
          pressed: b.getAttribute('aria-pressed'),
          text: (b.innerText || '').slice(0, 40),
        }));
      }
      setStatus('No likeable comments found. See console for details.');
      return;
    }
    const targets = shuffle(candidates).slice(0, count);
    setStatus(`Found ${candidates.length} candidates. Liking ${targets.length}…`);

    let done = 0, errors = 0;
    for (let i = 0; i < targets.length; i++) {
      if (bulkAborted) { setStatus(`Stopped after ${done}/${targets.length}.`); return; }
      const item = targets[i];
      const author = commentAuthor(item);
      setStatus(`Liking ${i + 1}/${targets.length}${author ? ' — ' + author : ''}…`);
      try {
        const btn = findLikeButton(item);
        if (!btn) throw new Error('No like button');
        btn.click();
        done++;
      } catch (e) {
        errors++;
        console.warn('[Bibix Bulk] like error:', e.message);
      }
      // Likes can be a bit faster than replies — still humanlike (1.5–4s)
      if (i < targets.length - 1) await wait(rand(1500, 4000));
    }
    setStatus(`Done. ${done} liked, ${errors} skipped.`);
  }

  // ── Find Contact Info on LinkedIn profile pages (Hunter.io) ────────────────
  const FIND_BTN_CLASS = 'bibix-find-btn';
  const FIND_PROCESSED = 'data-bibix-find-processed';

  function isProfilePage() { return /^\/in\//.test(location.pathname); }

  function extractProfileInfo() {
    // --- JSON-LD first (most reliable, untouched by class renames) ---------
    let ldName = '', ldHeadline = '', ldCompany = '', ldPosition = '';
    document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try {
        const data = JSON.parse(s.textContent || s.innerText || 'null');
        const flat = [];
        const collect = (n) => {
          if (!n) return;
          if (Array.isArray(n)) { n.forEach(collect); return; }
          if (typeof n !== 'object') return;
          flat.push(n);
          if (n['@graph']) collect(n['@graph']);
        };
        collect(data);
        for (const node of flat) {
          if (node['@type'] === 'Person' || node['@type'] === 'ProfilePage') {
            const p = node['@type'] === 'ProfilePage' ? (node.mainEntity || node) : node;
            if (p.name && !ldName) ldName = String(p.name).trim();
            if (p.jobTitle && !ldPosition) ldPosition = String(p.jobTitle).trim();
            if (p.description && !ldHeadline) ldHeadline = String(p.description).trim();
            const wf = p.worksFor;
            if (wf && !ldCompany) {
              if (Array.isArray(wf) && wf[0]) ldCompany = (wf[0].name || '').trim();
              else if (typeof wf === 'object') ldCompany = (wf.name || '').trim();
              else if (typeof wf === 'string') ldCompany = wf.trim();
            }
          }
        }
      } catch (_) {}
    });

    // --- Full name ----------------------------------------------------------
    let fullName = ldName;
    let titleHeadline = '';
    const title = (document.title || '').trim();
    if (!fullName) {
      let m = title.match(/^(.+?)\s+[-–]\s+(.+?)\s*\|\s*LinkedIn/i);
      if (m) { fullName = m[1].trim(); titleHeadline = m[2].trim(); }
    }
    if (!fullName) {
      const m = title.match(/^(.+?)\s*\|\s*LinkedIn/i);
      if (m) fullName = m[1].trim();
    }
    if (!fullName) {
      const h1 = document.querySelector('main h1') || document.querySelector('h1');
      if (h1) {
        const raw = ((h1.innerText || h1.textContent || '').trim()).split('\n')[0].trim();
        fullName = raw.replace(/\s*[·•]\s*\d+(?:st|nd|rd|th)?\+?\s*$/i, '').trim();
      }
    }
    const parts = fullName.split(/\s+/).filter(Boolean);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';

    // --- Headline -----------------------------------------------------------
    let headline = ldHeadline;
    if (!headline) {
      const metaDesc = document.querySelector('meta[name="description"]')
        || document.querySelector('meta[property="og:description"]');
      if (metaDesc) {
        const c = (metaDesc.getAttribute('content') || '').trim();
        const cleaned = c.replace(/\s*\|\s*LinkedIn\s*$/i, '').trim();
        if (cleaned && cleaned !== fullName) headline = cleaned;
      }
    }
    if (!headline && titleHeadline) headline = titleHeadline;
    if (!headline) {
      // Walk up h1's ancestors and parse innerText into lines; the headline
      // is the first non-trivial line right after the name.
      const h1 = document.querySelector('main h1') || document.querySelector('h1');
      if (h1) {
        let p = h1.parentElement;
        for (let i = 0; i < 5 && p && !headline; i++) {
          const lines = (p.innerText || '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
          const nameIdx = lines.findIndex((l) => l.includes(fullName.split(' ')[0]) && l.includes(fullName.split(' ').slice(-1)[0]));
          if (nameIdx >= 0) {
            for (let j = nameIdx + 1; j < Math.min(nameIdx + 6, lines.length); j++) {
              const l = lines[j];
              if (l.length < 8 || l.length > 400) continue;
              if (/^[·•]/.test(l) || /^\d/.test(l)) continue;
              if (/\b(connections?|followers?|mutual|premium|trial|degree)\b/i.test(l)) continue;
              if (/^Contact info/i.test(l)) continue;
              if (l === fullName) continue;
              headline = l; break;
            }
          }
          p = p.parentElement;
        }
      }
    }

    // --- Parse company + position ------------------------------------------
    let company = ldCompany;
    let position = ldPosition;
    if ((!company || !position) && headline) {
      const segs = headline.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
      // Try "X at|@ Y" pattern on each segment first.
      for (const seg of segs) {
        const mm = seg.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
        if (mm) {
          if (!position) position = mm[1].trim();
          if (!company) company = mm[2].trim().split(/\s*[·•,]\s*/)[0].trim();
          break;
        }
      }
      // No "at" — fall back to seg0=company, seg1=position when there are 2+ segs.
      if (!position && !company) {
        if (segs.length >= 2) { company = segs[0]; position = segs[1]; }
        else if (segs.length === 1) { position = segs[0]; }
      }
    }
    // If we still don't have a company, try a /company/ link near the h1.
    if (!company) {
      const h1 = document.querySelector('main h1') || document.querySelector('h1');
      const scope = (h1 && h1.closest('section')) || document.querySelector('main') || document;
      const link = scope.querySelector('a[href*="/company/"]');
      if (link) {
        const txt = ((link.innerText || '').trim().split('\n')[0] || '').trim();
        if (txt && txt.length < 80 && !/^\d/.test(txt)) company = txt;
      }
    }

    const result = {
      firstName, lastName, fullName, headline, company, position,
      linkedinUrl: location.href.split('?')[0],
    };
    console.log('[Bibix Profile Extract]', {
      title: document.title,
      metaDesc: (document.querySelector('meta[name="description"]') || {}).content
        || (document.querySelector('meta[property="og:description"]') || {}).content,
      result,
    });
    return result;
  }

  function injectFindContactButton() {
    if (!isProfilePage()) {
      // Navigating away — remove any floating buttons we injected.
      const find = document.getElementById('bibix-floating-find');
      const save = document.getElementById('bibix-floating-save');
      if (find) find.remove();
      if (save) save.remove();
      return;
    }
    // Vertical stack of floating action buttons in the top-right.
    if (!document.getElementById('bibix-floating-save')) {
      const saveBtn = el('button', {
        id: 'bibix-floating-save',
        className: FIND_BTN_CLASS,
        type: 'button',
        title: 'Save this profile as a candidate in Monday',
        style: {
          position: 'fixed',
          top: '90px',
          right: '24px',
          zIndex: '2147483646',
          padding: '12px 18px',
          fontSize: '14px',
          background: 'linear-gradient(135deg, #4338ca, #6366f1)',
          boxShadow: '0 2px 6px rgba(67, 56, 202, 0.35)',
        },
        onClick: (e) => { e.preventDefault(); e.stopPropagation(); openSaveCandidateDialog(); },
      }, [el('span', { className: 'bibix-spark' }, '💾'), 'Save Contact']);
      document.body.appendChild(saveBtn);
    }
    if (!document.getElementById('bibix-floating-find')) {
      const findBtn = el('button', {
        id: 'bibix-floating-find',
        className: FIND_BTN_CLASS,
        type: 'button',
        title: 'Find this person\'s email via Hunter.io',
        style: {
          position: 'fixed',
          top: '142px',
          right: '24px',
          zIndex: '2147483646',
          padding: '12px 18px',
          fontSize: '14px',
        },
        onClick: (e) => { e.preventDefault(); e.stopPropagation(); openFindContactDialog(); },
      }, [el('span', { className: 'bibix-spark' }, '✨'), 'Find Email']);
      document.body.appendChild(findBtn);
    }
  }

  function openSaveCandidateDialog() {
    closePopover();
    const info = extractProfileInfo();
    const pop = document.createElement('dialog');
    pop.className = 'bibix-popover';
    Object.assign(pop.style, {
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      margin: '0', padding: '20px', background: '#fff', border: '1px solid #e2e8f0',
      borderRadius: '14px', boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
      width: '480px', maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 48px)',
      overflow: 'auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '13px', color: '#1f2937', zIndex: '2147483647',
    });
    pop.innerHTML = `
      <div style="font-weight:700;font-size:14px;margin-bottom:6px;background:linear-gradient(135deg,#4338ca,#6366f1);-webkit-background-clip:text;background-clip:text;color:transparent">
        💾 Save as Candidate
      </div>
      <div style="font-size:11px;color:#94a3b8;margin-bottom:14px">
        Saves this profile to your Monday → LinkedIn → Candidates list.
      </div>
      <div style="margin-bottom:10px">
        <div style="font-size:11px;color:#64748b;margin-bottom:3px">Full name</div>
        <input id="bsc-name" value="${(info.fullName || '').replace(/"/g, '&quot;')}" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;box-sizing:border-box">
      </div>
      <div style="margin-bottom:10px">
        <div style="font-size:11px;color:#64748b;margin-bottom:3px">Current company</div>
        <input id="bsc-company" value="${(info.company || '').replace(/"/g, '&quot;')}" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;box-sizing:border-box">
      </div>
      <div style="margin-bottom:10px">
        <div style="font-size:11px;color:#64748b;margin-bottom:3px">Current position</div>
        <input id="bsc-position" value="${(info.position || '').replace(/"/g, '&quot;')}" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;box-sizing:border-box">
      </div>
      <div style="margin-bottom:14px;font-size:11px;color:#94a3b8">
        LinkedIn URL: <span style="color:#475569">${info.linkedinUrl}</span>
      </div>
      <div id="bsc-status" style="font-size:12px;min-height:18px;margin-bottom:10px"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button id="bsc-close" style="background:#f1f5f9;border:1px solid #e2e8f0;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Cancel</button>
        <button id="bsc-save" style="background:linear-gradient(135deg,#4338ca,#6366f1);color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Save Candidate</button>
      </div>
    `;
    document.documentElement.appendChild(pop);
    try { pop.showModal(); } catch (_) {}
    activeDialog = pop;
    activePopover = pop;

    const status = pop.querySelector('#bsc-status');
    pop.querySelector('#bsc-close').addEventListener('click', () => closePopover());
    pop.addEventListener('click', (e) => { if (e.target === pop) closePopover(); });
    pop.querySelector('#bsc-save').addEventListener('click', async () => {
      const fullName = pop.querySelector('#bsc-name').value.trim();
      const company = pop.querySelector('#bsc-company').value.trim();
      const position = pop.querySelector('#bsc-position').value.trim();
      if (!fullName) { status.innerHTML = '<span style="color:#ef4444">Full name required</span>'; return; }
      status.innerHTML = '<span style="color:#64748b">Saving…</span>';
      const parts = fullName.split(/\s+/);
      const res = await send('saveCandidate', {
        fullName,
        firstName: parts[0] || '',
        lastName: parts.slice(1).join(' '),
        company, position,
        headline: info.headline,
        linkedinUrl: info.linkedinUrl,
      });
      if (res.ok) {
        status.innerHTML = `<span style="color:#10b981">✓ ${res.data.updated ? 'Updated' : 'Saved'} candidate.</span>`;
        setTimeout(() => closePopover(), 1200);
      } else {
        status.innerHTML = `<span style="color:#ef4444">${res.error || 'save failed'}</span>`;
      }
    });
  }

  function openFindContactDialog() {
    closePopover();
    const info = extractProfileInfo();
    const pop = document.createElement('dialog');
    pop.className = 'bibix-popover';
    Object.assign(pop.style, {
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      margin: '0', padding: '20px', background: '#fff', border: '1px solid #e2e8f0',
      borderRadius: '14px', boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
      width: '460px', maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 48px)',
      overflow: 'auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '13px', color: '#1f2937', zIndex: '2147483647',
    });
    pop.innerHTML = `
      <div style="font-weight:700;font-size:14px;margin-bottom:6px;background:linear-gradient(135deg,#4338ca,#6366f1);-webkit-background-clip:text;background-clip:text;color:transparent">
        ✨ Find Contact — Hunter.io
      </div>
      <div style="font-size:11px;color:#94a3b8;margin-bottom:14px">
        We'll use first/last name + company to find a likely work email.
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
        <div>
          <div style="font-size:11px;color:#64748b;margin-bottom:3px">First name</div>
          <input id="bfc-first" value="${(info.firstName || '').replace(/"/g, '&quot;')}" style="width:100%;padding:7px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px">
        </div>
        <div>
          <div style="font-size:11px;color:#64748b;margin-bottom:3px">Last name</div>
          <input id="bfc-last" value="${(info.lastName || '').replace(/"/g, '&quot;')}" style="width:100%;padding:7px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px">
        </div>
      </div>
      <div style="margin-bottom:10px">
        <div style="font-size:11px;color:#64748b;margin-bottom:3px">Company</div>
        <input id="bfc-company" value="${(info.company || '').replace(/"/g, '&quot;')}" placeholder="e.g. Stripe" style="width:100%;padding:7px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px">
      </div>
      <div style="margin-bottom:14px">
        <div style="font-size:11px;color:#64748b;margin-bottom:3px">Company domain <span style="color:#94a3b8">(optional, more accurate)</span></div>
        <input id="bfc-domain" placeholder="e.g. stripe.com" style="width:100%;padding:7px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px">
      </div>
      <div id="bfc-result" style="min-height:30px;margin-bottom:10px"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button id="bfc-close" style="background:#f1f5f9;border:1px solid #e2e8f0;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Close</button>
        <button id="bfc-find" style="background:linear-gradient(135deg,#4338ca,#6366f1);color:#fff;border:none;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Find email</button>
      </div>
    `;
    document.documentElement.appendChild(pop);
    try { pop.showModal(); } catch (_) {}
    activeDialog = pop;
    activePopover = pop;

    const resultDiv = pop.querySelector('#bfc-result');
    pop.querySelector('#bfc-close').addEventListener('click', () => closePopover());
    pop.addEventListener('click', (e) => { if (e.target === pop) closePopover(); });

    pop.querySelector('#bfc-find').addEventListener('click', async () => {
      const firstName = pop.querySelector('#bfc-first').value.trim();
      const lastName = pop.querySelector('#bfc-last').value.trim();
      const company = pop.querySelector('#bfc-company').value.trim();
      const domain = pop.querySelector('#bfc-domain').value.trim();
      if (!firstName || !lastName) { resultDiv.innerHTML = '<span style="color:#ef4444">First and last name required</span>'; return; }
      if (!company && !domain) { resultDiv.innerHTML = '<span style="color:#ef4444">Company or domain required</span>'; return; }
      resultDiv.innerHTML = '<span style="color:#64748b">Looking up…</span>';
      const res = await send('findEmail', {
        firstName, lastName, company, domain,
        linkedinUrl: info.linkedinUrl, headline: info.headline,
      });
      if (!res.ok) {
        resultDiv.innerHTML = `<span style="color:#ef4444">${res.error || 'lookup failed'}</span>`;
        return;
      }
      const d = res.data || {};
      if (!d.email) {
        resultDiv.innerHTML = '<span style="color:#f59e0b">No email found. Try a different domain.</span>';
        return;
      }
      const confidence = d.score != null ? `${d.score}% confidence` : '';
      const cachedTag = d.cached ? ' <span style="color:#10b981;font-size:10px">(cached)</span>' : '';
      resultDiv.innerHTML = `
        <div style="padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
          <div style="font-weight:600;font-size:14px;color:#1f2937">${d.email}${cachedTag}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px">${confidence}${d.position ? ' · ' + d.position : ''}</div>
          <div style="margin-top:10px;display:flex;gap:6px">
            <button id="bfc-copy" style="flex:1;background:#f1f5f9;border:1px solid #e2e8f0;padding:6px 10px;border-radius:6px;font-size:11px;cursor:pointer">Copy email</button>
            <button id="bfc-tocrm" style="flex:1;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer">Save to Monday CRM</button>
          </div>
          <div id="bfc-crm-status" style="font-size:11px;color:#10b981;margin-top:6px"></div>
        </div>`;
      pop.querySelector('#bfc-copy').addEventListener('click', () => {
        navigator.clipboard.writeText(d.email);
        pop.querySelector('#bfc-copy').textContent = 'Copied!';
      });
      pop.querySelector('#bfc-tocrm').addEventListener('click', async () => {
        const status = pop.querySelector('#bfc-crm-status');
        status.textContent = 'Saving…';
        const r = await send('contactToCrm', { contactId: d.contactId });
        if (r.ok) status.textContent = `Saved as CRM contact #${r.data.contactNum}.`;
        else status.textContent = 'Save failed: ' + (r.error || '');
      });
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

  console.log('[Bibix LinkedIn AI] content script loaded (v0.3.7)');
  // Periodic count log to aid debugging in production.
  setInterval(() => {
    const n = document.querySelectorAll('.' + BTN_CLASS).length;
    if (n > 0) return; // only log when zero, to surface visibility issues
    const editors = document.querySelectorAll('[contenteditable="true"]').length;
    if (editors > 0) console.log('[Bibix LinkedIn AI] No buttons injected — editors on page:', editors);
  }, 5000);
})();
