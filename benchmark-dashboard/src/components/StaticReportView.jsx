import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';

// In a real app we'd import JSON or fetch it. For Vite, importing works out of the box.
import benchV1 from '../data/benchmark-results-v1.json';
import benchV2 from '../data/benchmark-results-v2-concurrency.json';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="custom-tooltip">
        <p className="label">{label}</p>
        {payload.map((entry, idx) => (
          <p key={idx} style={{ color: entry.color, margin: '4px 0', fontSize: '14px' }}>
            {entry.name}: {entry.value.toLocaleString(undefined, {maximumFractionDigits: 2})}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const StaticReportView = () => {
  const [gasData, setGasData] = useState([]);
  const [ipfsData, setIpfsData] = useState([]);
  const [scaleData, setScaleData] = useState([]);

  useEffect(() => {
    // Parse Gas Costs
    const gas = Object.keys(benchV1.gasCosts).map(op => ({
      operation: op.replace(/([A-Z])/g, ' $1').trim(),
      gasUsed: benchV1.gasCosts[op].gas.mean
    }));
    setGasData(gas);

    // Parse IPFS
    const ipfs = Object.keys(benchV1.ipfsPerformance.uploadResults).map(size => ({
      size,
      upload: benchV1.ipfsPerformance.uploadResults[size].mean,
      e2e: benchV1.ipfsPerformance.endToEndResults[size].mean
    }));
    setIpfsData(ipfs);

    // Parse Scalability
    const tiers = Object.keys(benchV2).map(t => parseInt(t.split('_')[1])).sort((a,b)=>a-b);
    const scale = tiers.map(t => ({
      users: t,
      tps: benchV2[`tier_${t}`].createRecord.throughputTps,
      latency: benchV2[`tier_${t}`].createRecord.avgLatencyMs
    }));
    setScaleData(scale);
  }, []);

  return (
    <div>
      <div className="cards-grid">
        <div className="kpi-card">
          <div className="kpi-title">Peak Throughput</div>
          <div className="kpi-value">
            {scaleData.length ? Math.max(...scaleData.map(d => d.tps)).toFixed(1) : 0}
            <span className="kpi-unit">TPS</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Avg Gas (Create)</div>
          <div className="kpi-value">
            {gasData.find(g => g.operation === 'add Medical Record')?.gasUsed?.toFixed(0) || 0}
            <span className="kpi-unit">Units</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">E2E Latency (1MB)</div>
          <div className="kpi-value">
            {ipfsData.find(i => i.size === '1MB')?.e2e?.toFixed(0) || 0}
            <span className="kpi-unit">ms</span>
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">Gas Consumption by Operation</h3>
          </div>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={gasData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
              <XAxis dataKey="operation" tick={{fill: '#94a3b8', fontSize: 12}} angle={-45} textAnchor="end" />
              <YAxis tick={{fill: '#94a3b8', fontSize: 12}} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="gasUsed" name="Gas Used" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">System Scalability (Throughput)</h3>
          </div>
          <ResponsiveContainer width="100%" height="85%">
            <LineChart data={scaleData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
              <XAxis dataKey="users" tick={{fill: '#94a3b8', fontSize: 12}} />
              <YAxis tick={{fill: '#94a3b8', fontSize: 12}} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="tps" name="TPS" stroke="#10b981" strokeWidth={3} dot={{r: 4, fill: '#10b981'}} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">IPFS Storage Latency vs Size</h3>
          </div>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={ipfsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
              <XAxis dataKey="size" tick={{fill: '#94a3b8', fontSize: 12}} />
              <YAxis tick={{fill: '#94a3b8', fontSize: 12}} />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={36} wrapperStyle={{fontSize: '14px', color: '#f8fafc'}}/>
              <Bar dataKey="upload" name="IPFS Upload" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="e2e" name="End-to-End" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default StaticReportView;
