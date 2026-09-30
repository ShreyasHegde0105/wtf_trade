import { useState } from 'react';
import DiscoveryRail from './components/DiscoveryRail.jsx';
import MomentumFeed from './components/MomentumFeed.jsx';

export default function App() {
  const [query, setQuery] = useState('');

  const handleDiscoverySelect = (asset) => {
    setQuery(asset.symbol);
  };

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Momentum</h1>
        <p className="app__subtitle">Assets moving unusually fast on price and volume</p>
      </header>
      <DiscoveryRail onSelectAsset={handleDiscoverySelect} />
      <main>
        <MomentumFeed query={query} onQueryChange={setQuery} />
      </main>
    </div>
  );
}
