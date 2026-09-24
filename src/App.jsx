import MomentumFeed from './components/MomentumFeed.jsx';

export default function App() {
  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Momentum</h1>
        <p className="app__subtitle">Assets moving unusually fast on price and volume</p>
      </header>
      <main>
        <MomentumFeed />
      </main>
    </div>
  );
}
