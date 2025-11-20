import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useWallet } from '@/lib/web3';
import { Loader2, Wallet, TrendingUp } from 'lucide-react';
import { Link } from 'wouter';
import type { RevenueAsset } from '@shared/schema';

interface BlockchainBalance {
  assetId: string;
  assetName: string;
  tokenAmount: number;
  erc20ContractAddress: string;
  erc20TokenSymbol: string;
  pricePerToken: string;
  totalTokenSupply: number;
  totalRevenue: string;
  distributedRevenue: string;
}

export default function MyTokensPage() {
  const { address, isConnected } = useWallet();
  
  // For demo mode: use default address if not connected
  const holderAddress = address || '0x0000000000000000000000000000000000000000';

  // Use blockchain balances instead of backend token-holders table
  const { data: holdings, isLoading } = useQuery<BlockchainBalance[]>({
    queryKey: ['/api/token-holders/blockchain', holderAddress],
    enabled: !!holderAddress,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardContent className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const holdingsWithAssets = holdings || [];

  const totalValue = holdingsWithAssets.reduce((sum, holding) => {
    if (!holding.pricePerToken) return sum;
    return sum + (holding.tokenAmount * parseFloat(holding.pricePerToken));
  }, 0);

  const totalRevenue = holdingsWithAssets.reduce((sum, holding) => {
    const undistributed = parseFloat(holding.totalRevenue || "0") - parseFloat(holding.distributedRevenue || "0");
    const share = (holding.tokenAmount / (holding.totalTokenSupply || 1)) * undistributed;
    return sum + share;
  }, 0);

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">我的代币</h1>
        <Badge variant="outline" className="text-base px-4 py-2" data-testid="badge-wallet-address">
          {holderAddress.slice(0, 10)}...{holderAddress.slice(-8)}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="hover-elevate">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Wallet className="w-6 h-6 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-bold" data-testid="text-total-value">
                {totalValue.toFixed(4)} ETH
              </div>
              <div className="text-sm text-muted-foreground">投资总额</div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-green-600/10 rounded-lg">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600" data-testid="text-pending-revenue">
                {totalRevenue.toFixed(4)} ETH
              </div>
              <div className="text-sm text-muted-foreground">待分配收益</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {holdingsWithAssets.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">
              您还没有持有任何代币
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">持有的代币</h2>
          <div className="grid grid-cols-1 gap-4">
            {holdingsWithAssets.map((holding) => {
              const undistributed = parseFloat(holding.totalRevenue || "0") - parseFloat(holding.distributedRevenue || "0");
              const share = (holding.tokenAmount / (holding.totalTokenSupply || 1)) * undistributed;

              return (
                <Link key={holding.assetId} href={`/assets/${holding.assetId}`}>
                  <Card className="hover-elevate cursor-pointer" data-testid={`card-holding-${holding.assetId}`}>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle>{holding.assetName}</CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            {holding.erc20TokenSymbol}
                          </p>
                        </div>
                        <Badge variant="secondary">链上余额</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">持有数量</div>
                          <div className="font-medium text-lg" data-testid={`text-amount-${holding.assetId}`}>
                            {holding.tokenAmount}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">持有比例</div>
                          <div className="font-medium text-lg">
                            {((holding.tokenAmount / (holding.totalTokenSupply || 1)) * 100).toFixed(2)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">投资价值</div>
                          <div className="font-medium text-lg">
                            {(holding.tokenAmount * parseFloat(holding.pricePerToken || "0")).toFixed(4)} ETH
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">待分配收益</div>
                          <div className="font-medium text-lg text-green-600">
                            {share.toFixed(6)} ETH
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
