const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
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
  res.setHeader('Content-Type', 'application/javascript');
  res.end(`window.__DEV_MODE__ = ${devMode ? 'true' : 'false'};`);
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
        console.log(`[api.js] /api/all-data called with room=${roomNo} type=${dataType}`);

        if (!dataType || !['temperature', 'humidity', 'gas', 'oxygen'].includes(dataType)) {
            return res.status(400).json({ error: 'Invalid or missing data type' });
        }

        const query = `SELECT id, ${dataType}, DATE_FORMAT(timestamp, '%Y-%m-%d %H:%i:%s') AS timestamp FROM ${roomNo}`;

        pool.getConnection((err, connection) => {
            if (err) {
                logError('Error getting MySQL connection in /api/all-data', err);
                return res.status(500).json({ error: 'Internal server error' });
            }

            connection.query(query, (error, results, fields) => {
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

// Create HTTP or HTTPS server based on configuration
const server = useHTTPS ? https.createServer(options, app) : http.createServer(app);

server.listen(PORT, () => {
    console.log(`API server listening on port ${PORT}`);
});
