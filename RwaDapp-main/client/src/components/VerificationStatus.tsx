import { useEffect, useState } from 'react';
import { getVerificationStatus, type VerificationStatus as IVerificationStatus } from '@/lib/contract';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, XCircle, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface VerificationStatusProps {
  requestId: string;
  onVerificationComplete?: (tokenId: string) => void;
}

export default function VerificationStatus({ requestId, onVerificationComplete }: VerificationStatusProps) {
  const [status, setStatus] = useState<IVerificationStatus | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pollingCount, setPollingCount] = useState(0);
  const [retryCount, setRetryCount] = useState(0);

  const retry = () => {
    setError(null);
    setRetryCount(prev => prev + 1);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    let progressInterval: NodeJS.Timeout;
    let mounted = true;
    let consecutiveErrors = 0;

    const poll = async () => {
      try {
        const verificationStatus = await getVerificationStatus(requestId);
        
        if (!mounted) return;

        consecutiveErrors = 0;
        setStatus(verificationStatus);
        setPollingCount(prev => prev + 1);

        if (verificationStatus.fulfilled) {
          clearInterval(interval);
          clearInterval(progressInterval);
          setProgress(100);
          
          if (verificationStatus.tokenId && verificationStatus.tokenId !== '0') {
            onVerificationComplete?.(verificationStatus.tokenId);
          }
        }
      } catch (err: any) {
        if (mounted) {
          consecutiveErrors++;
          console.error(`轮询验证状态失败 (尝试 ${consecutiveErrors}/3):`, err);
          
          if (consecutiveErrors >= 3) {
            setError(err.message || '无法获取验证状态');
            clearInterval(interval);
            clearInterval(progressInterval);
          }
        }
      }
    };

    poll();

    interval = setInterval(poll, 10000);

    progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 95) return prev;
        return prev + 1;
      });
    }, 2000);

    return () => {
      mounted = false;
      clearInterval(interval);
      clearInterval(progressInterval);
    };
  }, [requestId, onVerificationComplete, retryCount]);

  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive" data-testid="alert-verification-error">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button 
          variant="outline" 
          onClick={retry} 
          className="w-full"
          data-testid="button-retry"
        >
          重试
        </Button>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="space-y-4" data-testid="container-loading-status">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
        <p className="text-center text-sm text-muted-foreground">正在连接区块链...</p>
      </div>
    );
  }

  if (status.fulfilled) {
    return (
      <div className="space-y-4" data-testid="container-verification-success">
        <Alert className="border-green-600">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-600">
            验证成功！资产已通过 Chainlink 预言机验证
          </AlertDescription>
        </Alert>
        
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Token ID:</span>
            <span className="font-mono" data-testid="text-token-id">{status.tokenId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">资产名称:</span>
            <span data-testid="text-asset-name">{status.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">外部 ID:</span>
            <span className="font-mono text-xs" data-testid="text-external-id">{status.externalId}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="container-verification-pending">
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">验证进度</span>
          <span className="font-medium">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-2" data-testid="progress-verification" />
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Request ID:</span>
          <span className="font-mono text-xs" data-testid="text-request-id">
            {requestId.slice(0, 10)}...{requestId.slice(-8)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">资产类型:</span>
          <span data-testid="text-asset-type">
            {['Spotify 歌曲', 'USPTO 专利', 'GPU 硬件', '自定义'][status.assetType] || '未知'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">外部 ID:</span>
          <span className="font-mono text-xs" data-testid="text-external-id-pending">{status.externalId}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">轮询次数:</span>
          <span data-testid="text-polling-count">{pollingCount}</span>
        </div>
      </div>

      <Alert data-testid="alert-verification-info">
        <Loader2 className="h-4 w-4 animate-spin" />
        <AlertDescription>
          Chainlink Functions 正在调用外部 API 验证资产所有权。
          验证完成后，NFT 将自动铸造到您的地址。
        </AlertDescription>
      </Alert>

      <div className="flex justify-center">
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(`https://sepolia.etherscan.io/address/${status.requester}`, '_blank')}
          data-testid="button-view-etherscan"
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          在 Etherscan 查看
        </Button>
      </div>
    </div>
  );
}
