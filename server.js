/**
 * DLMS Energy Meter API Server (MySQL Version)
 */

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// === DB connection ===
const pool = mysql.createPool({
  host: 'localhost',
  user: 'meteruser',
  password: 'password',  // 🔁 change this
  database: 'meter_db',             // 🔁 change if different DB name
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// === Middleware ===
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// === Initialize tables (if not exists) ===
async function initializeDatabase() {
  const createMeters = `
    CREATE TABLE IF NOT EXISTS meters (
      id INT AUTO_INCREMENT PRIMARY KEY,
      meter_id VARCHAR(50) UNIQUE NOT NULL,
      location VARCHAR(100),
      device_info TEXT,
      first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `;
  const createReadings = `
    CREATE TABLE IF NOT EXISTS meter_readings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      meter_id VARCHAR(50) NOT NULL,
      timestamp DATETIME NOT NULL,
      sequence_number INT,
      obis_code VARCHAR(50) NOT NULL,
      description VARCHAR(255),
      value DOUBLE NOT NULL,
      unit VARCHAR(20),
      scaler INT,
      received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX(meter_id), INDEX(timestamp),
      FOREIGN KEY (meter_id) REFERENCES meters(meter_id)
    )
  `;

  const conn = await pool.getConnection();
  await conn.query(createMeters);
  await conn.query(createReadings);
  conn.release();

  console.log('✅ MySQL tables ready');
}

// ==========================================
// API key middleware
// ==========================================
const validateApiKey = (req, res, next) => {
  const header = req.headers.authorization;
  const apiKey = header && header.split(' ')[1];
  const validKeys = ['poc_demo_key_2024', 'demo_key_12345'];
  if (!apiKey || !validKeys.includes(apiKey)) {
    return res.status(401).json({ status: 'error', message: 'Invalid API key' });
  }
  next();
};

// ==========================================
// Logger
// ==========================================
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} - ${req.originalUrl}`);
  next();
});

// ==========================================
// POST meter readings
// ==========================================
app.post('/api/v1/meter-readings', validateApiKey, async (req, res) => {
  const { meter_id, location, timestamp, sequence, device_info, readings } = req.body;

  if (!meter_id || !Array.isArray(readings)) {
    return res.status(400).json({ status: 'error', message: 'Invalid payload' });
  }
  if (readings.length > 100) {
    return res.status(400).json({ status: 'error', message: 'Too many readings (max 100)' });
  }

  try {
    const conn = await pool.getConnection();

    // Insert/Update meter
    await conn.query(
      `INSERT INTO meters (meter_id, location, device_info, last_seen)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         location = VALUES(location),
         device_info = VALUES(device_info),
         last_seen = CURRENT_TIMESTAMP`,
      [meter_id, location, JSON.stringify(device_info || {})]
    );

    // Insert readings
    const sql = `
      INSERT INTO meter_readings
      (meter_id, timestamp, sequence_number, obis_code, description, value, unit, scaler)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    for (let r of readings) {
      await conn.query(sql, [
        meter_id, timestamp, sequence,
        r.obis_code, r.description,
        r.value, r.unit, r.scaler
      ]);
    }

    conn.release();
    return res.json({ status: 'success', readings_received: readings.length });
  } catch (err) {
    console.error('DB error:', err);
    return res.status(500).json({ status: 'error', message: 'DB error' });
  }
});

// ==========================================
// GET all meters
// ==========================================
app.get('/api/v1/meters', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT m.*, COUNT(r.id) AS total_readings, MAX(r.timestamp) AS latest_reading_time
      FROM meters m
      LEFT JOIN meter_readings r ON m.meter_id = r.meter_id
      GROUP BY m.meter_id
      ORDER BY m.last_seen DESC
    `);
    const data = rows.map(r => ({
      meter_id: r.meter_id,
      location: r.location,
      device_info: JSON.parse(r.device_info || '{}'),
      total_readings: r.total_readings,
      first_seen: r.first_seen,
      last_seen: r.last_seen,
      latest_reading_time: r.latest_reading_time,
      status: isOnline(r.last_seen) ? 'online' : 'offline'
    }));
    res.json({ status: 'success', data });
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'DB error' });
  }
});

// ==========================================
// GET latest readings by meter
// ==========================================
app.get('/api/v1/meters/:meterId/latest', async (req, res) => {
  const meterId = req.params.meterId;
  const limit = parseInt(req.query.limit) || 1;

  try {
    const [rows] = await pool.query(
      `SELECT * FROM meter_readings WHERE meter_id=? ORDER BY timestamp DESC, id DESC LIMIT ?`,
      [meterId, limit * 10]
    );
    const out = {};
    rows.forEach(r => {
      if (!out[r.timestamp]) {
        out[r.timestamp] = { timestamp: r.timestamp, sequence_number: r.sequence_number, readings: [] };
      }
      out[r.timestamp].readings.push({
        obis_code: r.obis_code,
        description: r.description,
        value: r.value,
        unit: r.unit,
        scaler: r.scaler
      });
    });
    res.json({ status: 'success', data: Object.values(out).slice(0, limit) });
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'DB error' });
  }
});

// ==========================================
// Simple dashboard data
// ==========================================
app.get('/api/v1/dashboard/data', async (req, res) => {
  try {
    const [meterInfo] = await pool.query(`SELECT * FROM meters ORDER BY last_seen DESC LIMIT 1`);
    const meter_id = meterInfo.length ? meterInfo[0].meter_id : null;

    const [latest] = await pool.query(
      `SELECT * FROM meter_readings WHERE meter_id=? ORDER BY timestamp DESC, id DESC LIMIT 10`,
      [meter_id]
    );

    const [daily] = await pool.query(`
      SELECT DATE(timestamp) AS date,
             COUNT(*) AS reading_count,
             AVG(CASE WHEN obis_code='1.0.1.7.0.255' THEN value END) AS avg_power
      FROM meter_readings
      WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
    `);

    res.json({ status: 'success', data: { meterInfo, latest, daily }});
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'DB error' });
  }
});

// ==========================================
// Health
// ==========================================
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (e) {
    res.json({ status: 'unhealthy' });
  }
});

// ==========================================
// Dashboard
// ==========================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// 404
app.use('*', (_, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found'
  });
});

function isOnline(last) {
  const diff = (Date.now() - new Date(last)) / 60000;
  return diff < 2;
}

// Start
initializeDatabase();
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
