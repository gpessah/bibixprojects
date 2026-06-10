// Run this once via cPanel → Node.js → Run JS script
// It patches admin.js and index.js directly on the server

const fs = require('fs');
const path = require('path');

const adminPath = path.join(__dirname, 'src/routes/admin.js');
const content = fs.readFileSync(adminPath, 'utf8');

const groupsCode = `
// ── User Groups ───────────────────────────────────────────────────────────────

router.get('/groups', authenticate, requireAdmin, (req, res) => {
  try {
    try { db.exec("CREATE TABLE IF NOT EXISTS user_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT DEFAULT '#0073ea', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"); } catch(_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS user_group_members (group_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (group_id, user_id))"); } catch(_) {}
    try { db.exec("ALTER TABLE user_groups ADD COLUMN color TEXT DEFAULT '#0073ea'"); } catch(_) {}
    const groups = db.prepare("SELECT id, name, color, created_at, 0 as member_count FROM user_groups ORDER BY name ASC").all();
    res.json(groups);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/groups', authenticate, requireSuperAdmin, (req, res) => {
  try {
    try { db.exec("CREATE TABLE IF NOT EXISTS user_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT DEFAULT '#0073ea', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"); } catch(_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS user_group_members (group_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (group_id, user_id))"); } catch(_) {}
    const { name, color } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
    const { v4: uid } = require('uuid');
    const id = uid();
    db.prepare("INSERT INTO user_groups (id, name, color) VALUES (?, ?, ?)").run(id, name.trim(), color || '#0073ea');
    res.json(db.prepare("SELECT * FROM user_groups WHERE id = ?").get(id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/groups/:id', authenticate, requireSuperAdmin, (req, res) => {
  try {
    const { name, color } = req.body;
    db.prepare("UPDATE user_groups SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ?").run(name && name.trim() || null, color || null, req.params.id);
    res.json(db.prepare("SELECT * FROM user_groups WHERE id = ?").get(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/groups/:id', authenticate, requireSuperAdmin, (req, res) => {
  try {
    db.prepare("DELETE FROM user_groups WHERE id = ?").run(req.params.id);
    db.prepare("DELETE FROM user_group_members WHERE group_id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/users/:id/groups', authenticate, requireSuperAdmin, (req, res) => {
  try {
    const { group_ids } = req.body;
    if (!Array.isArray(group_ids)) return res.status(400).json({ error: 'group_ids array required' });
    try { db.exec("CREATE TABLE IF NOT EXISTS user_group_members (group_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (group_id, user_id))"); } catch(_) {}
    db.prepare("DELETE FROM user_group_members WHERE user_id = ?").run(req.params.id);
    for (const gid of group_ids) {
      try { db.prepare("INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)").run(gid, req.params.id); } catch(_) {}
    }
    const groups = db.prepare("SELECT g.id, g.name, g.color FROM user_group_members ugm JOIN user_groups g ON g.id = ugm.group_id WHERE ugm.user_id = ?").all(req.params.id);
    res.json(groups);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

`;

const marker = "router.post('/groups'";
if (content.includes(marker)) {
  console.log('Groups routes already present in admin.js — no changes needed.');
} else {
  const patched = content.replace('module.exports = router;', groupsCode + '\nmodule.exports = router;');
  fs.writeFileSync(adminPath, patched, 'utf8');
  console.log('SUCCESS: Groups routes added to admin.js');
}

console.log('Done. Now restart the Node.js app in cPanel.');
