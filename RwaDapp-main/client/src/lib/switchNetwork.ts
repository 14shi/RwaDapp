// 自动切换到 Sepolia 网络
export async function switchToSepolia() {
  if (typeof window.ethereum === 'undefined') {
    throw new Error('请安装 MetaMask 钱包');
  }

  try {
    // 尝试切换到 Sepolia
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x' + (11155111).toString(16) }], // 0xaa36a7
    });
    
    return true;
  } catch (switchError: any) {
    // 错误码 4902 表示链未添加
    if (switchError.code === 4902) {
      try {
        // 添加 Sepolia 网络
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: '0xaa36a7',
              chainName: 'Sepolia 测试网络',
              nativeCurrency: {
                name: 'SepoliaETH',
                symbol: 'ETH',
                decimals: 18,
              },
              rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
              blockExplorerUrls: ['https://sepolia.etherscan.io/'],
            },
          ],
        });
        return true;
      } catch (addError) {
        console.error('添加网络失败:', addError);
        throw new Error('无法添加 Sepolia 网络');
      }
    } else if (switchError.code === 4001) {
      // 用户拒绝切换
      throw new Error('用户取消了网络切换');
    }
    
    throw switchError;
  }
}

// 检查并自动切换网络
export async function ensureCorrectNetwork(): Promise<boolean> {
  if (typeof window.ethereum === 'undefined') {
    return false;
  }

  try {
    const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
    const chainId = parseInt(chainIdHex, 16);
    
    if (chainId !== 11155111) {
      console.log('当前网络不是 Sepolia，自动切换...');
      await switchToSepolia();
      return true;
    }
    
    return true;
  } catch (error) {
    console.error('网络检查失败:', error);
    return false;
  }
}