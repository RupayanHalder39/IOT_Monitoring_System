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

function testDbConnection() {
    pool.getConnection((err, connection) => {
        if (err) {
            logError('DB connection failed', err);
            return;
        }
        connection.query('SELECT 1 AS ok', (queryErr, results) => {
            if (queryErr) {
                logError('DB test query failed', queryErr);
                connection.release();
                return;
            }
            console.log('[start.js] DB test query success:', results && results[0] ? results[0] : results);
            connection.release();
        });
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

// DB smoke test (SELECT 1)
testDbConnection();

// Optional dev data generator (publishes MQTT messages)
const useDevData = String(process.env.USE_DEV_DATA || '').toLowerCase() === 'true';
if (useDevData) {
    runFile('DevTestSoftwareData/simulate-mqtt.js');
}

// Run api.js
runFile('api.js');

// Run mqtt-listener.js
runFile('mqtt-listener.js');
