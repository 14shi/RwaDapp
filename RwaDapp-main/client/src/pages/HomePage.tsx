import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import AssetCard from '@/components/AssetCard';
import { Link, useLocation } from 'wouter';
import { TrendingUp, Coins, Users, ArrowRight, Zap, Download } from 'lucide-react';
import type { RevenueAsset } from '@shared/schema';
import { useState } from 'react';
import { NFT_CONTRACT_ADDRESS } from '@/lib/contract';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

export default function HomePage() {
  const [, navigate] = useLocation();
  const { data: assets, isLoading } = useQuery<RevenueAsset[]>({
    queryKey: ['/api/assets'],
  });
  
  const [isImporting, setIsImporting] = useState(false);
  const { toast } = useToast();

  const fragmentedAssets = assets?.filter(a => a.isFragmented) || [];
  // 计算待分配收益：总收益 - 已分配收益
  // 注意：totalRevenue 包含代币销售收入和记录的收益
  const pendingRevenue = fragmentedAssets.reduce((sum, asset) => {
    const total = parseFloat(asset.totalRevenue || "0");
    const distributed = parseFloat(asset.distributedRevenue || "0");
    return sum + (total - distributed);
  }, 0);
  const totalAssets = assets?.length || 0;

  const handleImportFromBlockchain = async () => {
    try {
      setIsImporting(true);
      
      toast({
        title: "功能暂时不可用",
        description: "NFT 导入功能正在开发中",
        variant: "destructive",
      });
      
      return;
    } catch (error: any) {
      toast({
        title: "导入失败",
        description: error.message || "从区块链导入 NFT 失败",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-12">
      {/* Hero Section */}
      <section className="relative py-20 px-6 bg-gradient-to-br from-primary/10 via-primary/5 to-background rounded-lg overflow-hidden">
        <div className="relative z-10 max-w-3xl mx-auto text-center space-y-6">
          <h1 className="text-4xl md:text-5xl font-bold" data-testid="text-hero-title">
            收益资产分割化平台
          </h1>
          <p className="text-xl text-muted-foreground" data-testid="text-hero-subtitle">
            将收益资产（歌曲、GPU等）转化为可交易的ERC-20代币，自动分配收益给代币持有者
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/create">
              <Button size="lg" data-testid="button-create-asset">
                创建资产
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
            <Link href="/my-tokens">
              <Button size="lg" variant="outline" data-testid="button-my-tokens">
                我的代币
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="hover-elevate">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <TrendingUp className="w-6 h-6 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-bold" data-testid="text-pending-revenue">
                {pendingRevenue.toFixed(4)} ETH
              </div>
              <div className="text-sm text-muted-foreground">待分配收益</div>
              <div className="text-xs text-muted-foreground mt-1">
                包含代币销售收入和记录的收益
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-green-600/10 rounded-lg">
              <Coins className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold" data-testid="text-total-fragmented">
                {fragmentedAssets.length}
              </div>
              <div className="text-sm text-muted-foreground">已分割资产</div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-blue-600/10 rounded-lg">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold" data-testid="text-total-assets">
                {totalAssets}
              </div>
              <div className="text-sm text-muted-foreground">总资产数</div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Features Section */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-center">平台特性</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="p-6 space-y-3">
              <div className="p-3 bg-primary/10 rounded-lg w-fit">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">自动收益分配</h3>
              <p className="text-muted-foreground">
                智能合约自动将收益按持有代币比例分配给所有代币持有者
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-3">
              <div className="p-3 bg-green-600/10 rounded-lg w-fit">
                <Coins className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold">ERC-20 代币</h3>
              <p className="text-muted-foreground">
                将NFT分割为标准ERC-20代币，可在任何DEX上自由交易
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-3">
              <div className="p-3 bg-blue-600/10 rounded-lg w-fit">
                <TrendingUp className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold">透明追踪</h3>
              <p className="text-muted-foreground">
                所有交易和收益分配记录在区块链上，完全透明可追溯
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Assets Section */}
      <section className="space-y-6">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <h2 className="text-3xl font-bold">收益资产</h2>
          <div className="flex gap-3">
            <Button 
              variant="secondary" 
              onClick={handleImportFromBlockchain}
              disabled={isImporting}
              data-testid="button-import-blockchain"
            >
              <Download className="mr-2 w-4 h-4" />
              {isImporting ? '导入中...' : '从区块链导入'}
            </Button>
            <Link href="/assets">
              <Button variant="outline" data-testid="button-view-all">
                查看全部
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="h-96 animate-pulse">
                <div className="h-full bg-muted" />
              </Card>
            ))}
          </div>
        ) : assets && assets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {assets.slice(0, 6).map((asset) => (
              <AssetCard key={asset.id} asset={asset} onClick={() => navigate(`/assets/${asset.id}`)} />
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground mb-4">
              还没有资产，创建第一个收益资产吧！
            </p>
            <Link href="/create">
              <Button data-testid="button-create-first">
                创建资产
              </Button>
            </Link>
          </Card>
        )}
      </section>
    </div>
  );
}
