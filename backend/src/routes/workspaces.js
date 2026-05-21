const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function canManageWorkspace(workspaceId, userId) {
  const m = db.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(workspaceId, userId);
  return m && (m.role === 'owner' || m.role === 'admin');
}

router.get('/', authenticate, (req, res) => {
  const workspaces = db.prepare(`
    SELECT w.*, wm.role, wm.access FROM workspaces w
    JOIN workspace_members wm ON w.id = wm.workspace_id
    WHERE wm.user_id = ?
    ORDER BY w.created_at ASC
  `).all(req.user.id);
  res.json(workspaces);
});

router.post('/', authenticate, (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = uuidv4();
  db.prepare('INSERT INTO workspaces (id, name, description, created_by) VALUES (?, ?, ?, ?)')
    .run(id, name, description || null, req.user.id);
  db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role, access) VALUES (?, ?, ?, ?)')
    .run(id, req.user.id, 'owner', 'edit');
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
  res.json({ ...workspace, role: 'owner', access: 'edit' });
});

router.put('/:id', authenticate, (req, res) => {
  const member = db.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Access denied' });
  const { name, description } = req.body;
  db.prepare('UPDATE workspaces SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ?')
    .run(name || null, description || null, req.params.id);
  res.json(db.prepare('SELECT * FROM workspaces WHERE id = ?').get(req.params.id));
});

router.delete('/:id', authenticate, (req, res) => {
  const member = db.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!member || member.role !== 'owner') return res.status(403).json({ error: 'Only owner can delete workspace' });
  db.prepare('DELETE FROM workspaces WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Get members
router.get('/:id/members', authenticate, (req, res) => {
  const isMember = db.prepare('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!isMember) return res.status(403).json({ error: 'Access denied' });
  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar_color, u.role as user_role,
           wm.role, wm.access, wm.joined_at
    FROM workspace_members wm JOIN users u ON wm.user_id = u.id
    WHERE wm.workspace_id = ?
    ORDER BY wm.joined_at ASC
  `).all(req.params.id);
  res.json(members);
});

// Add member
router.post('/:id/members', authenticate, (req, res) => {
  if (!canManageWorkspace(req.params.id, req.user.id)) return res.status(403).json({ error: 'Access denied' });
  const { user_id, role, access } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  const user = db.prepare('SELECT id, name, email, avatar_color FROM users WHERE id = ?').get(user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const existing = db.prepare('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get(req.params.id, user_id);
  if (existing) return res.status(409).json({ error: 'Already a member' });
  const validAccess = ['edit', 'readonly'];
  db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role, access) VALUES (?, ?, ?, ?)')
    .run(req.params.id, user_id, role || 'member', validAccess.includes(access) ? access : 'edit');
  res.json({ success: true });
});

// Update member role/access
router.put('/:id/members/:userId', authenticate, (req, res) => {
  if (!canManageWorkspace(req.params.id, req.user.id)) return res.status(403).json({ error: 'Access denied' });
  const { role, access } = req.body;
  const target = db.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get(req.params.id, req.params.userId);
  if (!target) return res.status(404).json({ error: 'Member not found' });
  if (target.role === 'owner') return res.status(400).json({ error: 'Cannot change owner role' });
  const validAccess = ['edit', 'readonly'];
  db.prepare('UPDATE workspace_members SET role = COALESCE(?, role), access = COALESCE(?, access) WHERE workspace_id = ? AND user_id = ?')
    .run(role || null, validAccess.includes(access) ? access : null, req.params.id, req.params.userId);
  res.json({ success: true });
});

// Remove member
router.delete('/:id/members/:userId', authenticate, (req, res) => {
  if (!canManageWorkspace(req.params.id, req.user.id)) return res.status(403).json({ error: 'Access denied' });
  const target = db.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get(req.params.id, req.params.userId);
  if (!target) return res.status(404).json({ error: 'Member not found' });
  if (target.role === 'owner') return res.status(400).json({ error: 'Cannot remove owner' });
  db.prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .run(req.params.id, req.params.userId);
  res.json({ success: true });
});

// Get all users for adding to workspace (admin/owner only), filtered by group visibility
router.get('/:id/available-users', authenticate, (req, res) => {
  if (!canManageWorkspace(req.params.id, req.user.id)) return res.status(403).json({ error: 'Access denied' });
  const caller = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
  const notInWorkspace = 'u.id NOT IN (SELECT user_id FROM workspace_members WHERE workspace_id = ?)';

  // super_admin and admin see all users
  if (caller && (caller.role === 'super_admin' || caller.role === 'admin')) {
    return res.json(db.prepare(`SELECT u.id, u.name, u.email, u.avatar_color, u.role FROM users u WHERE ${notInWorkspace}`).all(req.params.id));
  }

  // Regular user with no groups: only see super_admin/admin
  const callerGroups = db.prepare('SELECT group_id FROM user_group_members WHERE user_id = ?').all(req.user.id);
  if (callerGroups.length === 0) {
    return res.json(db.prepare(`SELECT u.id, u.name, u.email, u.avatar_color, u.role FROM users u WHERE u.role IN ('super_admin','admin') AND ${notInWorkspace}`).all(req.params.id));
  }

  // Regular user with groups: see users sharing at least one group + super_admin/admin
  const users = db.prepare(`
    SELECT DISTINCT u.id, u.name, u.email, u.avatar_color, u.role FROM users u
    WHERE (
      EXISTS (
        SELECT 1 FROM user_group_members ugm1
        JOIN user_group_members ugm2 ON ugm1.group_id = ugm2.group_id
        WHERE ugm1.user_id = ? AND ugm2.user_id = u.id
      )
      OR u.role IN ('super_admin','admin')
    )
    AND ${notInWorkspace}
  `).all(req.user.id, req.params.id);
  res.json(users);
});

module.exports = router;
