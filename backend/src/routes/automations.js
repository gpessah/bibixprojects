const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function canAccessBoard(boardId, userId) {
  return db.prepare(`
    SELECT b.id FROM boards b
    JOIN workspace_members wm ON b.workspace_id = wm.workspace_id
    WHERE b.id = ? AND wm.user_id = ?
  `).get(boardId, userId);
}

router.get('/board/:boardId', authenticate, (req, res) => {
  if (!canAccessBoard(req.params.boardId, req.user.id)) return res.status(403).json({ error: 'Access denied' });
  const automations = db.prepare('SELECT * FROM automations WHERE board_id = ? ORDER BY created_at ASC')
    .all(req.params.boardId);
  res.json(automations.map(a => ({
    ...a,
    trigger_config: JSON.parse(a.trigger_config),
    action_config: JSON.parse(a.action_config),
  })));
});

router.post('/', authenticate, (req, res) => {
  const { board_id, name, trigger_type, trigger_config, action_type, action_config } = req.body;
  if (!board_id || !trigger_type || !action_type) return res.status(400).json({ error: 'Missing required fields' });
  if (!canAccessBoard(board_id, req.user.id)) return res.status(403).json({ error: 'Access denied' });

  const id = uuidv4();
  db.prepare('INSERT INTO automations (id, board_id, name, trigger_type, trigger_config, action_type, action_config, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, board_id, name || 'New Automation', trigger_type,
      JSON.stringify(trigger_config || {}), action_type,
      JSON.stringify(action_config || {}), req.user.id);

  const automation = db.prepare('SELECT * FROM automations WHERE id = ?').get(id);
  res.json({ ...automation, trigger_config: JSON.parse(automation.trigger_config), action_config: JSON.parse(automation.action_config) });
});

router.put('/:id', authenticate, (req, res) => {
  const automation = db.prepare('SELECT * FROM automations WHERE id = ?').get(req.params.id);
  if (!automation) return res.status(404).json({ error: 'Automation not found' });
  if (!canAccessBoard(automation.board_id, req.user.id)) return res.status(403).json({ error: 'Access denied' });

  const { name, enabled, trigger_config, action_config } = req.body;
  db.prepare('UPDATE automations SET name = COALESCE(?, name), enabled = COALESCE(?, enabled), trigger_config = COALESCE(?, trigger_config), action_config = COALESCE(?, action_config) WHERE id = ?')
    .run(name || null, enabled !== undefined ? (enabled ? 1 : 0) : null,
      trigger_config ? JSON.stringify(trigger_config) : null,
      action_config ? JSON.stringify(action_config) : null,
      req.params.id);

  const updated = db.prepare('SELECT * FROM automations WHERE id = ?').get(req.params.id);
  res.json({ ...updated, trigger_config: JSON.parse(updated.trigger_config), action_config: JSON.parse(updated.action_config) });
});

router.delete('/:id', authenticate, (req, res) => {
  const automation = db.prepare('SELECT * FROM automations WHERE id = ?').get(req.params.id);
  if (!automation) return res.status(404).json({ error: 'Automation not found' });
  if (!canAccessBoard(automation.board_id, req.user.id)) return res.status(403).json({ error: 'Access denied' });
  db.prepare('DELETE FROM automations WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

function runAutomations(boardId, triggerType, context, dbInstance) {
  const dbRef = dbInstance || db;
  const automations = dbRef.prepare('SELECT * FROM automations WHERE board_id = ? AND enabled = 1 AND trigger_type = ?')
    .all(boardId, triggerType);

  for (const auto of automations) {
    try {
      const triggerConfig = JSON.parse(auto.trigger_config);
      const actionConfig = JSON.parse(auto.action_config);

      if (!matchesTrigger(triggerType, triggerConfig, context)) continue;

      executeAction(auto.action_type, actionConfig, context, dbRef);
    } catch (e) { /* skip broken automations */ }
  }
}

function matchesTrigger(type, config, ctx) {
  if (type === 'value_changed') {
    if (config.column_id && ctx.column?.id !== config.column_id) return false;
    if (config.to_value && ctx.newValue !== config.to_value) return false;
    return true;
  }
  if (type === 'item_created') return true;
  return false;
}

function executeAction(type, config, ctx, dbRef) {
  if (type === 'notify') {
    const targetUsers = config.user_ids || [];
    for (const userId of targetUsers) {
      dbRef.prepare('INSERT INTO notifications (id, user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?, ?)')
        .run(uuidv4(), userId, 'automation',
          config.title || `Automation triggered on "${ctx.item?.name}"`,
          config.body || '',
          `/board/${ctx.item?.board_id}/item/${ctx.item?.id}`);
    }
  } else if (type === 'set_value') {
    if (ctx.item && config.column_id) {
      dbRef.prepare(`
        INSERT INTO item_values (id, item_id, column_id, value) VALUES (?, ?, ?, ?)
        ON CONFLICT(item_id, column_id) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `).run(uuidv4(), ctx.item.id, config.column_id, config.value || null);
    }
  }
}

module.exports = router;
module.exports.runAutomations = runAutomations;
