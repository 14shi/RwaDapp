import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TrendingUp, DollarSign, Users, Calendar, ExternalLink, Info } from 'lucide-react';
import { parseTokenAmount, formatTokenAmount } from '@/lib/tokenUnits';
import type { RevenueAsset, RevenueDistribution } from '@shared/schema';

interface RevenueDistributionCardProps {
  asset: RevenueAsset;
  distributions: RevenueDistribution[];
  onDistribute: () => void;
  isDistributing: boolean;
}

export default function RevenueDistributionCard({
  asset,
  distributions,
  onDistribute,
  isDistributing
}: RevenueDistributionCardProps) {
  const totalRevenue = parseFloat(asset.totalRevenue || "0");
  const distributedRevenue = parseFloat(asset.distributedRevenue || "0");
  const pendingRevenue = totalRevenue - distributedRevenue;
  const tokensSold = parseTokenAmount(asset.tokensSold);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            收益概览
          </CardTitle>
          <CardDescription>
            查看资产收益和分配情况
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-muted p-4 rounded-md">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <DollarSign className="w-4 h-4" />
                <span className="text-sm">总收益</span>
              </div>
              <div className="text-2xl font-bold" data-testid="text-total-revenue">
                {totalRevenue.toFixed(4)} ETH
              </div>
            </div>

            <div className="bg-muted p-4 rounded-md">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Users className="w-4 h-4" />
                <span className="text-sm">已分配</span>
              </div>
              <div className="text-2xl font-bold" data-testid="text-distributed-revenue">
                {distributedRevenue.toFixed(4)} ETH
              </div>
            </div>

            <div className="bg-primary/10 border border-primary/20 p-4 rounded-md">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm">待分配</span>
              </div>
              <div className="text-2xl font-bold text-primary" data-testid="text-pending-revenue">
                {pendingRevenue.toFixed(4)} ETH
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">代币持有者</span>
              <span className="font-medium">{formatTokenAmount(asset.tokensSold, 0)} / {formatTokenAmount(asset.totalTokenSupply, 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">每代币可分配</span>
              <span className="font-medium">
                {tokensSold > 0 ? (pendingRevenue / tokensSold).toFixed(6) : '0.000000'} ETH
              </span>
            </div>
          </div>

          <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-sm text-blue-900 dark:text-blue-100">
              <strong>重要提示：</strong>点击"分配收益"后，系统会在智能合约中记录每个代币持有者可领取的收益额度。
              <span className="font-semibold">代币持有者需要自己点击"提取收益"按钮，才能将 ETH 转入钱包。</span>
            </AlertDescription>
          </Alert>

          <Button
            onClick={onDistribute}
            disabled={isDistributing || pendingRevenue <= 0 || tokensSold === 0}
            className="w-full"
            data-testid="button-distribute-revenue"
          >
            {isDistributing ? '分配中...' : '分配收益（记录额度）'}
          </Button>

          {pendingRevenue <= 0 && (
            <p className="text-sm text-muted-foreground text-center">
              暂无待分配收益
            </p>
          )}
        </CardContent>
      </Card>

      {distributions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              分配历史
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {distributions.map((dist) => (
                <div
                  key={dist.id}
                  className="flex justify-between items-center p-3 bg-muted rounded-md hover-elevate"
                  data-testid={`distribution-${dist.id}`}
                >
                  <div className="space-y-1">
                    <div className="font-medium">
                      {parseFloat(dist.totalAmount).toFixed(4)} ETH
                    </div>
                    <div className="text-xs text-muted-foreground">
                      每代币: {parseFloat(dist.perTokenAmount).toFixed(6)} ETH
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(dist.distributedAt || '').toLocaleString('zh-CN')}
                    </div>
                  </div>
                  {dist.transactionHash && (
                    <a
                      href={`https://sepolia.etherscan.io/tx/${dist.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                      data-testid={`link-distribution-tx-${dist.id}`}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
