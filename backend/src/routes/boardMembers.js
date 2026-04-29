const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

function canManageBoard(boardId, userId) {
  // Workspace owners/admins can manage, and board owners
  const board = db.prepare('SELECT workspace_id FROM boards WHERE id = ?').get(boardId);
  if (!board) return false;
  const wsMember = db.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get(board.workspace_id, userId);
  if (wsMember && (wsMember.role === 'owner' || wsMember.role === 'admin')) return true;
  const boardMember = db.prepare('SELECT role FROM board_members WHERE board_id = ? AND user_id = ?')
    .get(boardId, userId);
  return boardMember && boardMember.role === 'owner';
}

// Ensure board_members table exists
db.exec(`CREATE TABLE IF NOT EXISTS board_members (
  board_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  access TEXT NOT NULL DEFAULT 'edit',
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (board_id, user_id),
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`);

// GET /boards/:boardId/members
router.get('/', authenticate, (req, res) => {
  const { boardId } = req.params;
  const board = db.prepare('SELECT workspace_id FROM boards WHERE id = ?').get(boardId);
  if (!board) return res.status(404).json({ error: 'Board not found' });
  const isMember = db.prepare('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get(board.workspace_id, req.user.id);
  const isBoardMember = db.prepare('SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?')
    .get(boardId, req.user.id);
  if (!isMember && !isBoardMember) return res.status(403).json({ error: 'Access denied' });

  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar_color,
           bm.role, bm.access, bm.joined_at
    FROM board_members bm JOIN users u ON bm.user_id = u.id
    WHERE bm.board_id = ?
    ORDER BY bm.joined_at ASC
  `).all(boardId);
  res.json(members);
});

// GET /boards/:boardId/available-users
router.get('/available-users', authenticate, (req, res) => {
  const { boardId } = req.params;
  if (!canManageBoard(boardId, req.user.id)) return res.status(403).json({ error: 'Access denied' });
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar_color
    FROM users u
    WHERE u.id NOT IN (SELECT user_id FROM board_members WHERE board_id = ?)
  `).all(boardId);
  res.json(users);
});

// POST /boards/:boardId/members
router.post('/', authenticate, (req, res) => {
  const { boardId } = req.params;
  if (!canManageBoard(boardId, req.user.id)) return res.status(403).json({ error: 'Access denied' });
  const { user_id, access } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  const existing = db.prepare('SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?')
    .get(boardId, user_id);
  if (existing) return res.status(409).json({ error: 'Already a member' });
  db.prepare('INSERT INTO board_members (board_id, user_id, role, access) VALUES (?, ?, ?, ?)')
    .run(boardId, user_id, 'member', access === 'readonly' ? 'readonly' : 'edit');
  res.json({ success: true });
});

// PUT /boards/:boardId/members/:userId
router.put('/:userId', authenticate, (req, res) => {
  const { boardId, userId } = req.params;
  if (!canManageBoard(boardId, req.user.id)) return res.status(403).json({ error: 'Access denied' });
  const { access } = req.body;
  db.prepare('UPDATE board_members SET access = ? WHERE board_id = ? AND user_id = ?')
    .run(access === 'readonly' ? 'readonly' : 'edit', boardId, userId);
  res.json({ success: true });
});

// DELETE /boards/:boardId/members/:userId
router.delete('/:userId', authenticate, (req, res) => {
  const { boardId, userId } = req.params;
  if (!canManageBoard(boardId, req.user.id)) return res.status(403).json({ error: 'Access denied' });
  const target = db.prepare('SELECT role FROM board_members WHERE board_id = ? AND user_id = ?')
    .get(boardId, userId);
  if (!target) return res.status(404).json({ error: 'Member not found' });
  if (target.role === 'owner') return res.status(400).json({ error: 'Cannot remove owner' });
  db.prepare('DELETE FROM board_members WHERE board_id = ? AND user_id = ?').run(boardId, userId);
  res.json({ success: true });
});

module.exports = router;
