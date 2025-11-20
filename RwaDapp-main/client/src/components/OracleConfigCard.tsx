import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useWallet } from '@/lib/web3';
import { Loader2, Zap, ZapOff, Settings, AlertCircle, FileCode, ExternalLink, Bug } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CHAINLINK_CONSTANTS, SAMPLE_REVENUE_SOURCES } from '@/lib/chainlink-constants';
import type { RevenueAsset } from '@shared/schema';
import { Link } from 'wouter';

interface OracleConfigCardProps {
  asset: RevenueAsset;
}

interface OracleStatus {
  isOracleEnabled: boolean;
  oracleAutoEnabled: boolean;
  oracleUpdateInterval?: number;
  oracleLastUpdate?: Date;
  nextUpdateTime?: Date;
}

export default function OracleConfigCard({ asset }: OracleConfigCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { address, signMessage } = useWallet();
  const [subscriptionId, setSubscriptionId] = useState('');
  const [donId, setDonId] = useState<string>(CHAINLINK_CONSTANTS.SEPOLIA.DON_ID_STRING);
  const [updateInterval, setUpdateInterval] = useState<string>(CHAINLINK_CONSTANTS.SEPOLIA.INTERVALS.TEST.toString());
  const [revenueSource, setRevenueSource] = useState('');
  const [selectedExample, setSelectedExample] = useState<string>('');

  // Load example script when selected
  useEffect(() => {
    if (selectedExample && selectedExample !== 'custom') {
      const scripts = SAMPLE_REVENUE_SOURCES as Record<string, string>;
      setRevenueSource(scripts[selectedExample] || '');
    }
  }, [selectedExample]);

  // Query Oracle status
  const { data: oracleStatus, isLoading: statusLoading } = useQuery<OracleStatus>({
    queryKey: ['/api/assets', asset.id, 'oracle-status'],
    enabled: !!asset.id && asset.isFragmented,
  });

  // Enable Oracle mutation with challenge-response flow
  const enableOracleMutation = useMutation({
    mutationFn: async () => {
      if (!address) throw new Error('请先连接钱包');

      // Step 1: Get nonce challenge
      const challengeRes = await apiRequest('GET', `/api/assets/${asset.id}/oracle-challenge`);
      const { nonce } = await challengeRes.json();

      // Step 2: Sign message with nonce
      const message = `Enable Oracle for asset ${asset.id}\nNonce: ${nonce}`;
      const signature = await signMessage(message);

      // Step 3: Submit with signature
      const res = await apiRequest('POST', `/api/assets/${asset.id}/enable-oracle`, {
        ownerAddress: address,
        signature,
        nonce,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/assets', asset.id, 'oracle-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/assets', asset.id] });
      
      const mode = data.mode === 'blockchain' ? '链上' : 'MVP模式';
      toast({
        title: `Oracle 已启用 (${mode})`,
        description: data.message || 'Chainlink Automation 功能已激活',
      });
    },
    onError: (error: Error) => {
      toast({
        title: '启用失败',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Configure Oracle mutation
  const configureOracleMutation = useMutation({
    mutationFn: async () => {
      if (!address) throw new Error('请先连接钱包');
      if (!subscriptionId || !donId || !updateInterval || !revenueSource) {
        throw new Error('请填写所有配置参数');
      }

      // Step 1: Get nonce
      const challengeRes = await apiRequest('GET', `/api/assets/${asset.id}/oracle-challenge`);
      const { nonce } = await challengeRes.json();

      // Step 2: Sign
      const message = `Configure Oracle for asset ${asset.id}\nNonce: ${nonce}`;
      const signature = await signMessage(message);

      // Step 3: Submit
      const res = await apiRequest('POST', `/api/assets/${asset.id}/configure-oracle`, {
        ownerAddress: address,
        signature,
        nonce,
        subscriptionId,
        donId,
        updateInterval: parseInt(updateInterval),
        revenueSource,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/assets', asset.id, 'oracle-status'] });
      
      const mode = data.mode === 'blockchain' ? '链上' : 'MVP模式';
      let description = data.message || 'Chainlink 参数已更新';
      if (data.transactionHash) {
        description += `\n交易哈希: ${data.transactionHash}`;
      }
      
      toast({
        title: `配置成功 (${mode})`,
        description,
      });
    },
    onError: (error: Error) => {
      toast({
        title: '配置失败',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Toggle automation mutation
  const toggleAutomationMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!address) throw new Error('请先连接钱包');

      // Step 1: Get nonce
      const challengeRes = await apiRequest('GET', `/api/assets/${asset.id}/oracle-challenge`);
      const { nonce } = await challengeRes.json();

      // Step 2: Sign
      const message = `Toggle Oracle automation for asset ${asset.id} to ${enabled}\nNonce: ${nonce}`;
      const signature = await signMessage(message);

      // Step 3: Submit
      const res = await apiRequest('POST', `/api/assets/${asset.id}/toggle-oracle-automation`, {
        ownerAddress: address,
        signature,
        nonce,
        enabled,
      });
      return res.json();
    },
    onSuccess: (data, enabled) => {
      queryClient.invalidateQueries({ queryKey: ['/api/assets', asset.id, 'oracle-status'] });
      
      const mode = data.mode === 'blockchain' ? '链上' : 'MVP模式';
      let description = data.message || (enabled
        ? 'Chainlink Upkeep 将自动触发收益分配'
        : 'Chainlink Upkeep 已暂停');
      if (data.transactionHash) {
        description += `\n交易哈希: ${data.transactionHash}`;
      }
      
      toast({
        title: `${enabled ? '自动化已启用' : '自动化已禁用'} (${mode})`,
        description,
      });
    },
    onError: (error: Error) => {
      toast({
        title: '操作失败',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  if (!asset.isFragmented) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            请先完成资产分割化才能启用 Oracle 自动化功能
          </p>
        </CardContent>
      </Card>
    );
  }

  if (statusLoading) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto" />
        </CardContent>
      </Card>
    );
  }

  const isOwner = address?.toLowerCase() === asset.ownerAddress?.toLowerCase();

  if (!isOwner) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            只有资产所有者可以配置 Oracle 自动化
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Oracle Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {oracleStatus?.isOracleEnabled ? (
                  <>
                    <Zap className="w-5 h-5 text-yellow-500" />
                    Oracle 状态：已启用
                  </>
                ) : (
                  <>
                    <ZapOff className="w-5 h-5 text-muted-foreground" />
                    Oracle 状态：未启用
                  </>
                )}
              </CardTitle>
              <CardDescription className="mt-1">
                Chainlink Automation 自动化收益分配功能
              </CardDescription>
            </div>
            <Link href={`/oracle-debug/${asset.id}`}>
              <Button variant="outline" size="sm">
                <Bug className="mr-2 h-4 w-4" />
                调试控制台
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!oracleStatus?.isOracleEnabled ? (
            <>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>关于 Oracle 自动化</AlertTitle>
                <AlertDescription>
                  启用后，Chainlink Automation 将定期检查并自动分配收益给代币持有者，
                  无需手动触发。需要配置 Chainlink subscription 和 DON ID。
                </AlertDescription>
              </Alert>
              <Button
                onClick={() => enableOracleMutation.mutate()}
                disabled={enableOracleMutation.isPending}
                className="w-full"
                data-testid="button-enable-oracle"
              >
                {enableOracleMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                    启用中...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 w-4 h-4" />
                    启用 Oracle 自动化
                  </>
                )}
              </Button>
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div>
                  <p className="text-sm font-medium">自动化状态</p>
                  <p className="text-xs text-muted-foreground">
                    {oracleStatus.oracleAutoEnabled ? '正在运行' : '已暂停'}
                  </p>
                </div>
                <Switch
                  checked={oracleStatus.oracleAutoEnabled}
                  onCheckedChange={(checked) => toggleAutomationMutation.mutate(checked)}
                  disabled={toggleAutomationMutation.isPending}
                  data-testid="switch-automation"
                />
              </div>

              {oracleStatus.oracleUpdateInterval && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium">更新间隔</p>
                  <p className="text-xs text-muted-foreground">
                    每 {oracleStatus.oracleUpdateInterval} 秒检查一次
                  </p>
                </div>
              )}

              {oracleStatus.oracleLastUpdate && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium">上次更新</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(oracleStatus.oracleLastUpdate).toLocaleString('zh-CN')}
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configuration Card - only show if Oracle is enabled */}
      {oracleStatus?.isOracleEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Chainlink 配置
            </CardTitle>
            <CardDescription>
              配置 Chainlink Functions 和 Automation 参数
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                这些参数需要从 Chainlink 平台获取。请确保已创建 Chainlink Functions Subscription 并获得 DON ID。
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="subscriptionId">Subscription ID</Label>
              <Input
                id="subscriptionId"
                value={subscriptionId}
                onChange={(e) => setSubscriptionId(e.target.value)}
                placeholder="例如: 123"
                data-testid="input-subscription-id"
              />
              <p className="text-xs text-muted-foreground">
                从 functions.chain.link 获取的 subscription ID
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="donId">DON ID</Label>
              <Input
                id="donId"
                value={donId}
                onChange={(e) => setDonId(e.target.value)}
                placeholder="fun-ethereum-sepolia-1"
                data-testid="input-don-id"
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Sepolia 网络 DON ID（已自动配置）
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="updateInterval">更新间隔 (秒)</Label>
              <Input
                id="updateInterval"
                type="number"
                value={updateInterval}
                onChange={(e) => setUpdateInterval(e.target.value)}
                placeholder="3600"
                min="60"
                data-testid="input-update-interval"
              />
              <p className="text-xs text-muted-foreground">
                自动检查并分配收益的时间间隔（建议: 3600秒 = 1小时）
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="exampleSelector" className="flex items-center gap-2">
                  <FileCode className="w-4 h-4" />
                  Revenue Source 示例
                </Label>
              </div>
              <Select value={selectedExample} onValueChange={setSelectedExample}>
                <SelectTrigger id="exampleSelector" data-testid="select-revenue-example">
                  <SelectValue placeholder="选择示例脚本或自定义" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">自定义脚本</SelectItem>
                  <SelectItem value="FIXED_REVENUE">固定收益测试</SelectItem>
                  <SelectItem value="RANDOM_REVENUE">随机收益测试</SelectItem>
                  <SelectItem value="SPOTIFY_EXAMPLE">Spotify 示例（需要 API 密钥）</SelectItem>
                  <SelectItem value="TOKEN_TERMINAL_EXAMPLE">Token Terminal 示例</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="revenueSource">Revenue Source (JavaScript)</Label>
              <Textarea
                id="revenueSource"
                value={revenueSource}
                onChange={(e) => {
                  setRevenueSource(e.target.value);
                  setSelectedExample('custom');
                }}
                placeholder="// JavaScript code to fetch revenue data&#10;// Example:&#10;const response = await Functions.makeHttpRequest({&#10;  url: 'https://api.example.com/revenue'&#10;});&#10;return Functions.encodeUint256(response.data.amount);"
                rows={8}
                className="font-mono text-xs"
                data-testid="textarea-revenue-source"
              />
              <p className="text-xs text-muted-foreground">
                用于获取收益数据的 JavaScript 代码（Chainlink Functions）
              </p>
            </div>

            <Button
              onClick={() => configureOracleMutation.mutate()}
              disabled={
                configureOracleMutation.isPending ||
                !subscriptionId ||
                !donId ||
                !updateInterval ||
                !revenueSource
              }
              className="w-full"
              data-testid="button-configure-oracle"
            >
              {configureOracleMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                  配置中...
                </>
              ) : (
                '保存配置'
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Help Card */}
      <Card>
        <CardHeader>
          <CardTitle>完整设置指南</CardTitle>
          <CardDescription>
            查看根目录的 <code className="text-xs bg-muted px-1.5 py-0.5 rounded">Chainlink自动化配置完整指南.md</code> 了解详细步骤
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>快速开始</AlertTitle>
            <AlertDescription className="mt-2 space-y-2">
              <p>1. 访问 <a href="https://functions.chain.link" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                functions.chain.link <ExternalLink className="w-3 h-3" />
              </a> 创建 subscription 并充值 LINK</p>
              <p>2. 记下 Subscription ID 并填写到上方表单</p>
              <p>3. 选择一个示例脚本（测试用途推荐"随机收益测试"）</p>
              <p>4. 点击"保存配置"并启用自动化开关</p>
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
            <div>
              <p className="font-medium mb-1">DON ID (Sepolia)</p>
              <p className="text-xs text-muted-foreground font-mono break-all">
                {CHAINLINK_CONSTANTS.SEPOLIA.DON_ID_STRING}
              </p>
            </div>
            <div>
              <p className="font-medium mb-1">推荐更新间隔</p>
              <p className="text-xs text-muted-foreground">
                测试: {CHAINLINK_CONSTANTS.SEPOLIA.INTERVALS.TEST}秒 (5分钟)<br/>
                生产: {CHAINLINK_CONSTANTS.SEPOLIA.INTERVALS.PRODUCTION}秒 (1小时)
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-medium">相关链接</p>
            <div className="flex flex-wrap gap-2">
              <a
                href="https://functions.chain.link"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline inline-flex items-center gap-1"
              >
                Functions 平台 <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href="https://automation.chain.link"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline inline-flex items-center gap-1"
              >
                Automation 平台 <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href="https://faucets.chain.link/sepolia"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline inline-flex items-center gap-1"
              >
                Sepolia 水龙头 <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href="https://docs.chain.link/chainlink-functions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline inline-flex items-center gap-1"
              >
                官方文档 <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
