import { useState, useEffect, useCallback } from 'react';

const DEMO_ADDRESS_KEY = 'demo_wallet_address';
const DEMO_ADDRESS_PREFIX = '0x000000000000000000000000000000000000';

// Generate deterministic demo address from a seed
function generateDemoAddress(): string {
  const seed = localStorage.getItem('demo_wallet_seed') || Date.now().toString();
  localStorage.setItem('demo_wallet_seed', seed);
  
  // Create a simple hash-like string from seed
  const hash = seed.split('').reduce((acc, char) => {
    const code = char.charCodeAt(0);
    return ((acc << 5) - acc) + code;
  }, 0);
  
  // Convert to hex and pad to 40 chars (20 bytes)
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `${DEMO_ADDRESS_PREFIX}${hex}`.slice(0, 42);
}

function getDemoAddress(): string {
  let address = localStorage.getItem(DEMO_ADDRESS_KEY);
  if (!address) {
    address = generateDemoAddress();
    localStorage.setItem(DEMO_ADDRESS_KEY, address);
  }
  return address;
}

function setDemoAddress(address: string): void {
  localStorage.setItem(DEMO_ADDRESS_KEY, address);
}

interface UseWalletReturn {
  address: string | null;
  demoMode: boolean;
  isConnected: boolean;
  requestSwitchNetwork: () => Promise<void>;
  ensureWalletOrDemo: () => Promise<string>;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
}

export function useWallet(): UseWalletReturn {
  const [address, setAddress] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  const CHAIN_ID_HEX = import.meta.env.VITE_CHAIN_ID_HEX || '0x14a34';
  const CHAIN_NAME = import.meta.env.VITE_CHAIN_NAME || 'Base Sepolia';
  const CHAIN_RPC_URL = import.meta.env.VITE_CHAIN_RPC_URL || 'https://sepolia.base.org';
  const BLOCK_EXPLORER_URL = import.meta.env.VITE_BLOCK_EXPLORER_URL || 'https://sepolia.basescan.org';

  // Check if wallet is connected on mount
  useEffect(() => {
    if (typeof window.ethereum !== 'undefined') {
      checkWalletConnection();
      setupWalletListeners();
    } else {
      // No wallet, use demo mode
      const demoAddr = getDemoAddress();
      setAddress(demoAddr);
      setDemoMode(true);
      setIsConnected(true);
    }
  }, []);

  const checkWalletConnection = async () => {
    if (typeof window.ethereum === 'undefined') {
      return;
    }

    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts.length > 0) {
        const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
        const isCorrectChain = currentChainId === CHAIN_ID_HEX;
        
        setAddress(accounts[0]);
        setDemoMode(false);
        setIsConnected(true);
        
        // If wrong chain, we'll let the modal handle it
        return isCorrectChain;
      }
    } catch (error) {
      console.error('Error checking wallet connection:', error);
    }
    
    return false;
  };

  const setupWalletListeners = () => {
    if (typeof window.ethereum === 'undefined') {
      return;
    }

    // Listen for account changes
    window.ethereum.on('accountsChanged', (accounts: string[]) => {
      if (accounts.length > 0) {
        setAddress(accounts[0]);
        setDemoMode(false);
        setIsConnected(true);
      } else {
        // Disconnected, fall back to demo
        const demoAddr = getDemoAddress();
        setAddress(demoAddr);
        setDemoMode(true);
        setIsConnected(true);
      }
    });

    // Listen for chain changes
    window.ethereum.on('chainChanged', (chainId: string) => {
      if (chainId === CHAIN_ID_HEX) {
        setDemoMode(false);
      }
      // Reload to update UI
      window.location.reload();
    });
  };

  const requestSwitchNetwork = useCallback(async (): Promise<void> => {
    if (typeof window.ethereum === 'undefined') {
      throw new Error('No wallet detected');
    }

    try {
      // Try to switch to the chain
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CHAIN_ID_HEX }],
      });
    } catch (switchError: any) {
      // This error code indicates that the chain has not been added to MetaMask
      if (switchError.code === 4902) {
        try {
          // Add the chain
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: CHAIN_ID_HEX,
                chainName: CHAIN_NAME,
                nativeCurrency: {
                  name: 'ETH',
                  symbol: 'ETH',
                  decimals: 18,
                },
                rpcUrls: [CHAIN_RPC_URL],
                blockExplorerUrls: [BLOCK_EXPLORER_URL],
              },
            ],
          });
        } catch (addError) {
          console.error('Error adding chain:', addError);
          throw addError;
        }
      } else {
        throw switchError;
      }
    }

    // Verify connection after switch
    await checkWalletConnection();
  }, [CHAIN_ID_HEX, CHAIN_NAME, CHAIN_RPC_URL, BLOCK_EXPLORER_URL]);

  const connectWallet = useCallback(async (): Promise<void> => {
    if (typeof window.ethereum === 'undefined') {
      throw new Error('No wallet detected');
    }

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts.length > 0) {
        const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
        
        if (currentChainId !== CHAIN_ID_HEX) {
          // Chain mismatch, will need to switch
          throw new Error('CHAIN_MISMATCH');
        }
        
        setAddress(accounts[0]);
        setDemoMode(false);
        setIsConnected(true);
      }
    } catch (error: any) {
      if (error.message === 'CHAIN_MISMATCH') {
        throw error;
      }
      console.error('Error connecting wallet:', error);
      throw error;
    }
  }, [CHAIN_ID_HEX]);

  const ensureWalletOrDemo = useCallback(async (): Promise<string> => {
    if (typeof window.ethereum === 'undefined') {
      // No wallet, use demo mode
      const demoAddr = getDemoAddress();
      setAddress(demoAddr);
      setDemoMode(true);
      setIsConnected(true);
      return demoAddr;
    }

    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts.length > 0) {
        const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
        
        if (currentChainId === CHAIN_ID_HEX) {
          setAddress(accounts[0]);
          setDemoMode(false);
          setIsConnected(true);
          return accounts[0];
        } else {
          // Chain mismatch
          throw new Error('CHAIN_MISMATCH');
        }
      } else {
        // Not connected, use demo mode
        const demoAddr = getDemoAddress();
        setAddress(demoAddr);
        setDemoMode(true);
        setIsConnected(true);
        return demoAddr;
      }
    } catch (error: any) {
      if (error.message === 'CHAIN_MISMATCH') {
        throw error;
      }
      // Fallback to demo mode
      const demoAddr = getDemoAddress();
      setAddress(demoAddr);
      setDemoMode(true);
      setIsConnected(true);
      return demoAddr;
    }
  }, [CHAIN_ID_HEX]);

  const disconnectWallet = useCallback(() => {
    setAddress(null);
    setDemoMode(false);
    setIsConnected(false);
    localStorage.removeItem(DEMO_ADDRESS_KEY);
  }, []);

  return {
    address,
    demoMode,
    isConnected,
    requestSwitchNetwork,
    ensureWalletOrDemo,
    connectWallet,
    disconnectWallet,
  };
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on: (event: string, handler: (args: any) => void) => void;
      removeListener: (event: string, handler: (args: any) => void) => void;
      isMetaMask?: boolean;
    };
  }
}

