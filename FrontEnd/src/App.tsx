import { BrowserRouter, Routes, Route } from 'react-router-dom';
import QuestsPage from './pages/Quests';
import SubmitPage from './pages/Submit';
import BuyerConsole from './pages/BuyerConsole';
import AuditPage from './pages/AuditPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<QuestsPage />} />
        <Route path="/quests" element={<QuestsPage />} />
        <Route path="/submit/:questId" element={<SubmitPage />} />
        <Route path="/buyer" element={<BuyerConsole />} />
        <Route path="/dashboard" element={<BuyerConsole />} />
        <Route path="/audit/:payoutId" element={<AuditPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

