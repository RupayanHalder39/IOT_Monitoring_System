const mqtt = require('mqtt');
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const MQTT_HOST = process.env.MQTT_HOST || 'broker.emqx.io';
const MQTT_PORT = process.env.MQTT_PORT || '1883';
const MQTT_PROTOCOL = process.env.MQTT_PROTOCOL || 'mqtt';
const MQTT_TOPICS = (process.env.MQTT_TOPICS || '/SATL/room1,/SATL/room2,/SATL/room3,/SATL/room4')
  .split(',')
  .map(t => t.trim())
  .filter(Boolean);
const PUBLISH_INTERVAL_MS = Number(process.env.DEV_PUBLISH_INTERVAL_MS || '1000');

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRoomIndex(topic) {
  const match = topic.match(/room(\\d+)/i);
  if (!match) return 1;
  const idx = parseInt(match[1], 10);
  return Number.isFinite(idx) ? idx : 1;
}

function generatePayloadForRoom(roomIndex) {
  // Offset ranges per room to make data visibly different
  const tempBase = 18 + roomIndex * 2; // room1 -> 20, room4 -> 26
  const humidityBase = 35 + roomIndex * 5; // room1 -> 40, room4 -> 55
  const gasBase = 20 + roomIndex * 7; // room1 -> 27, room4 -> 48
  const oxygenBase = 82 + roomIndex; // room1 -> 83, room4 -> 86

  return {
    temperature: randomInt(tempBase, tempBase + 10),
    humidity: randomInt(humidityBase, humidityBase + 25),
    gas: randomInt(gasBase, gasBase + 25),
    oxygen: randomInt(oxygenBase, oxygenBase + 12)
  };
}

const clientId = 'dev-sim-' + Math.random().toString(16).slice(2);
const hostURL = `${MQTT_PROTOCOL}://${MQTT_HOST}:${MQTT_PORT}`;
const options = {
  keepalive: 60,
  clientId,
  protocolId: 'MQTT',
  protocolVersion: 4,
  clean: true,
  reconnectPeriod: 1000,
  connectTimeout: 30 * 1000
};

const client = mqtt.connect(hostURL, options);

client.on('connect', () => {
  console.log(`[simulate-mqtt] Connected to ${hostURL} as ${clientId}`);
  console.log(`[simulate-mqtt] Publishing to topics: ${MQTT_TOPICS.join(', ')}`);

  setInterval(() => {
    MQTT_TOPICS.forEach(topic => {
      const roomIndex = getRoomIndex(topic);
      const payload = JSON.stringify(generatePayloadForRoom(roomIndex));
      client.publish(topic, payload, { qos: 0 }, (err) => {
        if (err) {
          console.error(`[simulate-mqtt] Publish error on ${topic}:`, err && err.stack ? err.stack : String(err));
          return;
        }
        console.log(`[simulate-mqtt] Published to ${topic}: ${payload}`);
      });
    });
  }, PUBLISH_INTERVAL_MS);
});

client.on('error', (err) => {
  console.error('[simulate-mqtt] MQTT error:', err && err.stack ? err.stack : String(err));
});
