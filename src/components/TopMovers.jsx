import { memo } from 'react';
import GainersList from './GainersList.jsx';
import LosersList from './LosersList.jsx';

function TopMovers({ assets = [], onOpenAsset }) {
  return (
    <div className="top-movers-section">
      <div className="top-movers-grid">
        <GainersList assets={assets} onOpenAsset={onOpenAsset} />
        <LosersList assets={assets} onOpenAsset={onOpenAsset} />
      </div>
    </div>
  );
}

export default memo(TopMovers);
