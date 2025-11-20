import { ChainlinkSetupChecklist } from '@/components/ChainlinkSetupChecklist';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';

export default function ChainlinkSetup() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <Link href="/assets">
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回资产列表
          </Button>
        </Link>
      </div>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            Chainlink 自动化配置
          </h1>
          <p className="text-muted-foreground mt-2" data-testid="text-page-description">
            配置 Chainlink Functions 和 Automation 以启用自动收益获取和分配功能
          </p>
        </div>

        <ChainlinkSetupChecklist />

        <div className="p-4 bg-muted rounded-lg space-y-3">
          <h3 className="font-medium text-sm">快速参考</h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              <strong>目标资产：</strong>999 (smt999)
            </p>
            <p>
              <strong>ERC20 合约：</strong>
              <code className="text-xs bg-background px-1 py-0.5 rounded">
                0x69Bc0268dFbC3573eE6e6D92e3E77F6EA1F94a9C
              </code>
            </p>
            <p>
              <strong>DON ID：</strong>
              <code className="text-xs bg-background px-1 py-0.5 rounded">
                fun-ethereum-sepolia-1
              </code>
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            asChild
            data-testid="button-view-asset"
          >
            <a 
              href="https://sepolia.etherscan.io/address/0x69Bc0268dFbC3573eE6e6D92e3E77F6EA1F94a9C" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              在 Etherscan 查看合约
            </a>
          </Button>
          <Button
            asChild
            data-testid="button-configure-asset"
          >
            <Link href="/assets/d3862b35-7167-4c89-9c59-5b78be97d894">
              配置 999 资产
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}