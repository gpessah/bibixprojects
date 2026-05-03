require('dotenv').config();
const { sendPushToUser } = require('./src/services/pushNotifications');
const db = require('./src/db/database');

// Send test push to all users with subscriptions
const subs = db.prepare('SELECT DISTINCT user_id FROM push_subscriptions').all();
console.log('Sending test push to', subs.length, 'user(s)...');
subs.forEach(row => {
  sendPushToUser(row.user_id, '🔔 Test Notification', 'Push notifications are working!');
  console.log('Sent to user:', row.user_id);
});

// Also send any overdue reminders
const due = db.prepare("SELECT * FROM bot_reminders WHERE push_sent = 0 AND remind_at <= datetime('now')").all();
console.log('Overdue reminders:', due.length);
due.forEach(rem => {
  sendPushToUser(rem.user_id, '⏰ Reminder', rem.content);
  db.prepare('UPDATE bot_reminders SET push_sent = 1 WHERE id = ?').run(rem.id);
  console.log('Reminder sent:', rem.content);
});

setTimeout(() => process.exit(0), 3000);
