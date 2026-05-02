const webpush = require('web-push');
const db = require('../db/database');

// Setup VAPID
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:admin@bibix.ailabstech.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// Create push_subscriptions table
db.exec(`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    subscription TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

function sendPushToUser(userId, title, body, data) {
  if (!process.env.VAPID_PUBLIC_KEY) return;
  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
  subs.forEach(row => {
    try {
      const subscription = JSON.parse(row.subscription);
      webpush.sendNotification(subscription, JSON.stringify({ title, body, data: data || {} }))
        .catch(err => {
          // Remove invalid/expired subscriptions
          if (err.statusCode === 410 || err.statusCode === 404) {
            db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(row.id);
          }
        });
    } catch (e) {}
  });
}

module.exports = { sendPushToUser };
