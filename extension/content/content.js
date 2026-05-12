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
    let p = node;
    while (p && p !== document.body) {
      if (p.matches && (
        p.matches('[data-urn^="urn:li:activity"]') ||
        p.matches('.feed-shared-update-v2') ||
        p.matches('.scaffold-finite-scroll__content article') ||
        p.matches('article')
      )) return p;
      p = p.parentElement;
    }
    return null;
  }

  function extractPostText(container) {
    if (!container) return '';
    const textNode = container.querySelector(
      '.update-components-text, .feed-shared-update-v2__description, .feed-shared-text, .update-components-update-v2__commentary'
    );
    let text = textNode ? textNode.innerText : container.innerText;
    return (text || '').trim().replace(/\s+\n/g, '\n').slice(0, 3000);
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
    const top = window.scrollY + rect.bottom + 6;
    const left = Math.min(window.scrollX + rect.left, window.scrollX + window.innerWidth - 380);
    pop.style.top = top + 'px';
    pop.style.left = Math.max(8, left) + 'px';

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

  // ── Inject buttons next to comment boxes ─────────────────────────────────────
  function injectIntoCommentBox(box) {
    if (!box || box.getAttribute(PROCESSED_ATTR)) return;
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
        const postText = extractPostText(postContainer);
        const author = extractAuthor(postContainer);
        const url = extractPostUrl(postContainer);
        openPopover(btn, {
          title: 'Comment',
          runGenerate: () => send('generateComment', { postText, authorName: author, postUrl: url }),
          onInsert: (text) => insertText(editor, text),
        });
      },
    }, [el('span', { className: 'bibix-spark' }, '✨'), 'AI Comment']);

    host.insertBefore(btn, host.firstChild);
  }

  function injectIntoReplyBox(box) {
    if (!box || box.getAttribute(PROCESSED_ATTR)) return;
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
    return /comments?-comment-box|comments?-comment-texteditor|comments?-comments?-box|comment-box|share-creation-state|contribution-prompt/i.test(cls);
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
    // Find a reasonable container to inject the button into. Walk up looking
    // for the comment-box-ish wrapper; fall back to the editor's parent.
    return ancestorMatching(editor, looksLikeCommentBox) || editor.parentElement;
  }

  function scan() {
    const editors = document.querySelectorAll(
      '.ql-editor[contenteditable="true"], div[contenteditable="true"][role="textbox"]'
    );
    editors.forEach((editor) => {
      const host = findEditorHost(editor);
      if (!host || host.getAttribute(PROCESSED_ATTR) === '1') return;

      if (looksLikeContributionBox(host) || looksLikeContributionBox(editor.closest('[class*="contribution"]') || document.body)) {
        injectIntoContributionBox(host);
      } else if (looksLikeReplyBox(host) || ancestorMatching(host, looksLikeReplyBox, 4)) {
        injectIntoReplyBox(host);
      } else {
        injectIntoCommentBox(host);
      }
    });

    // Also inject for collapsed comment-box placeholders that haven't yet
    // rendered a contenteditable (LinkedIn lazy-mounts these on focus).
    document.querySelectorAll('.comments-comment-box, [class*="comments-comment-box"]').forEach((box) => {
      if (box.getAttribute(PROCESSED_ATTR) === '1') return;
      if (box.querySelector('[contenteditable="true"]')) return; // handled above
      // Placeholder — inject anyway so the button is visible even before user clicks
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

  console.log('[Bibix LinkedIn AI] content script loaded (v0.1.1)');
})();
