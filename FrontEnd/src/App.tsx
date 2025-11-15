import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Nav from './components/Nav';
import QuestsPage from './pages/Quests';
import SubmitPage from './pages/Submit';
import BuyerConsole from './pages/BuyerConsole';
import AuditPage from './pages/Audit';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Nav />
        <Routes>
          <Route path="/" element={<QuestsPage />} />
          <Route path="/quests" element={<QuestsPage />} />
          <Route path="/submit/:questId" element={<SubmitPage />} />
          <Route path="/buyer" element={<BuyerConsole />} />
          <Route path="/dashboard" element={<BuyerConsole />} />
          <Route path="/audit/:payoutId" element={<AuditPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
