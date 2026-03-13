//This section is to start the API Server and MQTT Listener Server at the same time
require('dotenv').config();
const { exec } = require('child_process');
const pool = require('./db');

function logError(context, err) {
    if (!err) return;
    const message = err && err.stack ? err.stack : String(err);
    console.error(`[start.js] ${context}:\n${message}`);
}

process.on('uncaughtException', (err) => {
    logError('uncaughtException', err);
});

process.on('unhandledRejection', (err) => {
    logError('unhandledRejection', err);
});

function validateEnv() {
    const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        console.error(`[start.js] Missing required env vars: ${missing.join(', ')}`);
        process.exit(1);
    }
}

function testDbConnection(cb) {
    pool.getConnection((err, connection) => {
        if (err) {
            logError('DB connection failed', err);
            return cb(err);
        }
        connection.query('SELECT 1 AS ok', (queryErr, results) => {
            if (queryErr) {
                logError('DB test query failed', queryErr);
                connection.release();
                return cb(queryErr);
            }
            console.log('[start.js] DB test query success:', results && results[0] ? results[0] : results);
            connection.release();
            return cb(null);
        });
    });
}

function checkSchema(cb) {
    const requiredTables = [
        'all_room_data',
        'avg_all_room_data',
        'hour_all_data',
        'day_all_data'
    ];

    const dbName = String(process.env.DB_NAME || '').trim();
    const query = `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = ?
          AND table_name IN (${requiredTables.map(() => '?').join(', ')})
    `;

    pool.query(query, [dbName, ...requiredTables], (err, rows) => {
        if (err) {
            logError('Schema check failed', err);
            return cb(err);
        }
        const existing = new Set(rows.map((r) => (r.table_name || r.TABLE_NAME)));
        const missing = requiredTables.filter((t) => !existing.has(t));
        if (missing.length > 0) {
            console.error(`[start.js] Missing required tables: ${missing.join(', ')}`);
            return cb(new Error('Missing required tables'));
        }
        console.log('[start.js] Schema check passed');
        return cb(null);
    });
}

function runFile(fileName) {
    const child = exec(`node ${fileName}`);

    child.stdout.on('data', (data) => {
        console.log(`${fileName} : ${data}`);
    });

    child.stderr.on('data', (data) => {
        console.error(`${fileName} error: ${data}`);
    });

    child.on('close', (code) => {
        console.log(`${fileName} child process exited with code ${code}`);
    });
}

function startServices() {
    // Optional dev data generator (publishes MQTT messages)
    const useDevData = String(process.env.USE_DEV_DATA || '').toLowerCase() === 'true';
    if (useDevData) {
        runFile('DevTestSoftwareData/simulate-mqtt.js');
    }

    // Run api.js
    runFile('api.js');

    // Run mqtt-listener.js
    runFile('mqtt-listener.js');
}

validateEnv();
testDbConnection((err) => {
    if (err) process.exit(1);
    checkSchema((schemaErr) => {
        if (schemaErr) process.exit(1);
        startServices();
    });
});
