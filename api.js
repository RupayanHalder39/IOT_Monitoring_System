const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 4115;

// Basic CORS for local dev (UI served from http://localhost:8000)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Configuration variable to control HTTP or HTTPS
const useHTTPS = false; // Change to true to use HTTPS instead of HTTPS

// Frontend config for dev mode
app.get('/config.js', (req, res) => {
  const devMode = String(process.env.DEV_MODE || '').toLowerCase() === 'true';
  const autoRotate = String(process.env.AUTO_ROTATE_ROOMS || '').toLowerCase() === 'true';
  const rotateInterval = Number(process.env.ROTATE_INTERVAL_MS || '10000');
  const pollInterval = Number(process.env.POLL_INTERVAL_MS || '60000');
  const apiBase = process.env.API_BASE_URL || `http://localhost:${PORT}`;
  const reactUi = String(process.env.REACT_UI || '').toLowerCase() === 'true';
  const reactUiDevUrl = process.env.REACT_UI_DEV_URL || 'http://localhost:5173';
  const historyWindowHours = Number(process.env.HISTORY_WINDOW_HOURS || '24');
  res.setHeader('Content-Type', 'application/javascript');
  res.end(
    `window.__DEV_MODE__ = ${devMode ? 'true' : 'false'};` +
    `window.__AUTO_ROTATE__ = ${autoRotate ? 'true' : 'false'};` +
    `window.__ROTATE_INTERVAL_MS__ = ${Number.isFinite(rotateInterval) ? rotateInterval : 10000};` +
    `window.__POLL_INTERVAL_MS__ = ${Number.isFinite(pollInterval) ? pollInterval : 60000};` +
    `window.__API_BASE_URL__ = "${apiBase}";` +
    `window.__REACT_UI__ = ${reactUi ? 'true' : 'false'};` +
    `window.__REACT_UI_DEV_URL__ = "${reactUiDevUrl}";` +
    `window.__HISTORY_WINDOW_HOURS__ = ${Number.isFinite(historyWindowHours) ? historyWindowHours : 24};`
  );
});

// JSON config for modern clients (React)
app.get('/config.json', (req, res) => {
  const devMode = String(process.env.DEV_MODE || '').toLowerCase() === 'true';
  const autoRotate = String(process.env.AUTO_ROTATE_ROOMS || '').toLowerCase() === 'true';
  const rotateInterval = Number(process.env.ROTATE_INTERVAL_MS || '10000');
  const pollInterval = Number(process.env.POLL_INTERVAL_MS || '60000');
  const apiBase = process.env.API_BASE_URL || `http://localhost:${PORT}`;
  const reactUi = String(process.env.REACT_UI || '').toLowerCase() === 'true';
  const reactUiDevUrl = process.env.REACT_UI_DEV_URL || 'http://localhost:5173';
  const historyWindowHours = Number(process.env.HISTORY_WINDOW_HOURS || '24');
  res.json({
    devMode,
    autoRotate,
    rotateIntervalMs: Number.isFinite(rotateInterval) ? rotateInterval : 10000,
    pollIntervalMs: Number.isFinite(pollInterval) ? pollInterval : 60000,
    apiBase,
    reactUi,
    reactUiDevUrl,
    historyWindowHours: Number.isFinite(historyWindowHours) ? historyWindowHours : 24
  });
});

// Load SSL/TLS certificates
const options = {
  key: fs.readFileSync('server.key'),
  cert: fs.readFileSync('server.crt')
};

function logError(context, err) {
  if (!err) return;
  const message = err && err.stack ? err.stack : String(err);
  console.error(`[api.js] ${context}:\n${message}`);
}

process.on('uncaughtException', (err) => {
  logError('uncaughtException', err);
});

process.on('unhandledRejection', (err) => {
  logError('unhandledRejection', err);
});

// Endpoint to fetch live data for all parameters
app.get('/api/live-data', (req, res) => {
    try {
        const roomNo = req.query.room;
        console.log(`[api.js] /api/live-data called with room=${roomNo}`);
        const query = 'SELECT temperature, humidity, gas, oxygen FROM all_room_data WHERE room_no = ?';

        pool.getConnection((err, connection) => {
            if (err) {
                logError('Error getting MySQL connection in /api/live-data', err);
                return res.status(500).json({ error: 'Internal server error' });
            }

            connection.query(query, [roomNo], (error, results, fields) => {
                connection.release();
                if (error) {
                    logError('Error fetching room data in /api/live-data', error);
                    return res.status(500).json({ error: 'Internal server error' });
                }

                if (results.length === 0) {
                    console.warn(`[api.js] /api/live-data no rows for room=${roomNo}`);
                    return res.status(404).json({ error: 'Room not found' });
                }

                const roomData = results[0];
                res.json(roomData);
            });
        });
    } catch (err) {
        logError('Exception in /api/live-data handler', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint to fetch specific data type for a room
app.get('/api/all-data', (req, res) => {
    try {
        const roomNo = req.query.room;
        const dataType = req.query.type;
        const limitParam = Number(req.query.limit || '200');
        const windowHoursParam = Number(req.query.window_hours || '24');
        console.log(`[api.js] /api/all-data called with room=${roomNo} type=${dataType} limit=${limitParam}`);

        if (!dataType || !['temperature', 'humidity', 'gas', 'oxygen'].includes(dataType)) {
            return res.status(400).json({ error: 'Invalid or missing data type' });
        }

        const table = normalizeRoomTable(roomNo);
        if (!table) {
            return res.status(400).json({ error: 'Invalid room' });
        }
        const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 2000) : 200;
        const windowHours = Number.isFinite(windowHoursParam) && windowHoursParam > 0 ? windowHoursParam : 24;
        const query = `
            SELECT id, ${dataType}, DATE_FORMAT(timestamp, '%Y-%m-%d %H:%i:%s') AS timestamp
            FROM ${table}
            WHERE timestamp >= DATE_SUB(
              (SELECT MAX(timestamp) FROM ${table}),
              INTERVAL ? HOUR
            )
            ORDER BY timestamp ASC
            LIMIT ?
        `;

        pool.getConnection((err, connection) => {
            if (err) {
                logError('Error getting MySQL connection in /api/all-data', err);
                return res.status(500).json({ error: 'Internal server error' });
            }

            connection.query(query, [windowHours, limit], (error, results, fields) => {
                connection.release();
                if (error) {
                    logError('Error fetching room data in /api/all-data', error);
                    return res.status(500).json({ error: 'Internal server error' });
                }

                if (results.length === 0) {
                    console.warn(`[api.js] /api/all-data no rows for room=${roomNo}`);
                    return res.status(404).json({ error: 'Room not found' });
                }

                res.json(results);
            });
        });
    } catch (err) {
        logError('Exception in /api/all-data handler', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint to fetch hourly data for a room and date
app.get('/api/hour-data', (req, res) => {
    try {
        const roomNo = req.query.room_no;
        const timestamp = req.query.timestamp;
        console.log(`[api.js] /api/hour-data called with room_no=${roomNo} timestamp=${timestamp}`);

        if (!roomNo || !timestamp) {
            return res.status(400).json({ error: 'Missing room_no or timestamp' });
        }

        const query = 'SELECT * FROM hour_all_data WHERE room_no = ? AND DATE(last_updated) = ?';

        pool.getConnection((err, connection) => {
            if (err) {
                logError('Error getting MySQL connection in /api/hour-data', err);
                return res.status(500).json({ error: 'Internal server error' });
            }

            connection.query(query, [roomNo, timestamp], (error, results, fields) => {
                connection.release();
                if (error) {
                    logError('Error fetching hourly data in /api/hour-data', error);
                    return res.status(500).json({ error: 'Internal server error' });
                }

                res.json(results);
            });
        });
    } catch (err) {
        logError('Exception in /api/hour-data handler', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint to fetch daily data for a room and date
app.get('/api/daily-data', (req, res) => {
    try {
        const roomNo = req.query.room_no;
        const timestamp = req.query.timestamp;
        console.log(`[api.js] /api/daily-data called with room_no=${roomNo} timestamp=${timestamp}`);

        if (!roomNo || !timestamp) {
            return res.status(400).json({ error: 'Missing room_no or timestamp' });
        }

        const query = 'SELECT * FROM day_all_data WHERE room_no = ? AND DATE(last_updated) = ?';

        pool.getConnection((err, connection) => {
            if (err) {
                logError('Error getting MySQL connection in /api/daily-data', err);
                return res.status(500).json({ error: 'Internal server error' });
            }

            connection.query(query, [roomNo, timestamp], (error, results, fields) => {
                connection.release();
                if (error) {
                    logError('Error fetching daily data in /api/daily-data', error);
                    return res.status(500).json({ error: 'Internal server error' });
                }

                res.json(results);
            });
        });
    } catch (err) {
        logError('Exception in /api/daily-data handler', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Latest available hour_data date for a room
app.get('/api/latest-hour-date', (req, res) => {
    try {
        const roomNo = req.query.room_no;
        if (!roomNo) {
            return res.status(400).json({ error: 'Missing room_no' });
        }
        const query = 'SELECT DATE(MAX(last_updated)) AS last_date FROM hour_all_data WHERE room_no = ?';
        pool.getConnection((err, connection) => {
            if (err) {
                logError('Error getting MySQL connection in /api/latest-hour-date', err);
                return res.status(500).json({ error: 'Internal server error' });
            }
            connection.query(query, [roomNo], (error, results) => {
                connection.release();
                if (error) {
                    logError('Error fetching latest hour date', error);
                    return res.status(500).json({ error: 'Internal server error' });
                }
                const lastDate = results && results[0] ? results[0].last_date : null;
                res.json({ date: lastDate });
            });
        });
    } catch (err) {
        logError('Exception in /api/latest-hour-date', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Latest available day_data date for a room
app.get('/api/latest-day-date', (req, res) => {
    try {
        const roomNo = req.query.room_no;
        if (!roomNo) {
            return res.status(400).json({ error: 'Missing room_no' });
        }
        const query = 'SELECT DATE(MAX(last_updated)) AS last_date FROM day_all_data WHERE room_no = ?';
        pool.getConnection((err, connection) => {
            if (err) {
                logError('Error getting MySQL connection in /api/latest-day-date', err);
                return res.status(500).json({ error: 'Internal server error' });
            }
            connection.query(query, [roomNo], (error, results) => {
                connection.release();
                if (error) {
                    logError('Error fetching latest day date', error);
                    return res.status(500).json({ error: 'Internal server error' });
                }
                const lastDate = results && results[0] ? results[0].last_date : null;
                res.json({ date: lastDate });
            });
        });
    } catch (err) {
        logError('Exception in /api/latest-day-date', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Recent daily data range for a room
app.get('/api/daily-range', (req, res) => {
    try {
        const roomNo = req.query.room_no;
        const days = Number(req.query.days || '7');
        if (!roomNo) {
            return res.status(400).json({ error: 'Missing room_no' });
        }
        const limit = Number.isFinite(days) && days > 0 ? days : 7;
        const query = `
            SELECT *
            FROM day_all_data
            WHERE room_no = ?
            ORDER BY last_updated DESC
            LIMIT ?
        `;
        pool.getConnection((err, connection) => {
            if (err) {
                logError('Error getting MySQL connection in /api/daily-range', err);
                return res.status(500).json({ error: 'Internal server error' });
            }
            connection.query(query, [roomNo, limit], (error, results) => {
                connection.release();
                if (error) {
                    logError('Error fetching daily range', error);
                    return res.status(500).json({ error: 'Internal server error' });
                }
                res.json(results);
            });
        });
    } catch (err) {
        logError('Exception in /api/daily-range', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Helpers for room table access
function normalizeRoomTable(roomNo) {
    const allowed = new Set(['room1', 'room2', 'room3', 'room4']);
    return allowed.has(roomNo) ? roomNo : null;
}

// Latest available date in room table
app.get('/api/latest-room-date', (req, res) => {
    try {
        const roomNo = req.query.room;
        const table = normalizeRoomTable(roomNo);
        if (!table) {
            return res.status(400).json({ error: 'Invalid room' });
        }
        const query = `SELECT DATE(MAX(timestamp)) AS last_date FROM ${table}`;
        pool.getConnection((err, connection) => {
            if (err) {
                logError('Error getting MySQL connection in /api/latest-room-date', err);
                return res.status(500).json({ error: 'Internal server error' });
            }
            connection.query(query, (error, results) => {
                connection.release();
                if (error) {
                    logError('Error fetching latest room date', error);
                    return res.status(500).json({ error: 'Internal server error' });
                }
                const lastDate = results && results[0] ? results[0].last_date : null;
                res.json({ date: lastDate });
            });
        });
    } catch (err) {
        logError('Exception in /api/latest-room-date', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Room data for a specific date
app.get('/api/room-history', (req, res) => {
    try {
        const roomNo = req.query.room;
        const date = req.query.date;
        const table = normalizeRoomTable(roomNo);
        if (!table || !date) {
            return res.status(400).json({ error: 'Missing or invalid room/date' });
        }
        const query = `
            SELECT
              DATE_FORMAT(timestamp, '%Y-%m-%d %H:%i:%s') AS timestamp,
              temperature, humidity, gas, oxygen
            FROM ${table}
            WHERE DATE(timestamp) = ?
            ORDER BY timestamp
        `;
        pool.getConnection((err, connection) => {
            if (err) {
                logError('Error getting MySQL connection in /api/room-history', err);
                return res.status(500).json({ error: 'Internal server error' });
            }
            connection.query(query, [date], (error, results) => {
                connection.release();
                if (error) {
                    logError('Error fetching room history', error);
                    return res.status(500).json({ error: 'Internal server error' });
                }
                res.json(results);
            });
        });
    } catch (err) {
        logError('Exception in /api/room-history', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Daily aggregates for last N days from room table
app.get('/api/room-daily-range', (req, res) => {
    try {
        const roomNo = req.query.room;
        const days = Number(req.query.days || '7');
        const table = normalizeRoomTable(roomNo);
        if (!table) {
            return res.status(400).json({ error: 'Invalid room' });
        }
        const limit = Number.isFinite(days) && days > 0 ? days : 7;
        const query = `
            SELECT
              DATE(timestamp) AS day,
              MIN(temperature) AS t_min,
              MAX(temperature) AS t_max,
              MIN(humidity) AS h_min,
              MAX(humidity) AS h_max,
              MIN(gas) AS g_min,
              MAX(gas) AS g_max,
              MIN(oxygen) AS o_min,
              MAX(oxygen) AS o_max
            FROM ${table}
            WHERE timestamp >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY DATE(timestamp)
            ORDER BY day DESC
            LIMIT ?
        `;
        pool.getConnection((err, connection) => {
            if (err) {
                logError('Error getting MySQL connection in /api/room-daily-range', err);
                return res.status(500).json({ error: 'Internal server error' });
            }
            connection.query(query, [limit, limit], (error, results) => {
                connection.release();
                if (error) {
                    logError('Error fetching room daily range', error);
                    return res.status(500).json({ error: 'Internal server error' });
                }
                res.json(results);
            });
        });
    } catch (err) {
        logError('Exception in /api/room-daily-range', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Create HTTP or HTTPS server based on configuration
const server = useHTTPS ? https.createServer(options, app) : http.createServer(app);

// React UI serving (optional)
const reactUiEnabled = String(process.env.REACT_UI || '').toLowerCase() === 'true';
const reactUiDevUrl = process.env.REACT_UI_DEV_URL || 'http://localhost:5173';
const reactDist = path.join(__dirname, 'frontend', 'dist');
const reactIndex = path.join(reactDist, 'index.html');

// Legacy static UI (HTML/CSS/JS)
app.use('/legacy', express.static(__dirname));

if (reactUiEnabled && fs.existsSync(reactDist)) {
  app.use(express.static(reactDist));
  app.get('/ui', (req, res) => res.sendFile(reactIndex));
} else if (reactUiEnabled) {
  app.get('/ui', (req, res) => res.redirect(reactUiDevUrl));
}

server.listen(PORT, () => {
    console.log(`API server listening on port ${PORT}`);
});
