function getRoomFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('room') || '1';
}

let roomNumber = getRoomFromUrl(); // Default to Room 1 if no room parameter is provided
const API_BASE = typeof window !== 'undefined' && window.__API_BASE_URL__
  ? window.__API_BASE_URL__
  : 'http://localhost:4115';
const POLL_INTERVAL_MS = typeof window !== 'undefined' && Number(window.__POLL_INTERVAL_MS__) > 0
  ? Number(window.__POLL_INTERVAL_MS__)
  : 60000;

// Function to live-update values of temperature, humidity, gas, and oxygen
function updateValues() {
    fetch(`${API_BASE}/api/live-data?room=room${roomNumber}&_ts=${Date.now()}`, {
      cache: 'no-store'
    })
      .then(response => response.json())
      .then(data => {
        if (!data || data.error) {
          throw new Error(data && data.error ? data.error : 'No data');
        }
        document.getElementById('temperature').textContent = data.temperature;
        document.getElementById('humidity').textContent = data.humidity;
        document.getElementById('pressure').textContent = data.gas;
        document.getElementById('altitude').textContent = data.oxygen;
      })
      .catch(error => {
        console.error('Error fetching live data:', error);
        document.getElementById('temperature').textContent = 'N/A';
        document.getElementById('humidity').textContent = 'N/A';
        document.getElementById('pressure').textContent = 'N/A';
        document.getElementById('altitude').textContent = 'N/A';
      });
}

setInterval(() => {
  updateValues();
}, POLL_INTERVAL_MS); // Update data at configured interval

function setRoom(newRoomNumber, updateUrl = true) {
  roomNumber = String(newRoomNumber);
  document.getElementById('room-title').textContent = `Room ${roomNumber}`;
  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomNumber);
    window.history.replaceState({}, '', url.toString());
  }
  updateValues();
  // Trigger graph refresh for current room
  const types = ['temperature', 'humidity', 'gas', 'oxygen'];
  types.forEach(type => updateGraph(type));
}

// Update room title on load
document.getElementById('room-title').textContent = `Room ${roomNumber}`;
// Fetch initial values immediately on load
updateValues();

async function fetchHistoricalData(type) {
  try {
    const response = await fetch(`${API_BASE}/api/all-data?room=room${roomNumber}&type=${type}&_ts=${Date.now()}`, {
      cache: 'no-store'
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching ${type} historical data:`, error);
    return null;
  }
}

function createGraph(data, type) {
  const formattedData = formatDataForPlot(data, type);
  const timeValues = getTimeValues(data, 5);

  const existingLayout = document.getElementById(`${type}-history`).layout;
  const existingConfig = document.getElementById(`${type}-history`).config;
  const layout = {
    title: `${type.charAt(0).toUpperCase() + type.slice(1)} History`,
    xaxis: {
      title: 'Time',
      tickmode: 'array',
      tickvals: timeValues,
      ticktext: timeValues.map(time => time.split(' ')[1]),
      automargin: true
    },
    yaxis: {
      title: `${type.charAt(0).toUpperCase() + type.slice(1)}`
    },
    autosize: true
  };
  const config = {
    responsive: true
  };
  Plotly.react(`${type}-history`, [{
    x: formattedData.x,
    y: formattedData.y,
    type: 'scatter',
    mode: 'lines+markers'
  }], { ...existingLayout, title: `${type.charAt(0).toUpperCase() + type.slice(1)} History` }, existingConfig);
}

async function updateGraph(type) {
  const historicalData = await fetchHistoricalData(type);

  if (historicalData) {
    createGraph(historicalData, type);
  } else {
    console.error(`Failed to load ${type} historical data.`);
  }
}

function getTimeValues(data, numPoints) {
  const totalPoints = data.length;
  const step = Math.floor(totalPoints / (numPoints - 1));
  const timeValues = [];
  for (let i = 0; i < numPoints; i++) {
    const index = i * step;
    if (index < totalPoints) {
      timeValues.push(data[index].timestamp);
    }
  }
  return timeValues;
}

function formatDataForPlot(data, type) {
  const xValues = data.map(entry => entry.timestamp);
  const yValues = data.map(entry => parseFloat(entry[type]));
  return { x: xValues, y: yValues };
}

async function main() {
  const types = ['temperature', 'humidity', 'gas', 'oxygen'];

  for (const type of types) {
    await updateGraph(type); // Initial update for each type
    setInterval(() => updateGraph(type), POLL_INTERVAL_MS); // Update at configured interval
  }
}

main();

// Auto-rotate rooms if enabled
const autoRotate = typeof window !== 'undefined' && window.__AUTO_ROTATE__ === true;
const rotateIntervalMs = typeof window !== 'undefined' && Number(window.__ROTATE_INTERVAL_MS__) > 0
  ? Number(window.__ROTATE_INTERVAL_MS__)
  : 10000;

if (autoRotate) {
  setInterval(() => {
    const current = parseInt(roomNumber, 10) || 1;
    const next = current >= 4 ? 1 : current + 1;
    setRoom(next, true);
  }, rotateIntervalMs);
}

// If user navigates with back/forward
window.addEventListener('popstate', () => {
  setRoom(getRoomFromUrl(), false);
});
