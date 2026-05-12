import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchRangeQuery, fetchInstantQuery } from '../services/prometheus';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const time = new Date(label).toLocaleTimeString();
    return (
      <div className="custom-tooltip">
        <p className="label">{time}</p>
        {payload.map((entry, idx) => (
          <p key={idx} style={{ color: entry.color, margin: '4px 0', fontSize: '14px' }}>
            {entry.name}: {entry.value.toFixed(2)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const LiveMetricsView = () => {
  const [tpsData, setTpsData] = useState([]);
  const [latencyData, setLatencyData] = useState([]);
  const [currentCpu, setCurrentCpu] = useState(0);
  const [currentMem, setCurrentMem] = useState(0);

  useEffect(() => {
    let isMounted = true;
    
    const pollData = async () => {
      const end = Math.floor(Date.now() / 1000);
      const start = end - 300; // Last 5 mins
      
      // Usually Prometheus needs specific jobs to track these exactly. If benchmark isn't running right now,
      // the data might be empty. We'll fallback to container CPU to show *some* live data if medvault metrics are empty.
      
      // 1. Fetch TPS
      const tps = await fetchRangeQuery('sum(medvault_tps)', start, end, 5);
      if (isMounted) setTpsData(tps.length ? tps : [{timestamp: Date.now(), value: 0}]);

      // 2. Fetch Latency
      const lat = await fetchRangeQuery('avg(medvault_latency_avg_ms)', start, end, 5);
      if (isMounted) setLatencyData(lat.length ? lat : [{timestamp: Date.now(), value: 0}]);

      // 3. Fetch instant node metrics
      // This gets the rate of CPU usage for the IPFS container over 1m
      const cpuQuery = 'sum(rate(container_cpu_usage_seconds_total{name=~".*ipfs.*"}[1m])) * 100';
      const memQuery = 'sum(container_memory_usage_bytes{name=~".*ipfs.*"}) / 1024 / 1024';
      
      const cpu = await fetchInstantQuery(cpuQuery);
      const mem = await fetchInstantQuery(memQuery);
      
      if (isMounted) {
        setCurrentCpu(cpu);
        setCurrentMem(mem);
      }
    };

    pollData();
    const interval = setInterval(pollData, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div>
      <div className="cards-grid">
        <div className="kpi-card">
          <div className="kpi-title">
            <span className="pulse"></span>
            IPFS CPU Load
          </div>
          <div className="kpi-value">
            {currentCpu ? currentCpu.toFixed(1) : "0.0"}
            <span className="kpi-unit">%</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">
            <span className="pulse"></span>
            IPFS Memory Usage
          </div>
          <div className="kpi-value">
            {currentMem ? currentMem.toFixed(0) : "0"}
            <span className="kpi-unit">MB</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">
            <span className="pulse"></span>
            Active Prometheus Node
          </div>
          <div className="kpi-value" style={{fontSize: '1.25rem', marginTop: '8px'}}>
            localhost:9090
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">Live Transaction Throughput</h3>
          </div>
          {tpsData.length <= 1 && tpsData[0]?.value === 0 ? (
            <div className="loading">Waiting for active benchmarks to push metrics...</div>
          ) : (
            <ResponsiveContainer width="100%" height="85%">
              <LineChart data={tpsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                <XAxis 
                  dataKey="timestamp" 
                  tick={{fill: '#94a3b8', fontSize: 12}} 
                  tickFormatter={(unixTime) => new Date(unixTime).toLocaleTimeString([], {minute:'2-digit', second:'2-digit'})}
                />
                <YAxis tick={{fill: '#94a3b8', fontSize: 12}} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="stepAfter" dataKey="value" name="Live TPS" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">Live System Latency</h3>
          </div>
          {latencyData.length <= 1 && latencyData[0]?.value === 0 ? (
            <div className="loading">Waiting for active benchmarks to push metrics...</div>
          ) : (
            <ResponsiveContainer width="100%" height="85%">
              <LineChart data={latencyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                <XAxis 
                  dataKey="timestamp" 
                  tick={{fill: '#94a3b8', fontSize: 12}} 
                  tickFormatter={(unixTime) => new Date(unixTime).toLocaleTimeString([], {minute:'2-digit', second:'2-digit'})}
                />
                <YAxis tick={{fill: '#94a3b8', fontSize: 12}} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="value" name="Latency (ms)" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveMetricsView;
