import React, { useEffect, useMemo, useState } from 'react';
import Plot from 'react-plotly.js';

const ROOM_IDS = ['1', '2', '3', '4'];

function useConfig() {
  const [config, setConfig] = useState({
    apiBase: window.__API_BASE__ || 'http://localhost:4115',
    autoRotate: false,
    rotateIntervalMs: 10000,
    pollIntervalMs: 60000
  });

  useEffect(() => {
    fetch('http://localhost:4115/config.json')
      .then((res) => res.json())
      .then((data) => {
        setConfig({
          apiBase: data.apiBase || 'http://localhost:4115',
          autoRotate: Boolean(data.autoRotate),
          rotateIntervalMs: data.rotateIntervalMs || 10000,
          pollIntervalMs: data.pollIntervalMs || 60000
        });
      })
      .catch(() => {
        // keep defaults if config fails
      });
  }, []);

  return config;
}

function useRoomParam() {
  const [room, setRoom] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || '1';
  });

  useEffect(() => {
    const handler = () => {
      const params = new URLSearchParams(window.location.search);
      setRoom(params.get('room') || '1');
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const updateRoom = (next) => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', next);
    window.history.pushState({}, '', url.toString());
    setRoom(next);
  };

  return [room, updateRoom];
}

function useLiveData(apiBase, room, pollIntervalMs) {
  const [data, setData] = useState({
    temperature: 'N/A',
    humidity: 'N/A',
    gas: 'N/A',
    oxygen: 'N/A'
  });
  const [error, setError] = useState('');

  const fetchLive = () => {
    fetch(`${apiBase}/api/live-data?room=room${room}&_ts=${Date.now()}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (!json || json.error) throw new Error(json?.error || 'No data');
        setData(json);
        setError('');
      })
      .catch((err) => {
        setError(err.message || 'Failed to load');
        setData({ temperature: 'N/A', humidity: 'N/A', gas: 'N/A', oxygen: 'N/A' });
      });
  };

  useEffect(() => {
    fetchLive();
    const id = setInterval(fetchLive, pollIntervalMs);
    return () => clearInterval(id);
  }, [apiBase, room, pollIntervalMs]);

  return { data, error };
}

function useHistoryData(apiBase, room, pollIntervalMs) {
  const [history, setHistory] = useState({
    temperature: [],
    humidity: [],
    gas: [],
    oxygen: []
  });

  const types = useMemo(() => ['temperature', 'humidity', 'gas', 'oxygen'], []);

  const fetchAll = () => {
    types.forEach((type) => {
      fetch(`${apiBase}/api/all-data?room=room${room}&type=${type}&_ts=${Date.now()}`, { cache: 'no-store' })
        .then((res) => res.json())
        .then((json) => {
          if (!json || json.error) throw new Error(json?.error || 'No data');
          setHistory((prev) => ({ ...prev, [type]: json }));
        })
        .catch(() => {
          setHistory((prev) => ({ ...prev, [type]: [] }));
        });
    });
  };

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, pollIntervalMs);
    return () => clearInterval(id);
  }, [apiBase, room, pollIntervalMs, types]);

  return history;
}

function PlotCard({ title, data, valueKey }) {
  const x = data.map((d) => d.timestamp);
  const y = data.map((d) => Number(d[valueKey]));

  return (
    <div className="history-card">
      <h3>{title}</h3>
      <div className="history-chart">
        <Plot
          data={[
            {
              x,
              y,
              type: 'scatter',
              mode: 'lines+markers',
              marker: { color: '#12b886' },
              line: { color: '#12b886' }
            }
          ]}
          layout={{
            margin: { t: 30, r: 10, b: 30, l: 40 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            xaxis: { title: '', color: '#70757a', gridcolor: 'rgba(0,0,0,0.05)' },
            yaxis: { title: '', color: '#70757a', gridcolor: 'rgba(0,0,0,0.05)' },
            font: { family: 'Poppins, sans-serif', size: 12, color: '#3b3f5c' }
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%', height: '260px' }}
        />
      </div>
    </div>
  );
}

export default function App() {
  const config = useConfig();
  const [room, setRoom] = useRoomParam();
  const { data, error } = useLiveData(config.apiBase, room, config.pollIntervalMs);
  const history = useHistoryData(config.apiBase, room, config.pollIntervalMs);

  useEffect(() => {
    if (!config.autoRotate) return undefined;
    const id = setInterval(() => {
      const idx = ROOM_IDS.indexOf(room);
      const next = ROOM_IDS[(idx + 1) % ROOM_IDS.length];
      setRoom(next);
    }, config.rotateIntervalMs);
    return () => clearInterval(id);
  }, [config.autoRotate, config.rotateIntervalMs, room]);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">SATL Dashboard</div>
        <div className="section-title">OVERALL</div>
        <nav>
          {ROOM_IDS.map((id) => (
            <button
              key={id}
              className={`nav-item ${room === id ? 'active' : ''}`}
              onClick={() => setRoom(id)}
            >
              <span className="material-symbols-sharp">dashboard</span>
              Room {id}
            </button>
          ))}
        </nav>
      </aside>

      <main className="content">
        <header className="topbar">
          <div className="title-group">
            <h1>Room {room}</h1>
            {error && <span className="error">{error}</span>}
          </div>
          <div className="actions">
            <button className="chip">Last week</button>
            <button className="chip">Select Date</button>
            <div className="theme-toggler">
              <span className="material-symbols-sharp">light_mode</span>
              <span className="material-symbols-sharp">dark_mode</span>
            </div>
          </div>
        </header>

        <section className="kpi-row">
          <div className="kpi">
            <div>
              <p>Temperature</p>
              <h2>{data.temperature}</h2>
            </div>
            <div className="kpi-icon green">
              <span className="material-symbols-sharp">device_thermostat</span>
            </div>
          </div>
          <div className="kpi">
            <div>
              <p>Humidity</p>
              <h2>{data.humidity}</h2>
            </div>
            <div className="kpi-icon yellow">
              <span className="material-symbols-sharp">humidity_percentage</span>
            </div>
          </div>
          <div className="kpi">
            <div>
              <p>Gas level</p>
              <h2>{data.gas}</h2>
            </div>
            <div className="kpi-icon red">
              <span className="material-symbols-sharp">gas_meter</span>
            </div>
          </div>
          <div className="kpi">
            <div>
              <p>O level</p>
              <h2>{data.oxygen}</h2>
            </div>
            <div className="kpi-icon blue">
              <span className="material-symbols-sharp">oxygen_saturation</span>
            </div>
          </div>
        </section>

        <section className="history">
          <h2>Historical Charts</h2>
          <div className="history-grid">
            <PlotCard title="Temperature History" data={history.temperature} valueKey="temperature" />
            <PlotCard title="Humidity History" data={history.humidity} valueKey="humidity" />
            <PlotCard title="Gas History" data={history.gas} valueKey="gas" />
            <PlotCard title="Oxygen History" data={history.oxygen} valueKey="oxygen" />
          </div>
        </section>
      </main>
    </div>
  );
}
