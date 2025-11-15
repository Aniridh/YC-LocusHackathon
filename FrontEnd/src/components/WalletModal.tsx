import { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWalletReady: (address: string, demoMode: boolean) => void;
}

export function WalletModal({ isOpen, onClose, onWalletReady }: WalletModalProps) {
  const { requestSwitchNetwork, ensureWalletOrDemo, connectWallet } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasWallet, setHasWallet] = useState(false);
  const [chainMismatch, setChainMismatch] = useState(false);

  const CHAIN_ID_HEX = import.meta.env.VITE_CHAIN_ID_HEX || '0x14a34';
  const CHAIN_NAME = import.meta.env.VITE_CHAIN_NAME || 'Base Sepolia';

  useEffect(() => {
    if (isOpen) {
      checkWalletStatus();
    }
  }, [isOpen]);

  const checkWalletStatus = async () => {
    setError(null);
    
    if (typeof window.ethereum === 'undefined') {
      setHasWallet(false);
      setChainMismatch(false);
      return;
    }

    setHasWallet(true);

    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts.length > 0) {
        const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
        setChainMismatch(currentChainId !== CHAIN_ID_HEX);
      } else {
        setChainMismatch(false);
      }
    } catch (error) {
      console.error('Error checking wallet status:', error);
      setChainMismatch(false);
    }
  };

  const handleSwitchNetwork = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await requestSwitchNetwork();
      // After switching, try to connect
      const address = await ensureWalletOrDemo();
      onWalletReady(address, false);
      onClose();
    } catch (error: any) {
      console.error('Error switching network:', error);
      setError(error.message || 'Failed to switch network');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectWallet = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await connectWallet();
      const address = await ensureWalletOrDemo();
      onWalletReady(address, false);
      onClose();
    } catch (error: any) {
      if (error.message === 'CHAIN_MISMATCH') {
        setChainMismatch(true);
        setError('Please switch to Base Sepolia network');
      } else {
        setError(error.message || 'Failed to connect wallet');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleUseDemoMode = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const address = await ensureWalletOrDemo();
      onWalletReady(address, true);
      onClose();
    } catch (error: any) {
      setError(error.message || 'Failed to initialize demo mode');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold mb-4">Connect Wallet</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {!hasWallet && (
          <div className="mb-6">
            <p className="text-gray-600 mb-4">
              No wallet detected. You can continue in demo mode to test the application.
            </p>
            <button
              onClick={handleUseDemoMode}
              disabled={isLoading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Loading...' : 'Continue in Demo Mode'}
            </button>
          </div>
        )}

        {hasWallet && !chainMismatch && (
          <div className="mb-6">
            <p className="text-gray-600 mb-4">
              Connect your wallet to {CHAIN_NAME} to get started.
            </p>
            <button
              onClick={handleConnectWallet}
              disabled={isLoading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Connecting...' : 'Connect Wallet'}
            </button>
            <button
              onClick={handleUseDemoMode}
              disabled={isLoading}
              className="w-full mt-2 bg-gray-200 text-gray-700 py-2 px-4 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue in Demo Mode
            </button>
          </div>
        )}

        {hasWallet && chainMismatch && (
          <div className="mb-6">
            <p className="text-gray-600 mb-4">
              Your wallet is connected to a different network. Please switch to {CHAIN_NAME} to continue.
            </p>
            <button
              onClick={handleSwitchNetwork}
              disabled={isLoading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Switching...' : `Switch to ${CHAIN_NAME}`}
            </button>
            <button
              onClick={handleUseDemoMode}
              disabled={isLoading}
              className="w-full mt-2 bg-gray-200 text-gray-700 py-2 px-4 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue in Demo Mode
            </button>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full mt-4 text-gray-600 hover:text-gray-800"
          disabled={isLoading}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

