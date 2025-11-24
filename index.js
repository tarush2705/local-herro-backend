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

// ---- Mock users stored on backend ----
const USERS = [
  { id: 'u1', name: 'Aditi', profession: 'Doctor', latitude: 19.071, longitude: 72.881 },
  { id: 'u2', name: 'Rohan', profession: 'Security', latitude: 19.068, longitude: 72.876 },
  { id: 'u3', name: 'Imran', profession: 'Engineer', latitude: 19.075, longitude: 72.885 },
  { id: 'u4', name: 'Meera', profession: 'Teacher', latitude: 19.062, longitude: 72.872 },
  { id: 'u5', name: 'Vikram', profession: 'Volunteer', latitude: 19.082, longitude: 72.89 },
];

// ---- API: /nearby-users ----
// GET /nearby-users?lat=19.07&lng=72.88&radiusKm=5
app.get('/nearby-users', (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radiusKm = parseFloat(req.query.radiusKm || '5');

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: 'lat and lng query params are required' });
  }

  const result = USERS.map((u) => {
    const distanceKm = haversineKm(lat, lng, u.latitude, u.longitude);
    return { ...u, distanceKm };
  }).filter((u) => u.distanceKm <= radiusKm);

  res.json(result);
});

// Basic root route
app.get('/', (req, res) => {
  res.send('Local Herro backend is running');
});

app.listen(PORT, () => {
  console.log(`Local Herro backend listening on port ${PORT}`);
});
