const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Return VAPID public key (needed by browser to subscribe)
router.get('/key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

// Save a push subscription for the logged-in user
router.post('/subscribe', authenticate, (req, res) => {
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint) return res.status(400).json({ error: 'Invalid subscription' });

  // Check if already exists
  const existing = db.prepare('SELECT id FROM push_subscriptions WHERE user_id = ? AND subscription LIKE ?')
    .get(req.user.id, '%' + subscription.endpoint + '%');
  if (existing) return res.json({ success: true, existing: true });

  db.prepare('INSERT INTO push_subscriptions (id, user_id, subscription) VALUES (?, ?, ?)')
    .run(uuidv4(), req.user.id, JSON.stringify(subscription));
  res.json({ success: true });
});

// Remove a push subscription
router.post('/unsubscribe', authenticate, (req, res) => {
  const { endpoint } = req.body;
  if (endpoint) {
    db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND subscription LIKE ?')
      .run(req.user.id, '%' + endpoint + '%');
  }
  res.json({ success: true });
});

module.exports = router;
