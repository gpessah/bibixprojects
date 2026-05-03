require('dotenv').config();
const db = require('./src/db/database');
const subs = db.prepare('SELECT user_id, created_at FROM push_subscriptions').all();
console.log('VAPID configured:', !!process.env.VAPID_PUBLIC_KEY);
console.log('Push subscriptions:', subs.length);
console.log(JSON.stringify(subs, null, 2));
