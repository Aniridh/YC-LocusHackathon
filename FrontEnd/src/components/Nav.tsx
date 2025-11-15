import { Link, useLocation } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';

export default function Nav() {
  const location = useLocation();
  const { demoMode } = useWallet();

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link to="/quests" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">AQ</span>
              </div>
              <span className="text-xl font-bold text-gray-900">Agent Quests</span>
            </Link>
          </div>

          {/* Navigation Links */}
          <div className="flex items-center gap-6">
            <Link
              to="/quests"
              className={`text-sm font-medium transition-colors ${
                isActive('/quests') || location.pathname === '/'
                  ? 'text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Quests
            </Link>
            <Link
              to="/dashboard"
              className={`text-sm font-medium transition-colors ${
                isActive('/dashboard') || isActive('/buyer')
                  ? 'text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Dashboard
            </Link>

            {/* Demo Mode Badge */}
            {demoMode && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                Demo Mode
              </span>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

