import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoute } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AssetCard from '@/components/AssetCard';
import FractionalizeForm from '@/components/FractionalizeForm';
import TokenPurchaseForm from '@/components/TokenPurchaseForm';
import RevenueDistributionCard from '@/components/RevenueDistributionCard';
import { WithdrawRevenueCard } from '@/components/WithdrawRevenueCard';
import OracleConfigCard from '@/components/OracleConfigCard';
import { fractionalizeAsset, purchaseTokens, distributeRevenue, recordRevenue, isNFTFragmentalized, NFT_CONTRACT_ADDRESS, ORACLE_FACTORY_ADDRESS } from '@/lib/contract';
import { useWallet } from '@/lib/web3';
import { apiRequest } from '@/lib/queryClient';
import { formatTokenAmount } from '@/lib/tokenUnits';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, AlertCircle, RefreshCw } from 'lucide-react';
import { Link } from 'wouter';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { RevenueAsset, RevenueDistribution, TokenHolder } from '@shared/schema';

export default function AssetDetailPage() {
  const [, params] = useRoute('/assets/:id');
  const assetId = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { address, isConnected, balance } = useWallet();
  const [revenueAmount, setRevenueAmount] = useState('0.01');

  const { data: asset, isLoading: assetLoading } = useQuery<RevenueAsset>({
    queryKey: ['/api/assets', assetId],
    enabled: !!assetId,
  });

  const { data: distributions } = useQuery<RevenueDistribution[]>({
    queryKey: ['/api/distributions/asset', assetId],
    enabled: !!assetId && asset?.isFragmented,
  });

  const { data: holders } = useQuery<TokenHolder[]>({
    queryKey: ['/api/token-holders/asset', assetId],
    enabled: !!assetId && asset?.isFragmented,
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshFromBlockchain = async () => {
    if (!asset?.nftTokenId) return;
    
    try {
      setIsRefreshing(true);
      
      toast({
        title: "刷新中",
        description: "正在从区块链读取最新数据...",
      });

      // Import just this NFT from blockchain
      const { getNFTMetadata, isNFTFragmentalized } = await import('@/lib/contract');
      const metadata = await getNFTMetadata(asset.nftTokenId);
      const fragStatus = await isNFTFragmentalized(asset.nftTokenId);

      // Update backend cache
      await apiRequest('POST', `/api/assets/${assetId}/refresh-from-blockchain`, {
        metadata,
        fragStatus,
      });

      // Refresh queries
      await queryClient.invalidateQueries({ queryKey: ['/api/assets', assetId] });
      await queryClient.invalidateQueries({ queryKey: ['/api/token-holders/asset', assetId] });
      await queryClient.invalidateQueries({ queryKey: ['/api/distributions/asset', assetId] });

      toast({
        title: "刷新成功！",
        description: "已从区块链同步最新状态",
      });
    } catch (error: any) {
      toast({
        title: "刷新失败",
        description: error.message || "从区块链刷新数据失败",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const fractionalizeMutation = useMutation({
    mutationFn: async (data: any) => {
      // Check if NFT is already fractionalized
      const checkResult = await isNFTFragmentalized(asset!.nftTokenId!);
      if (checkResult) {
        throw new Error('此 NFT 已经被分割化，无法重复操作。请刷新页面查看最新状态。');
      }

      const result = await fractionalizeAsset(
        asset!.nftTokenId!,
        data.erc20TokenName,
        data.erc20TokenSymbol,
        data.totalTokenSupply,
        data.pricePerToken.toString()
      );

      const res = await apiRequest('POST', `/api/assets/${assetId}/fractionalize`, {
        ...data,
        pricePerToken: data.pricePerToken.toString(),
        erc20ContractAddress: result.erc20ContractAddress || result.erc20Address,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assets', assetId] });
      toast({ title: '分割化成功!', description: 'ERC-20 代币已创建' });
    },
    onError: (error: Error) => {
      toast({ title: '分割化失败', description: error.message, variant: 'destructive' });
    },
  });

  const purchaseMutation = useMutation({
    mutationFn: async (data: { tokenAmount: number }) => {
      // 防止owner购买自己的代币（导致tokensSold计算错误）
      if (address?.toLowerCase() === asset!.ownerAddress?.toLowerCase()) {
        throw new Error('资产所有者不能购买自己的代币。这会导致"已售代币"统计错误。请使用其他钱包地址购买。');
      }
      
      const result = await purchaseTokens(
        asset!.erc20ContractAddress!,
        data.tokenAmount.toString(),
        asset!.pricePerToken || "0",
        assetId // Pass assetId for Demo mode backend update
      );
      
      // Transaction already confirmed (result.receipt is the completed TransactionReceipt)
      // Poll for indexer to sync (max 30 seconds)
      const startTime = Date.now();
      const maxWaitTime = 30000; // 30 seconds
      const pollInterval = 1000; // 1 second
      
      const initialTokensSold = Number(asset!.tokensSold || 0);
      
      while (Date.now() - startTime < maxWaitTime) {
        // Wait before polling
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        // Fetch fresh data from server
        await queryClient.refetchQueries({ queryKey: ['/api/assets', assetId] });
        await queryClient.refetchQueries({ queryKey: ['/api/token-holders/asset', assetId] });
        
        // Check if update is visible
        const updatedAsset = queryClient.getQueryData<RevenueAsset>(['/api/assets', assetId]);
        
        if (updatedAsset && Number(updatedAsset.tokensSold || 0) >= initialTokensSold + data.tokenAmount) {
          // Update synced successfully
          return;
        }
      }
      
      // Timeout reached, but transaction was successful
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assets', assetId] });
      queryClient.invalidateQueries({ queryKey: ['/api/token-holders/asset', assetId] });
      toast({ 
        title: '购买成功!', 
        description: '代币已添加到您的钱包。区块链事件已自动同步到数据库。' 
      });
    },
    onError: (error: Error) => {
      toast({ title: '购买失败', description: error.message, variant: 'destructive' });
    },
  });

  const recordRevenueMutation = useMutation({
    mutationFn: async () => {
      // 验证输入
      const revenueAmountNum = Number(revenueAmount);
      
      // 检查输入是否有效
      if (isNaN(revenueAmountNum) || revenueAmountNum <= 0) {
        throw new Error('请输入有效的收益金额（必须大于 0）');
      }
      
      // 调用智能合约
      const result = await recordRevenue(asset!.erc20ContractAddress!, revenueAmount);
      
      // Transaction already confirmed (result.receipt is the completed TransactionReceipt)
      // Poll for indexer to sync (max 30 seconds)
      const startTime = Date.now();
      const maxWaitTime = 30000;
      const pollInterval = 1000;
      
      const initialRevenue = parseFloat(asset!.totalRevenue || "0");
      
      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        await queryClient.refetchQueries({ queryKey: ['/api/assets', assetId] });
        
        const updatedAsset = queryClient.getQueryData<RevenueAsset>(['/api/assets', assetId]);
        
        // Check if revenue increased
        if (updatedAsset && parseFloat(updatedAsset.totalRevenue || "0") >= initialRevenue + revenueAmountNum) {
          return;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assets', assetId] });
      toast({ 
        title: '收益已记录', 
        description: `已添加 ${revenueAmount} ETH。区块链事件已自动同步到数据库。` 
      });
      setRevenueAmount('0.01');
    },
    onError: (error: Error) => {
      toast({ title: '记录失败', description: error.message, variant: 'destructive' });
    },
  });

  const distributeMutation = useMutation({
    mutationFn: async () => {
      const result = await distributeRevenue(asset!.erc20ContractAddress!);
      
      // Transaction already confirmed (result.receipt is the completed TransactionReceipt)
      // Poll for indexer to sync (max 30 seconds)
      const startTime = Date.now();
      const maxWaitTime = 30000;
      const pollInterval = 1000;
      
      const initialDist = queryClient.getQueryData<RevenueDistribution[]>(['/api/distributions/asset', assetId]) || [];
      const initialDistCount = initialDist.length;
      
      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        await queryClient.refetchQueries({ queryKey: ['/api/assets', assetId] });
        await queryClient.refetchQueries({ queryKey: ['/api/distributions/asset', assetId] });
        
        const updatedDist = queryClient.getQueryData<RevenueDistribution[]>(['/api/distributions/asset', assetId]);
        
        // Check if new distribution was added
        if (updatedDist && updatedDist.length > initialDistCount) {
          return;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assets', assetId] });
      queryClient.invalidateQueries({ queryKey: ['/api/distributions/asset', assetId] });
      toast({ 
        title: '收益分配成功！', 
        description: '已在智能合约中记录收益额度。代币持有者可以查看"我的收益"卡片并点击"提取收益"按钮领取 ETH。区块链事件已自动同步到数据库。',
        duration: 8000,
      });
    },
    onError: (error: Error) => {
      toast({ title: '分配失败', description: error.message, variant: 'destructive' });
    },
  });

  if (assetLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto" />
        </Card>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">资产不存在</p>
        </Card>
      </div>
    );
  }

  // Check if in Demo mode (contract addresses not set)
  const isDemoMode = !NFT_CONTRACT_ADDRESS && !ORACLE_FACTORY_ADDRESS;
  
  // Multi-user mode: Only allow owner operations when wallet matches asset owner
  // This enables a true marketplace where users can see all assets but only manage their own
  // In Demo mode, allow any user to act as owner for testing purposes
  const isOwner = isDemoMode || (isConnected && address?.toLowerCase() === asset.ownerAddress?.toLowerCase());

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between mb-4">
        <Link href="/">
          <Button variant="ghost" data-testid="button-back">
            <ArrowLeft className="mr-2 w-4 h-4" />
            返回首页
          </Button>
        </Link>
        
        <Button
          variant="outline"
          onClick={handleRefreshFromBlockchain}
          disabled={isRefreshing}
          data-testid="button-refresh"
        >
          <RefreshCw className={`mr-2 w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          从链上刷新
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <AssetCard asset={asset} />
        </div>

        <div className="lg:col-span-2">
          {!isOwner && isConnected && (
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>这不是您的资产</AlertTitle>
              <AlertDescription>
                所有者: {asset.ownerAddress?.slice(0, 10)}...{asset.ownerAddress?.slice(-8)}
                <br />
                您可以查看资产信息和购买代币，但不能进行分割化或收益管理操作。
              </AlertDescription>
            </Alert>
          )}

          {!isConnected && (
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>未连接钱包</AlertTitle>
              <AlertDescription>
                请连接 MetaMask 钱包以进行购买、分割化和收益管理等操作。
              </AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="details" data-testid="tab-details">详情</TabsTrigger>
              <TabsTrigger value="fractionalize" disabled={asset.isFragmented || !isOwner} data-testid="tab-fractionalize">
                分割化
              </TabsTrigger>
              <TabsTrigger value="purchase" disabled={!asset.isFragmented} data-testid="tab-purchase">
                购买代币
              </TabsTrigger>
              <TabsTrigger value="revenue" disabled={!asset.isFragmented || !isOwner} data-testid="tab-revenue">
                收益管理
              </TabsTrigger>
              <TabsTrigger value="oracle" disabled={!asset.isFragmented || !isOwner} data-testid="tab-oracle">
                Oracle 自动化
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4">
              <Card>
                <CardContent className="p-6 space-y-4">
                  <div>
                    <h3 className="text-sm text-muted-foreground">资产名称</h3>
                    <p className="text-lg font-medium">{asset.name}</p>
                  </div>
                  <div>
                    <h3 className="text-sm text-muted-foreground">描述</h3>
                    <p>{asset.description}</p>
                  </div>
                  <div>
                    <h3 className="text-sm text-muted-foreground">类型</h3>
                    <p>{asset.assetType}</p>
                  </div>
                  <div>
                    <h3 className="text-sm text-muted-foreground">状态</h3>
                    <p className="capitalize">{asset.status}</p>
                  </div>
                </CardContent>
              </Card>

              {asset.isFragmented && asset.erc20ContractAddress && (
                <WithdrawRevenueCard
                  assetId={assetId!}
                  assetName={asset.name}
                  erc20ContractAddress={asset.erc20ContractAddress}
                  tokenSymbol={asset.erc20TokenSymbol || 'TOKEN'}
                />
              )}

              {holders && holders.length > 0 && (
                <Card>
                  <CardContent className="p-6">
                    <h3 className="text-lg font-semibold mb-4">代币持有者</h3>
                    <div className="space-y-2">
                      {holders.map((holder) => (
                        <div key={holder.id} className="flex justify-between items-center text-sm p-3 bg-muted rounded" data-testid={`holder-${holder.holderAddress}`}>
                          <div className="flex flex-col gap-1">
                            <span className="font-mono text-xs">{holder.holderAddress.slice(0, 10)}...</span>
                            <span className="text-xs text-muted-foreground">
                              可提取收益: {holder.availableRevenue || '0'} ETH
                            </span>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-medium">{formatTokenAmount(holder.tokenAmount, 2)} 代币</span>
                            <span className="text-xs text-muted-foreground" data-testid={`percentage-${holder.holderAddress}`}>
                              {Number(holder.percentage || 0).toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="fractionalize">
              {isOwner && !asset.isFragmented && asset.status === 'minted' ? (
                <FractionalizeForm
                  assetName={asset.name}
                  onSubmit={async (data) => { fractionalizeMutation.mutate(data); }}
                  isSubmitting={fractionalizeMutation.isPending}
                />
              ) : (
                <Card>
                  <CardContent className="p-12 text-center space-y-2">
                    <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground" />
                    <p className="text-muted-foreground">
                      {!isOwner ? '只有资产所有者可以进行分割化操作' : '此资产已经完成分割化'}
                    </p>
                    {!isConnected && (
                      <p className="text-sm text-muted-foreground">
                        请连接 MetaMask 钱包
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="purchase">
              {asset.isFragmented ? (
                <TokenPurchaseForm
                  asset={asset}
                  onSubmit={async (data) => { purchaseMutation.mutate(data); }}
                  isSubmitting={purchaseMutation.isPending}
                />
              ) : (
                <Card>
                  <CardContent className="p-12 text-center">
                    <p className="text-muted-foreground">资产尚未分割化</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="revenue" className="space-y-4">
              {isOwner && asset.isFragmented ? (
                <>
                  <Card>
                    <CardContent className="p-6 space-y-4">
                      <h3 className="text-lg font-semibold">记录收益</h3>
                      <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-md space-y-2 text-sm">
                        <p className="font-medium">💡 使用说明</p>
                        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                          <li>此功能模拟外部收益（如版税、租金）进入智能合约</li>
                          <li>您需要发送 ETH 到合约来演示收益分配功能</li>
                          <li>建议使用小额测试（如 0.01 ETH）</li>
                          <li>系统会自动检查余额，如不足 MetaMask 会提示错误</li>
                        </ul>
                      </div>
                      
                      {isConnected && balance && Number(balance) > 0 && (
                        <div className="bg-muted p-3 rounded-md">
                          <p className="text-sm text-muted-foreground mb-1">钱包余额（参考）</p>
                          <p className="text-lg font-semibold">{Number(balance).toFixed(4)} ETH</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            实际余额以 MetaMask 为准
                          </p>
                        </div>
                      )}
                      
                      <div className="space-y-2">
                        <Label>收益金额 (ETH)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0.001"
                          value={revenueAmount}
                          onChange={(e) => setRevenueAmount(e.target.value)}
                          data-testid="input-revenue-amount"
                          placeholder="建议: 0.01"
                        />
                        <p className="text-xs text-muted-foreground">
                          建议金额: 0.01 - 0.05 ETH（用于演示）<br />
                          系统会自动检查余额，如不足会提示错误
                        </p>
                      </div>
                      <Button
                        onClick={() => recordRevenueMutation.mutate()}
                        disabled={
                          recordRevenueMutation.isPending || 
                          Number(revenueAmount) <= 0
                        }
                        className="w-full"
                        data-testid="button-record-revenue"
                      >
                        {recordRevenueMutation.isPending ? '记录中...' : '记录收益'}
                      </Button>
                    </CardContent>
                  </Card>

                  <RevenueDistributionCard
                    asset={asset}
                    distributions={distributions || []}
                    onDistribute={() => distributeMutation.mutate()}
                    isDistributing={distributeMutation.isPending}
                  />
                </>
              ) : (
                <Card>
                  <CardContent className="p-12 text-center space-y-2">
                    <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground" />
                    <p className="text-muted-foreground">
                      {!asset.isFragmented 
                        ? '资产尚未分割化，无法管理收益' 
                        : '只有资产所有者可以管理收益'}
                    </p>
                    {!isConnected && (
                      <p className="text-sm text-muted-foreground">
                        请连接 MetaMask 钱包
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="oracle">
              <OracleConfigCard asset={asset} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
