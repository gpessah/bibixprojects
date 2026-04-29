const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

// Ensure uploads dir exists
const UPLOADS_DIR = path.join(__dirname, '../../data/uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// Create table if not exists
db.exec(`CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
)`);

// GET /api/items/:itemId/attachments
router.get('/', authenticate, (req, res) => {
  const attachments = db.prepare('SELECT * FROM attachments WHERE item_id = ? ORDER BY created_at DESC').all(req.params.itemId);
  res.json(attachments);
});

// POST /api/items/:itemId/attachments
router.post('/', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const id = uuidv4();
  db.prepare('INSERT INTO attachments (id, item_id, filename, original_name, mime_type, size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.params.itemId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.user.id);
  const att = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
  res.json(att);
});

// DELETE /api/items/:itemId/attachments/:id
router.delete('/:id', authenticate, (req, res) => {
  const att = db.prepare('SELECT * FROM attachments WHERE id = ? AND item_id = ?').get(req.params.id, req.params.itemId);
  if (!att) return res.status(404).json({ error: 'Not found' });
  try { fs.unlinkSync(path.join(UPLOADS_DIR, att.filename)); } catch {}
  db.prepare('DELETE FROM attachments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
module.exports.UPLOADS_DIR = UPLOADS_DIR;
