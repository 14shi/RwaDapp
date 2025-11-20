import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Coins, TrendingUp, ExternalLink, CheckCircle2 } from 'lucide-react';
import { truncateAddress } from '@/lib/web3';
import { percentageOf, parseTokenAmount, formatTokenAmount } from '@/lib/tokenUnits';
import type { RevenueAsset } from '@shared/schema';

interface AssetCardProps {
  asset: RevenueAsset;
  onClick?: () => void;
}

export default function AssetCard({ asset, onClick }: AssetCardProps) {
  const isFragmented = asset.isFragmented;
  const soldPercentage = isFragmented 
    ? percentageOf(asset.tokensSold, asset.totalTokenSupply)
    : 0;
  
  const totalRevenue = parseFloat(asset.totalRevenue || "0");
  const distributedRevenue = parseFloat(asset.distributedRevenue || "0");
  const pendingRevenue = totalRevenue - distributedRevenue;

  return (
    <Card 
      className="hover-elevate cursor-pointer overflow-hidden" 
      onClick={onClick}
      data-testid={`card-asset-${asset.id}`}
    >
      <div className="relative h-48 w-full overflow-hidden">
        <img
          src={asset.imageUrl}
          alt={asset.name}
          className="h-full w-full object-cover"
          data-testid={`img-asset-${asset.id}`}
        />
        <div className="absolute top-2 right-2 flex gap-2">
          <Badge variant="secondary" data-testid={`badge-type-${asset.id}`}>
            {asset.assetType}
          </Badge>
          {asset.status === 'minted' && (
            <Badge variant="default" data-testid={`badge-minted-${asset.id}`}>
              <CheckCircle2 className="w-3 h-3 mr-1" />
              已铸造
            </Badge>
          )}
          {isFragmented && (
            <Badge variant="default" className="bg-green-600" data-testid={`badge-fragmented-${asset.id}`}>
              <Coins className="w-3 h-3 mr-1" />
              已分割
            </Badge>
          )}
        </div>
      </div>

      <CardHeader>
        <CardTitle className="text-lg" data-testid={`text-name-${asset.id}`}>
          {asset.name}
        </CardTitle>
        <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`text-description-${asset.id}`}>
          {asset.description}
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {isFragmented && (
          <>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">代币进度</span>
                <span className="font-medium" data-testid={`text-tokens-sold-${asset.id}`}>
                  {formatTokenAmount(asset.tokensSold, 0)} / {formatTokenAmount(asset.totalTokenSupply, 0)}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all" 
                  style={{ width: `${soldPercentage}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-muted-foreground">代币符号</div>
                <div className="font-medium" data-testid={`text-symbol-${asset.id}`}>
                  {asset.erc20TokenSymbol}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">代币价格</div>
                <div className="font-medium" data-testid={`text-price-${asset.id}`}>
                  {asset.pricePerToken} ETH
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  总收益
                </div>
                <div className="font-medium" data-testid={`text-total-revenue-${asset.id}`}>
                  {totalRevenue.toFixed(4)} ETH
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">待分配</div>
                <div className="font-medium text-green-600" data-testid={`text-pending-revenue-${asset.id}`}>
                  {pendingRevenue.toFixed(4)} ETH
                </div>
              </div>
            </div>
          </>
        )}

        {asset.nftTokenId && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Token ID:</span>
            <code className="bg-muted px-2 py-1 rounded" data-testid={`text-token-id-${asset.id}`}>
              {asset.nftTokenId}
            </code>
          </div>
        )}

        {asset.ownerAddress && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>所有者:</span>
            <code className="bg-muted px-2 py-1 rounded" data-testid={`text-owner-${asset.id}`}>
              {truncateAddress(asset.ownerAddress)}
            </code>
          </div>
        )}

        {asset.nftTransactionHash && (
          <a
            href={`https://sepolia.etherscan.io/tx/${asset.nftTransactionHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
            data-testid={`link-tx-${asset.id}`}
          >
            <ExternalLink className="w-3 h-3" />
            查看交易
          </a>
        )}
      </CardContent>

      <CardFooter>
        <Button 
          variant="outline" 
          className="w-full"
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
          data-testid={`button-view-details-${asset.id}`}
        >
          查看详情
        </Button>
      </CardFooter>
    </Card>
  );
}
