require('dotenv').config({ path: __dirname + '/../.env' });
const db = require('../src/db/database');
const { sendPushToUser } = require('../src/services/pushNotifications');

const due = db.prepare(
  "SELECT * FROM bot_reminders WHERE push_sent = 0 AND datetime(remind_at) <= datetime('now')"
).all();

for (const rem of due) {
  try {
    sendPushToUser(rem.user_id, '⏰ Reminder', rem.content);
    db.prepare('UPDATE bot_reminders SET push_sent = 1 WHERE id = ?').run(rem.id);
    console.log(new Date().toISOString(), 'Sent reminder:', rem.content);
  } catch (e) {
    console.error(new Date().toISOString(), 'Error:', e.message);
  }
}

// Allow async push to complete before exiting
setTimeout(() => process.exit(0), 3000);
