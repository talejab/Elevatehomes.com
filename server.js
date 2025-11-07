// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Config - set these in your environment
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'support@elevatekeyhome.com';
const DOMAIN = process.env.DOMAIN || 'elevatekeyhome.com';

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public'))); // place html/css in /public

// Initialize DB
const db = new sqlite3.Database('./consent.db');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS sms_consents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT UNIQUE,
    consent INTEGER,
    source TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Helper to upsert
function upsertConsent(name, phone, consent, source, cb){
  const stmt = `INSERT INTO sms_consents (name, phone, consent, source)
    VALUES (?,?,?,?)
    ON CONFLICT(phone) DO UPDATE SET name=excluded.name, consent=excluded.consent, source=excluded.source, updated_at=CURRENT_TIMESTAMP`;
  db.run(stmt, [name, phone, consent ? 1 : 0, source], function(err){
    cb(err, this);
  });
}

// Signup endpoint
app.post('/api/subscribe', (req, res) => {
  const { name, phone, consent, source } = req.body;
  if (!phone || !consent) {
    return res.status(400).json({ error: 'Missing phone or consent' });
  }
  upsertConsent(name||'', phone, 1, source||'site', (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'DB error' });
    }
    // TODO: Optionally send confirmation SMS via your SMS provider (Twilio, etc.)
    return res.json({ message: 'Signup recorded. Please check your messages to confirm.' });
  });
});

// Unsubscribe endpoint (for your UI or carrier webhook)
app.post('/api/unsubscribe', (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Missing phone' });
  const stmt = `UPDATE sms_consents SET consent=0, updated_at=CURRENT_TIMESTAMP WHERE phone = ?`;
  db.run(stmt, [phone], function(err){
    if (err) { console.error(err); return res.status(500).json({ error: 'DB error' }); }
    return res.json({ message: 'Unsubscribed' });
  });
});

// Simple endpoint to view consents (protect in production)
app.get('/admin/consents', (req, res) => {
  db.all('SELECT id,name,phone,consent,source,created_at,updated_at FROM sms_consents ORDER BY created_at DESC LIMIT 200', [], (err, rows) => {
    if (err) return res.status(500).send('DB error');
    res.json(rows);
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
