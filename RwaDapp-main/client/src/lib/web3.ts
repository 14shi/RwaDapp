import { BrowserProvider, hexlify, toUtf8Bytes } from 'ethers';
import { create } from 'zustand';
import { switchToSepolia, ensureCorrectNetwork } from './switchNetwork';

export interface WalletState {
  address: string | null;
  balance: string | null;
  chainId: number | null;
  isConnected: boolean;
}

interface WalletStore extends WalletState {
  connect: (forceAccountSelect?: boolean) => Promise<void>;
  disconnect: () => void;
  updateBalance: () => Promise<void>;
  signMessage: (message: string) => Promise<string>;
}

// Cached provider to avoid recreating on every call
let cachedProvider: BrowserProvider | null = null;
let eventListenersSetup = false;

export const useWallet = create<WalletStore>((set, get) => ({
  address: null,
  balance: null,
  chainId: null,
  isConnected: false,
  
  connect: async (forceAccountSelect = false) => {
    const state = await connectWallet(forceAccountSelect);
    set(state);
    
    // Setup event listeners once
    if (!eventListenersSetup && typeof window.ethereum !== 'undefined') {
      setupEventListeners(set, get);
    }
  },
  
  disconnect: () => {
    set({
      address: null,
      balance: null,
      chainId: null,
      isConnected: false,
    });
  },
  
  updateBalance: async () => {
    const { address, isConnected } = get();
    if (!isConnected || !address) return;
    
    try {
      const provider = await getOrCreateProvider();
      const balance = await provider.getBalance(address);
      set({ balance: (Number(balance) / 1e18).toFixed(4) });
    } catch (error) {
      console.error('更新余额失败:', error);
    }
  },

  signMessage: async (message: string) => {
    const { address, isConnected } = get();
    if (!isConnected || !address) {
      throw new Error('请先连接钱包');
    }

    try {
      const provider = await getOrCreateProvider();
      const signer = await provider.getSigner();
      
      // Use ethers.js signer.signMessage which handles encoding properly
      const signature = await signer.signMessage(message);

      return signature;
    } catch (error: any) {
      console.error('签名失败:', error);
      throw new Error(error.message || '签名被取消或失败');
    }
  },
}));

function setupEventListeners(set: any, get: any) {
  if (typeof window.ethereum === 'undefined') return;
  
  // Account changed
  window.ethereum.on('accountsChanged', async (accounts: string[]) => {
    if (accounts.length === 0) {
      // User disconnected
      set({
        address: null,
        balance: null,
        isConnected: false,
      });
    } else {
      // Account switched
      try {
        const provider = await getOrCreateProvider();
        const balance = await provider.getBalance(accounts[0]);
        set({
          address: accounts[0],
          balance: (Number(balance) / 1e18).toFixed(4),
          isConnected: true,
        });
      } catch (error) {
        console.error('账户切换失败:', error);
      }
    }
  });
  
  // Chain changed
  window.ethereum.on('chainChanged', (chainIdHex: string) => {
    const chainId = parseInt(chainIdHex, 16);
    set({ chainId });
    // Reload page on network change (recommended by MetaMask)
    window.location.reload();
  });
  
  eventListenersSetup = true;
}

async function getOrCreateProvider(): Promise<BrowserProvider> {
  if (typeof window.ethereum === 'undefined') {
    throw new Error('请先安装 MetaMask 钱包');
  }
  
  if (!cachedProvider) {
    cachedProvider = new BrowserProvider(window.ethereum);
  }
  
  return cachedProvider;
}

export async function connectWallet(forceAccountSelect = false): Promise<WalletState> {
  if (typeof window.ethereum === 'undefined') {
    throw new Error('请先安装 MetaMask 钱包');
  }

  try {
    // 首先确保切换到正确的网络
    await ensureCorrectNetwork();
    
    const provider = await getOrCreateProvider();
    
    // If forceAccountSelect is true, request permissions to show account selector
    if (forceAccountSelect) {
      try {
        await window.ethereum.request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }],
        });
      } catch (error: any) {
        // User cancelled permission request
        if (error.code === 4001) {
          throw new Error('用户取消了账户选择');
        }
        throw error;
      }
    }
    
    const accounts = await provider.send('eth_requestAccounts', []);
    const network = await provider.getNetwork();
    const balance = await provider.getBalance(accounts[0]);

    return {
      address: accounts[0],
      balance: (Number(balance) / 1e18).toFixed(4),
      chainId: Number(network.chainId),
      isConnected: true,
    };
  } catch (error) {
    console.error('连接钱包失败:', error);
    throw error;
  }
}

export function truncateAddress(address: string, startLength = 6, endLength = 4): string {
  if (!address) return '';
  return `${address.slice(0, startLength)}...${address.slice(-endLength)}`;
}

declare global {
  interface Window {
    ethereum?: any;
  }
}
