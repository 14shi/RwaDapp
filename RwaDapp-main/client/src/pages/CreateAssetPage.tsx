import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import CreateAssetForm from '@/components/CreateAssetForm';
import { mintRevenueAssetNFT, requestAssetVerification, NFT_CONTRACT_ADDRESS } from '@/lib/contract';
import { useWallet } from '@/lib/web3';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Loader2, Clock } from 'lucide-react';
import VerificationStatus from '@/components/VerificationStatus';

type CreateFormData = {
  name: string;
  description: string;
  assetType: string;
  imageUrl: string;
  estimatedValue: number;
  verificationMode: 'direct' | 'chainlink';
  externalId?: string;
  ownerProof?: string;
};

export default function CreateAssetPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { address } = useWallet();
  const [mintedAssetId, setMintedAssetId] = useState<string | null>(null);
  const [verificationRequestId, setVerificationRequestId] = useState<string | null>(null);
  const [step, setStep] = useState<'create' | 'processing' | 'verifying' | 'success'>('create');

  const createMutation = useMutation({
    mutationFn: async (data: CreateFormData) => {
      const ownerAddr = address || '0x0000000000000000000000000000000000000000';
      
      const assetData = {
        name: data.name,
        description: data.description,
        assetType: data.assetType,
        imageUrl: data.imageUrl,
        estimatedValue: String(data.estimatedValue),
      };

      if (data.verificationMode === 'chainlink') {
        if (!data.externalId || !data.ownerProof) {
          throw new Error('使用 Chainlink 验证时必须提供外部ID和所有权证明');
        }

        const assetRes = await apiRequest('POST', '/api/assets', { ...assetData, externalId: data.externalId });
        const asset = await assetRes.json();

        setStep('processing');

        let verifyResult;
        try {
          verifyResult = await requestAssetVerification(
            data.assetType,
            data.externalId,
            data.ownerProof,
            data.name,
            data.description,
            data.imageUrl,
            String(data.estimatedValue)
          );

          await apiRequest('POST', `/api/assets/${asset.id}/set-verification-request`, {
            requestId: verifyResult.requestId,
            externalId: data.externalId,
            transactionHash: verifyResult.transactionHash,
          });
        } catch (err: any) {
          await apiRequest('DELETE', `/api/assets/${asset.id}`);
          throw new Error(`验证请求失败: ${err.message}`);
        }

        setVerificationRequestId(verifyResult.requestId);
        setMintedAssetId(asset.id);
        setStep('verifying');

        return {
          asset,
          requestId: verifyResult.requestId,
          transactionHash: verifyResult.transactionHash,
          mode: 'chainlink' as const,
        };
      } else {
        const assetRes = await apiRequest('POST', '/api/assets', assetData);
        const asset = await assetRes.json();

        setStep('processing');

        const mintResult = await mintRevenueAssetNFT(
          data.name,
          data.assetType,
          data.description,
          data.imageUrl,
          String(data.estimatedValue)
        );

        const updatedAssetRes = await apiRequest('POST', `/api/assets/${asset.id}/mint-nft`, {
          nftTokenId: mintResult.tokenId,
          nftTransactionHash: mintResult.transactionHash,
          ownerAddress: ownerAddr,
          nftContractAddress: mintResult.contractAddress || NFT_CONTRACT_ADDRESS,
        });
        const updatedAsset = await updatedAssetRes.json();

        return {
          asset: updatedAsset,
          mode: 'direct' as const,
        };
      }
    },
    onSuccess: (result) => {
      if (result.mode === 'direct') {
        setStep('success');
        setMintedAssetId(result.asset.id);
        queryClient.invalidateQueries({ queryKey: ['/api/assets'] });
        toast({
          title: 'NFT 铸造成功！',
          description: `Token ID: ${result.asset.nftTokenId}`,
        });

        setTimeout(() => {
          setLocation(`/assets/${result.asset.id}`);
        }, 2000);
      } else if (result.mode === 'chainlink') {
        toast({
          title: '验证请求已提交',
          description: 'Chainlink 预言机正在验证您的资产所有权...',
        });
      }
    },
    onError: (error: Error) => {
      setStep('create');
      toast({
        title: '操作失败',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleVerificationComplete = (tokenId: string) => {
    setStep('success');
    toast({
      title: '验证成功！',
      description: `资产已验证并铸造为 NFT，Token ID: ${tokenId}`,
    });

    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['/api/assets'] });
      if (mintedAssetId) {
        setLocation(`/assets/${mintedAssetId}`);
      } else {
        setLocation('/');
      }
    }, 2000);
  };

  if (step === 'processing') {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardContent className="p-12 text-center space-y-4">
            <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" data-testid="loader-processing" />
            <h3 className="text-xl font-semibold">正在处理交易...</h3>
            <p className="text-muted-foreground">
              请在 MetaMask 中确认交易
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'verifying' && verificationRequestId) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardContent className="p-8">
            <div className="text-center space-y-4 mb-8">
              <Clock className="w-12 h-12 mx-auto text-primary animate-pulse" data-testid="icon-verifying" />
              <h3 className="text-xl font-semibold">Chainlink 验证进行中</h3>
              <p className="text-muted-foreground">
                预言机网络正在验证您的资产所有权，这可能需要1-3分钟
              </p>
            </div>
            <VerificationStatus
              requestId={verificationRequestId}
              onVerificationComplete={handleVerificationComplete}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'success' && mintedAssetId) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Card className="border-green-600">
          <CardContent className="p-12 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 mx-auto text-green-600" data-testid="icon-success" />
            <h3 className="text-xl font-semibold">操作成功！</h3>
            <p className="text-muted-foreground">
              正在跳转到资产列表...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">创建收益资产</h1>
        <p className="text-muted-foreground">
          创建一个代表收益生成资产的NFT，然后可以将其分割为ERC-20代币
        </p>
      </div>

      <CreateAssetForm
        onSubmit={async (data) => {
          createMutation.mutate(data);
        }}
        isSubmitting={createMutation.isPending}
      />
    </div>
  );
}
