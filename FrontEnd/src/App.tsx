import { BrowserRouter, Routes, Route } from 'react-router-dom';
import QuestsPage from './pages/Quests';
import ContributorApp from './pages/ContributorApp';
import BuyerConsole from './pages/BuyerConsole';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<QuestsPage />} />
        <Route path="/quests" element={<QuestsPage />} />
        <Route path="/submit/:questId" element={<ContributorApp />} />
        <Route path="/buyer" element={<BuyerConsole />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

