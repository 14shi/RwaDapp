import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/lib/web3';
import { switchToSepolia } from '@/lib/switchNetwork';
import { useState } from 'react';
import { toast } from '@/hooks/use-toast';

export default function NetworkAlert() {
  const { chainId, isConnected } = useWallet();
  const [switching, setSwitching] = useState(false);
  
  // 只在连接钱包且不在 Sepolia 时显示
  if (!isConnected || chainId === 11155111 || !chainId) {
    return null;
  }
  
  const handleSwitchNetwork = async () => {
    setSwitching(true);
    try {
      await switchToSepolia();
      // 网络切换成功后，页面会自动刷新
      toast({
        title: '网络切换成功',
        description: '已切换到 Sepolia 测试网',
      });
    } catch (error: any) {
      toast({
        title: '网络切换失败',
        description: error.message || '请手动切换到 Sepolia 测试网',
        variant: 'destructive',
      });
    } finally {
      setSwitching(false);
    }
  };
  
  return (
    <div className="container mx-auto px-4 mt-4">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>网络错误</AlertTitle>
        <AlertDescription className="flex items-center justify-between">
          <span>请切换到 Sepolia 测试网以使用此应用</span>
          <Button
            size="sm"
            onClick={handleSwitchNetwork}
            disabled={switching}
            className="ml-4"
            data-testid="button-switch-network"
          >
            {switching ? '切换中...' : '立即切换'}
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}