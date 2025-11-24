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

// Remove users who have been offline too long
const STALE_MS = 2 * 60 * 1000; // 2 minutes

function prunePresence() {
  const now = Date.now();
  for (const [id, u] of presenceMap.entries()) {
    if (now - u.lastSeen > STALE_MS) {
      presenceMap.delete(id);
    }
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

// Basic root route
app.get('/', (req, res) => {
  res.send('Local Herro presence backend is running');
});

app.listen(PORT, () => {
  console.log(`Local Herro backend listening on port ${PORT}`);
});
