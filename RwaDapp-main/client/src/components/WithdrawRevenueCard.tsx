import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useWallet } from '@/lib/web3';
import { withdrawRevenue, getAvailableRevenue, getTokenBalance } from '@/lib/contract';
import { Wallet, TrendingUp, Loader2, HandCoins, Info } from 'lucide-react';

interface WithdrawRevenueCardProps {
  assetId: string;
  assetName: string;
  erc20ContractAddress: string;
  tokenSymbol: string;
}

export function WithdrawRevenueCard({
  assetId,
  assetName,
  erc20ContractAddress,
  tokenSymbol,
}: WithdrawRevenueCardProps) {
  const { address, isConnected } = useWallet();
  const { toast } = useToast();
  const [tokenBalance, setTokenBalance] = useState<string>('0');
  const [availableRevenue, setAvailableRevenue] = useState<string>('0');
  const [loading, setLoading] = useState(true);

  const holderAddress = address || '0x0000000000000000000000000000000000000000';

  useEffect(() => {
    async function fetchOnChainData() {
      if (!erc20ContractAddress) return;
      
      setLoading(true);
      try {
        const [balance, revenue] = await Promise.all([
          getTokenBalance(erc20ContractAddress, holderAddress),
          getAvailableRevenue(erc20ContractAddress, holderAddress),
        ]);
        
        setTokenBalance(balance);
        setAvailableRevenue(revenue);
      } catch (error) {
        console.error('Failed to fetch on-chain data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchOnChainData();
  }, [erc20ContractAddress, holderAddress]);

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const txHash = await withdrawRevenue(erc20ContractAddress);
      return txHash;
    },
    onSuccess: async (txHash) => {
      toast({ 
        title: '收益提取成功！', 
        description: `交易哈希: ${txHash.slice(0, 10)}...` 
      });
      
      // Refresh on-chain data
      const [balance, revenue] = await Promise.all([
        getTokenBalance(erc20ContractAddress, holderAddress),
        getAvailableRevenue(erc20ContractAddress, holderAddress),
      ]);
      setTokenBalance(balance);
      setAvailableRevenue(revenue);
    },
    onError: (error: Error) => {
      toast({ 
        title: '提取失败', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  const hasTokens = parseFloat(tokenBalance) > 0;
  const hasRevenue = parseFloat(availableRevenue) > 0;

  return (
    <Card data-testid={`card-withdraw-${assetId}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <HandCoins className="w-5 h-5" />
            我的收益
          </CardTitle>
          <Badge variant="outline">{tokenSymbol}</Badge>
        </div>
        <CardDescription>
          查看并提取您的代币持有收益
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <Wallet className="w-5 h-5 text-primary" />
                <div>
                  <div className="text-xs text-muted-foreground">我的代币余额</div>
                  <div className="text-lg font-semibold" data-testid="text-token-balance">
                    {parseFloat(tokenBalance).toFixed(2)}
                  </div>
                </div>
              </div>
              
              <div className={`flex items-center gap-3 p-4 rounded-lg ${hasRevenue ? 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border-2 border-green-500' : 'bg-muted'}`}>
                <TrendingUp className={`w-6 h-6 ${hasRevenue ? 'text-green-600 animate-pulse' : 'text-muted-foreground'}`} />
                <div>
                  <div className="text-xs text-muted-foreground">可提取收益</div>
                  <div className={`text-2xl font-bold ${hasRevenue ? 'text-green-600' : ''}`} data-testid="text-available-revenue">
                    {parseFloat(availableRevenue).toFixed(6)} ETH
                  </div>
                </div>
              </div>
            </div>

            {!hasTokens && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  您还没有持有此资产的代币。购买代币后，您就可以获得收益分配。
                </AlertDescription>
              </Alert>
            )}

            {hasTokens && !hasRevenue && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  当前没有可提取的收益。资产所有者分配收益后，您的可提取金额会自动更新。
                </AlertDescription>
              </Alert>
            )}

            {hasRevenue && (
              <>
                <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-sm text-green-900 dark:text-green-100">
                    <strong>恭喜！</strong>您有 <span className="font-bold text-green-600">{parseFloat(availableRevenue).toFixed(6)} ETH</span> 可提取。
                    点击下方按钮将收益转入您的钱包。
                  </AlertDescription>
                </Alert>
                <Button
                  onClick={() => withdrawMutation.mutate()}
                  disabled={withdrawMutation.isPending || !isConnected}
                  className="w-full"
                  size="lg"
                  variant="default"
                  data-testid="button-withdraw-revenue"
                >
                  <HandCoins className="w-5 h-5 mr-2" />
                  {withdrawMutation.isPending ? '提取中...' : `提取 ${parseFloat(availableRevenue).toFixed(6)} ETH`}
                </Button>
              </>
            )}

            {!isConnected && hasRevenue && (
              <p className="text-xs text-destructive text-center">
                请先连接 MetaMask 钱包以提取收益
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
