import React, { useState } from 'react';
import { Activity, BarChart3, Database, Server, Zap } from 'lucide-react';
import StaticReportView from './components/StaticReportView';
import LiveMetricsView from './components/LiveMetricsView';

function App() {
  const [activeTab, setActiveTab] = useState('static');

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="brand">
          <Activity size={28} color="#3b82f6" />
          MedVault Stats
        </div>
        
        <nav>
          <div 
            className={`nav-item ${activeTab === 'static' ? 'active' : ''}`}
            onClick={() => setActiveTab('static')}
          >
            <Database size={20} />
            Static Benchmarks
          </div>
          <div 
            className={`nav-item ${activeTab === 'live' ? 'active' : ''}`}
            onClick={() => setActiveTab('live')}
          >
            <Server size={20} />
            Live Grafana Metrics
          </div>
        </nav>
      </aside>

      <main className="main-content">
        <div className="header">
          <h1>{activeTab === 'static' ? 'Research Benchmark Results' : 'Real-time System Telemetry'}</h1>
          <p>
            {activeTab === 'static' 
              ? 'Analyzing historical gas costs, scalability, and IPFS performance.' 
              : 'Polling local Prometheus instance for live network performance.'}
          </p>
        </div>

        {activeTab === 'static' ? <StaticReportView /> : <LiveMetricsView />}
      </main>
    </div>
  );
}

export default App;
