// index.js
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// ---- Utility: haversine distance in km ----
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ---- Presence store (for Maps nearby users) ----
const presenceMap = new Map();
const STALE_MS = 2 * 60 * 1000; // 2 minutes

function prunePresence() {
  const now = Date.now();
  for (const [id, u] of presenceMap.entries()) {
    if (now - u.lastSeen > STALE_MS) {
      presenceMap.delete(id);
    }
  }
}

// ---- Public nearby-chat messages (HomeScreen nearby chat) ----
const messages = [];
const MAX_MESSAGES = 200;
const MESSAGE_TTL_MS = 30 * 60 * 1000;

function pruneMessages() {
  const cutoff = Date.now() - MESSAGE_TTL_MS;
  while (messages.length && messages[0].timestamp < cutoff) {
    messages.shift();
  }
}

// ---- Help alerts (multi-device) ----
// each: {
//   id, type, message, latitude, longitude,
//   requestedById, requestedByName, requestedPhone,
//   timestamp, acceptedById, acceptedByName, acceptedPhone, acceptedAt
// }
const helpAlerts = [];
const HELP_ALERT_TTL_MS = 60 * 60 * 1000; // 1 hour

function pruneHelpAlerts() {
  const cutoff = Date.now() - HELP_ALERT_TTL_MS;
  while (helpAlerts.length && helpAlerts[0].timestamp < cutoff) {
    helpAlerts.shift();
  }
}

// ---- Private messages per alert ----
// each: { id, alertId, fromId, fromName, text, timestamp }
const directMessages = [];
const DIRECT_MSG_TTL_MS = 60 * 60 * 1000;

function pruneDirectMessages() {
  const cutoff = Date.now() - DIRECT_MSG_TTL_MS;
  while (directMessages.length && directMessages[0].timestamp < cutoff) {
    directMessages.shift();
  }
}

// ---------------- Presence / Nearby users ----------------

// POST /presence
app.post('/presence', (req, res) => {
  const { id, name, profession, latitude, longitude } = req.body || {};

  if (!id || typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({
      error: 'id, latitude and longitude are required in request body',
    });
  }

  const now = Date.now();
  presenceMap.set(id, {
    id,
    name: name || 'Guest user',
    profession: profession || 'Citizen',
    latitude,
    longitude,
    lastSeen: now,
  });

  prunePresence();

  return res.json({ ok: true });
});

// GET /nearby-users?lat=...&lng=...&radiusKm=5&selfId=abc
app.get('/nearby-users', (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radiusKm = parseFloat(req.query.radiusKm || '5');
  const selfId = req.query.selfId || null;

  if (isNaN(lat) || isNaN(lng)) {
    return res
      .status(400)
      .json({ error: 'lat and lng query params are required' });
  }

  prunePresence();

  const result = [];
  for (const u of presenceMap.values()) {
    if (selfId && u.id === selfId) continue;

    const distanceKm = haversineKm(lat, lng, u.latitude, u.longitude);
    if (distanceKm <= radiusKm) {
      result.push({
        id: u.id,
        name: u.name,
        profession: u.profession,
        latitude: u.latitude,
        longitude: u.longitude,
        distanceKm,
      });
    }
  }

  res.json(result);
});

// ---------------- Nearby public chat (Home) ----------------

// POST /messages
app.post('/messages', (req, res) => {
  const { fromId, fromName, profession, latitude, longitude, text } = req.body || {};

  if (!fromId || typeof latitude !== 'number' || typeof longitude !== 'number' || !text) {
    return res.status(400).json({
      error: 'fromId, latitude, longitude and text are required',
    });
  }

  const msg = {
    id: Date.now().toString() + '-' + Math.floor(Math.random() * 1e6).toString(36),
    fromId,
    fromName: fromName || 'Guest user',
    profession: profession || 'Citizen',
    latitude,
    longitude,
    text: text.slice(0, 500),
    timestamp: Date.now(),
  };

  messages.push(msg);
  pruneMessages();
  if (messages.length > MAX_MESSAGES) {
    messages.splice(0, messages.length - MAX_MESSAGES);
  }

  return res.json({ ok: true, message: msg });
});

// GET /messages?lat=...&lng=...&radiusKm=5
app.get('/messages', (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radiusKm = parseFloat(req.query.radiusKm || '5');

  if (isNaN(lat) || isNaN(lng)) {
    return res
      .status(400)
      .json({ error: 'lat and lng query params are required' });
  }

  pruneMessages();

  const nearby = messages
    .filter((m) => {
      const d = haversineKm(lat, lng, m.latitude, m.longitude);
      return d <= radiusKm;
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  res.json(nearby);
});

// ---------------- Multi-device HELP alerts ----------------

// POST /help-alerts
// Body: { fromId, fromName, phone, type, message, latitude, longitude }
app.post('/help-alerts', (req, res) => {
  const { fromId, fromName, phone, type, message, latitude, longitude } = req.body || {};

  if (!fromId || !message || typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({
      error: 'fromId, message, latitude and longitude are required',
    });
  }

  const alert = {
    id: Date.now().toString() + '-' + Math.floor(Math.random() * 1e6).toString(36),
    type: type || 'HELP',
    message: message.slice(0, 500),
    latitude,
    longitude,
    requestedById: fromId,
    requestedByName: fromName || 'Guest user',
    requestedPhone: phone || null,
    timestamp: Date.now(),
    acceptedById: null,
    acceptedByName: null,
    acceptedPhone: null,
    acceptedAt: null,
  };

  helpAlerts.push(alert);
  pruneHelpAlerts();

  return res.json({ ok: true, alert });
});

// GET /help-alerts?lat=...&lng=...&radiusKm=5&excludeId=dev-123
app.get('/help-alerts', (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radiusKm = parseFloat(req.query.radiusKm || '5');
  const excludeId = req.query.excludeId || null;

  if (isNaN(lat) || isNaN(lng)) {
    return res
      .status(400)
      .json({ error: 'lat and lng query params are required' });
  }

  pruneHelpAlerts();

  const result = helpAlerts
    .filter((a) => {
      if (excludeId && a.requestedById === excludeId) return false; // don't show your own
      const d = haversineKm(lat, lng, a.latitude, a.longitude);
      return d <= radiusKm;
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  res.json(result);
});

// GET /help-alerts/:id
app.get('/help-alerts/:id', (req, res) => {
  const id = req.params.id;
  pruneHelpAlerts();
  const alert = helpAlerts.find((a) => a.id === id);
  if (!alert) {
    return res.status(404).json({ error: 'Alert not found' });
  }
  res.json(alert);
});

// POST /help-alerts/:id/accept
// Body: { helperId, helperName, helperPhone }
app.post('/help-alerts/:id/accept', (req, res) => {
  const id = req.params.id;
  const { helperId, helperName, helperPhone } = req.body || {};

  if (!helperId) {
    return res.status(400).json({ error: 'helperId is required' });
  }

  pruneHelpAlerts();
  const alert = helpAlerts.find((a) => a.id === id);
  if (!alert) {
    return res.status(404).json({ error: 'Alert not found' });
  }

  alert.acceptedById = helperId;
  alert.acceptedByName = helperName || 'Helper';
  alert.acceptedPhone = helperPhone || null;
  alert.acceptedAt = Date.now();

  return res.json({ ok: true, alert });
});

// ---------------- Private messages per alert ----------------

// GET /help-alerts/:id/messages
app.get('/help-alerts/:id/messages', (req, res) => {
  const alertId = req.params.id;
  pruneDirectMessages();
  const msgs = directMessages
    .filter((m) => m.alertId === alertId)
    .sort((a, b) => a.timestamp - b.timestamp);
  res.json(msgs);
});

// POST /help-alerts/:id/messages
// Body: { fromId, fromName, text }
app.post('/help-alerts/:id/messages', (req, res) => {
  const alertId = req.params.id;
  const { fromId, fromName, text } = req.body || {};

  if (!fromId || !text) {
    return res.status(400).json({ error: 'fromId and text are required' });
  }

  pruneDirectMessages();

  const msg = {
    id: Date.now().toString() + '-' + Math.floor(Math.random() * 1e6).toString(36),
    alertId,
    fromId,
    fromName: fromName || 'User',
    text: text.slice(0, 500),
    timestamp: Date.now(),
  };

  directMessages.push(msg);
  res.json({ ok: true, message: msg });
});

// ---------------- Root ----------------
app.get('/', (req, res) => {
  res.send('Local Herro presence + chat + help backend is running');
});

app.listen(PORT, () => {
  console.log(`Local Herro backend listening on port ${PORT}`);
});
