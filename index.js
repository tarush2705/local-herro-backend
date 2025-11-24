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

// ---- In-memory presence store ----
// key: deviceId -> { id, name, profession, latitude, longitude, lastSeen }
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

// ---- In-memory chat messages ----
// each: { id, fromId, fromName, profession, latitude, longitude, text, timestamp }
const messages = [];
const MAX_MESSAGES = 200;

// Remove very old messages (e.g., older than 30 minutes)
const MESSAGE_TTL_MS = 30 * 60 * 1000;

function pruneMessages() {
  const cutoff = Date.now() - MESSAGE_TTL_MS;
  while (messages.length && messages[0].timestamp < cutoff) {
    messages.shift();
  }
}

// ---- POST /presence ----
// Body: { id, name, profession, latitude, longitude }
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

// ---- GET /nearby-users ----
// /nearby-users?lat=...&lng=...&radiusKm=5&selfId=abc
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
    if (selfId && u.id === selfId) continue; // don't return yourself

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

// ---- POST /messages ----
// Body: { fromId, fromName, profession, latitude, longitude, text }
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

// ---- GET /messages ----
// /messages?lat=...&lng=...&radiusKm=5
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
    .sort((a, b) => a.timestamp - b.timestamp); // oldest first

  res.json(nearby);
});

// Basic root route
app.get('/', (req, res) => {
  res.send('Local Herro presence + chat backend is running');
});

app.listen(PORT, () => {
  console.log(`Local Herro backend listening on port ${PORT}`);
});
