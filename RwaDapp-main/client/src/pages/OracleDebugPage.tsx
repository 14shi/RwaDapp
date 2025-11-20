import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { 
  AlertCircle, 
  CheckCircle2, 
  Info, 
  RefreshCw, 
  Zap, 
  Settings,
  Activity,
  Wallet,
  Code,
  PlayCircle,
  AlertTriangle
} from 'lucide-react';
import type { RevenueAsset } from '@shared/schema';

export default function OracleDebugPage() {
  const { id } = useParams();
  const { toast } = useToast();
  const [newRevenue, setNewRevenue] = useState('0.1');
  
  // Fetch asset data
  const { data: asset, isLoading: assetLoading } = useQuery<RevenueAsset>({
    queryKey: ['/api/assets', id],
    enabled: !!id,
  });
  
  // Fetch Oracle debug info
  const { data: debugInfo, isLoading: debugLoading, refetch: refetchDebug } = useQuery({
    queryKey: ['/api/oracle-debug', asset?.erc20ContractAddress],
    queryFn: async () => {
      const url = asset?.erc20ContractAddress 
        ? `/api/oracle-debug?tokenAddress=${asset.erc20ContractAddress}`
        : '/api/oracle-debug';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch debug info');
      return res.json();
    },
    enabled: true,
    refetchInterval: 10000, // Refresh every 10 seconds
  });
  
  // Fetch on-chain Oracle config
  const { data: chainConfig, refetch: refetchConfig } = useQuery({
    queryKey: ['/api/oracle-debug', 'chain', asset?.erc20ContractAddress],
    queryFn: async () => {
      const res = await fetch(`/api/oracle-debug/${asset?.erc20ContractAddress}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!asset?.erc20ContractAddress,
  });
  
  // Check upkeep status
  const { data: upkeepStatus, refetch: refetchUpkeep } = useQuery({
    queryKey: ['/api/oracle-debug/check-upkeep', asset?.erc20ContractAddress],
    queryFn: async () => {
      const res = await fetch(`/api/oracle-debug/check-upkeep/${asset?.erc20ContractAddress}`);
      if (!res.ok) throw new Error('Failed to check upkeep');
      return res.json();
    },
    enabled: !!asset?.erc20ContractAddress,
  });
  
  // Manual revenue update mutation
  const triggerUpdateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/oracle-debug/trigger-update', {
        tokenAddress: asset?.erc20ContractAddress,
        newRevenue: newRevenue,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: '✅ Revenue Updated',
        description: `Transaction: ${data.transactionHash?.substring(0, 10)}...`,
      });
      refetchConfig();
      refetchUpkeep();
    },
    onError: (error: Error) => {
      toast({
        title: '❌ Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  
  // Perform upkeep mutation
  const performUpkeepMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/oracle-debug/perform-upkeep', {
        tokenAddress: asset?.erc20ContractAddress,
        performData: upkeepStatus?.performData || '0x',
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: '✅ Upkeep Performed',
        description: `Transaction: ${data.transactionHash?.substring(0, 10)}...`,
      });
      refetchUpkeep();
      refetchConfig();
    },
    onError: (error: Error) => {
      toast({
        title: '❌ Upkeep Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  
  if (assetLoading || debugLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }
  
  if (!asset) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Asset Not Found</AlertTitle>
          <AlertDescription>
            The requested asset could not be found.
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  const walletStatus = debugInfo?.walletStatus;
  const contractStatus = debugInfo?.contractStatus;
  const hasWallet = walletStatus?.configured;
  const isOwner = contractStatus?.isOwner;
  
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Oracle Debug Console</h1>
          <p className="text-muted-foreground mt-1">
            Asset: {asset.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/assets/${id}`}>
            <Button variant="outline">Back to Asset</Button>
          </Link>
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => {
              refetchDebug();
              refetchConfig();
              refetchUpkeep();
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Wallet Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Wallet Status
          </CardTitle>
          <CardDescription>
            Backend Oracle wallet configuration and balance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasWallet ? (
            <>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">Address</Label>
                  <p className="font-mono">{walletStatus.address}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Balance</Label>
                  <p className="font-semibold">
                    {walletStatus.balance} ETH
                    {parseFloat(walletStatus.balance || '0') < 0.01 && (
                      <Badge variant="destructive" className="ml-2">Low</Badge>
                    )}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Network</Label>
                  <p>{walletStatus.network} (Chain ID: {walletStatus.chainId})</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <Badge variant={parseFloat(walletStatus.balance || '0') > 0 ? 'default' : 'destructive'}>
                    {parseFloat(walletStatus.balance || '0') > 0 ? 'Ready' : 'Need ETH'}
                  </Badge>
                </div>
              </div>
              
              {parseFloat(walletStatus.balance || '0') === 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>No ETH Balance</AlertTitle>
                  <AlertDescription>
                    Send Sepolia ETH to {walletStatus.address} to enable Oracle operations.
                    Get free testnet ETH from: https://sepolia-faucet.pk910.de
                  </AlertDescription>
                </Alert>
              )}
            </>
          ) : (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Wallet Not Configured</AlertTitle>
              <AlertDescription>
                Set PRIVATE_KEY environment variable to enable blockchain interaction.
                Oracle will run in MVP mode (database only) until configured.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      
      {/* Contract Configuration Card */}
      {asset.erc20ContractAddress && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Contract Configuration
            </CardTitle>
            <CardDescription>
              On-chain Oracle settings for token: {asset.erc20ContractAddress}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {chainConfig ? (
              <>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-muted-foreground">Contract Owner</Label>
                    <p className="font-mono text-xs">{chainConfig.owner}</p>
                    {isOwner && <Badge className="mt-1">You are owner</Badge>}
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Automation Enabled</Label>
                    <Badge variant={chainConfig.autoEnabled ? 'default' : 'outline'}>
                      {chainConfig.autoEnabled ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Subscription ID</Label>
                    <p>{chainConfig.subscriptionId || 'Not set'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">DON ID</Label>
                    <p>{chainConfig.donId || 'Not set'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Gas Limit</Label>
                    <p>{chainConfig.gasLimit || 'Default'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Update Interval</Label>
                    <p>{chainConfig.updateInterval ? `${chainConfig.updateInterval}s` : 'Not set'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Last Update</Label>
                    <p>
                      {chainConfig.lastRevenueUpdate 
                        ? new Date(chainConfig.lastRevenueUpdate * 1000).toLocaleString()
                        : 'Never'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Operating Revenue</Label>
                    <p>{chainConfig.operatingRevenue || '0'} ETH</p>
                  </div>
                </div>
                
                {chainConfig.revenueSource && (
                  <div>
                    <Label className="text-muted-foreground">Revenue Source Script</Label>
                    <pre className="bg-muted p-2 rounded text-xs mt-1 overflow-x-auto">
                      {chainConfig.revenueSource.substring(0, 200)}...
                    </pre>
                  </div>
                )}
              </>
            ) : (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>No Configuration Found</AlertTitle>
                <AlertDescription>
                  Oracle has not been configured for this token yet.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
      
      {/* Upkeep Status Card */}
      {asset.erc20ContractAddress && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Chainlink Upkeep Status
            </CardTitle>
            <CardDescription>
              Check if Oracle automation needs to be triggered
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {upkeepStatus ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Upkeep Needed</Label>
                    <div className="flex items-center gap-2 mt-1">
                      {upkeepStatus.upkeepNeeded ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-muted-foreground" />
                      )}
                      <span className="font-semibold">
                        {upkeepStatus.upkeepNeeded ? 'Yes - Ready to update' : 'No - Not yet time'}
                      </span>
                    </div>
                  </div>
                  
                  {upkeepStatus.upkeepNeeded && (
                    <Button
                      onClick={() => performUpkeepMutation.mutate()}
                      disabled={performUpkeepMutation.isPending || !hasWallet || !isOwner}
                    >
                      {performUpkeepMutation.isPending ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          Performing...
                        </>
                      ) : (
                        <>
                          <PlayCircle className="mr-2 h-4 w-4" />
                          Perform Upkeep
                        </>
                      )}
                    </Button>
                  )}
                </div>
                
                {upkeepStatus.performData && upkeepStatus.performData !== '0x' && (
                  <div>
                    <Label className="text-muted-foreground">Perform Data</Label>
                    <p className="font-mono text-xs bg-muted p-2 rounded mt-1">
                      {upkeepStatus.performData}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Unable to check upkeep status</p>
            )}
          </CardContent>
        </Card>
      )}
      
      {/* Manual Testing Card */}
      {asset.erc20ContractAddress && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Manual Testing
            </CardTitle>
            <CardDescription>
              Manually trigger Oracle updates for testing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="revenue">New Revenue Amount (ETH)</Label>
              <div className="flex gap-2">
                <Input
                  id="revenue"
                  type="number"
                  step="0.01"
                  value={newRevenue}
                  onChange={(e) => setNewRevenue(e.target.value)}
                  placeholder="0.1"
                  disabled={!hasWallet || !isOwner}
                />
                <Button
                  onClick={() => triggerUpdateMutation.mutate()}
                  disabled={triggerUpdateMutation.isPending || !hasWallet || !isOwner}
                >
                  {triggerUpdateMutation.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      Update Revenue
                    </>
                  )}
                </Button>
              </div>
              {!isOwner && hasWallet && (
                <p className="text-sm text-muted-foreground">
                  Only the contract owner can update revenue
                </p>
              )}
            </div>
            
            <Separator />
            
            <div>
              <h4 className="font-semibold mb-2">Test Scenarios</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>1. Update revenue manually and verify it appears on-chain</p>
                <p>2. Check if upkeep is needed after update interval passes</p>
                <p>3. Perform upkeep when needed to trigger automation</p>
                <p>4. Verify revenue distribution to token holders</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Debug Information */}
      {debugInfo?.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Debug Error</AlertTitle>
          <AlertDescription>{debugInfo.error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}