import { useEffect } from 'react';
import { Wallet, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWallet, truncateAddress } from '@/lib/web3';
import { showErrorToast, showSuccessToast, parseError } from '@/lib/errorHandler';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function WalletButton() {
  const wallet = useWallet();

  const handleConnect = async () => {
    try {
      await wallet.connect();
      showSuccessToast('钱包连接成功', `地址: ${truncateAddress(wallet.address!)}`);
    } catch (error: any) {
      showErrorToast(error, { title: '连接失败' });
    }
  };

  const handleSwitchAccount = async () => {
    try {
      await wallet.connect(true); // Force account selection
      showSuccessToast('账户切换成功', `新地址: ${truncateAddress(wallet.address!)}`);
    } catch (error: any) {
      const appError = parseError(error);
      if (error.message === '用户取消了账户选择') {
        showSuccessToast('已取消', '您取消了账户选择');
      } else {
        showErrorToast(appError, { title: '切换失败' });
      }
    }
  };

  const handleDisconnect = () => {
    wallet.disconnect();
    showSuccessToast('已断开连接');
  };

  if (!wallet.isConnected) {
    return (
      <Button onClick={handleConnect} data-testid="button-connect-wallet">
        <Wallet className="mr-2 h-4 w-4" />
        连接钱包
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" data-testid="button-wallet-menu">
          <Wallet className="mr-2 h-4 w-4" />
          {truncateAddress(wallet.address!)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-2 space-y-1">
          <p className="text-sm font-medium" data-testid="text-wallet-address">
            {truncateAddress(wallet.address!)}
          </p>
          <p className="text-sm text-muted-foreground" data-testid="text-wallet-balance">
            余额: {wallet.balance} ETH
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSwitchAccount} data-testid="button-switch-account">
          <RefreshCw className="mr-2 h-4 w-4" />
          切换账户
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDisconnect} data-testid="button-disconnect">
          <LogOut className="mr-2 h-4 w-4" />
          断开连接
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
