import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ExternalLink, Info, CheckCircle2, AlertCircle } from 'lucide-react';

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  link?: string;
  linkText?: string;
}

const setupSteps: ChecklistItem[] = [
  {
    id: 'sepolia-eth',
    label: '获取 Sepolia ETH（至少 0.5 ETH）',
    description: '用于支付 gas 费用',
    link: 'https://sepoliafaucet.com/',
    linkText: '获取 Sepolia ETH'
  },
  {
    id: 'sepolia-link',
    label: '获取 Sepolia LINK（至少 10 LINK）',
    description: '用于 Chainlink 订阅和 Upkeep',
    link: 'https://faucets.chain.link/sepolia',
    linkText: '获取 LINK 代币'
  },
  {
    id: 'metamask',
    label: '配置 MetaMask 到 Sepolia 网络',
    description: 'Chain ID: 11155111',
  },
  {
    id: 'create-subscription',
    label: '创建 Chainlink Functions Subscription',
    description: '在 functions.chain.link 创建新订阅',
    link: 'https://functions.chain.link/sepolia',
    linkText: '创建 Subscription'
  },
  {
    id: 'fund-subscription',
    label: '向 Subscription 充值 5 LINK',
    description: '为订阅提供运行资金',
  },
  {
    id: 'add-consumer',
    label: '添加 ERC20 合约为 Consumer',
    description: '地址：0x69Bc0268dFbC3573eE6e6D92e3E77F6EA1F94a9C',
  },
  {
    id: 'create-upkeep',
    label: '创建 Chainlink Automation Upkeep',
    description: '注册自动收益分配任务',
    link: 'https://automation.chain.link/sepolia',
    linkText: '创建 Upkeep'
  },
  {
    id: 'configure-oracle',
    label: '在应用中配置 Oracle 参数',
    description: '填写 Subscription ID 和其他参数',
  },
  {
    id: 'enable-automation',
    label: '启用自动化',
    description: '激活自动收益获取和分配',
  }
];

export function ChainlinkSetupChecklist() {
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [subscriptionId, setSubscriptionId] = useState('');
  const [upkeepId, setUpkeepId] = useState('');

  const handleToggleStep = (stepId: string) => {
    const newCompleted = new Set(completedSteps);
    if (newCompleted.has(stepId)) {
      newCompleted.delete(stepId);
    } else {
      newCompleted.add(stepId);
    }
    setCompletedSteps(newCompleted);
  };

  const progress = Math.round((completedSteps.size / setupSteps.length) * 100);
  const isComplete = completedSteps.size === setupSteps.length;

  return (
    <Card className="w-full" data-testid="card-chainlink-setup">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Chainlink 自动化配置检查清单
        </CardTitle>
        <CardDescription>
          按照以下步骤配置 Chainlink Functions 和 Automation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 进度条 */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>配置进度</span>
            <span className="font-medium">{progress}%</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* 检查清单 */}
        <div className="space-y-3">
          {setupSteps.map((step) => (
            <div
              key={step.id}
              className="flex items-start space-x-3 p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
              data-testid={`checkbox-step-${step.id}`}
            >
              <Checkbox
                id={step.id}
                checked={completedSteps.has(step.id)}
                onCheckedChange={() => handleToggleStep(step.id)}
                className="mt-0.5"
                data-testid={`checkbox-${step.id}`}
              />
              <div className="flex-1 space-y-1">
                <label
                  htmlFor={step.id}
                  className={`text-sm font-medium cursor-pointer ${
                    completedSteps.has(step.id) ? 'line-through opacity-60' : ''
                  }`}
                >
                  {step.label}
                </label>
                <p className="text-xs text-muted-foreground">
                  {step.description}
                </p>
                {step.link && (
                  <a
                    href={step.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    data-testid={`link-${step.id}`}
                  >
                    <ExternalLink className="h-3 w-3" />
                    {step.linkText}
                  </a>
                )}
              </div>
              {completedSteps.has(step.id) && (
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
              )}
            </div>
          ))}
        </div>

        {/* ID 记录区域 */}
        <div className="space-y-3 pt-4 border-t">
          <h4 className="text-sm font-medium">重要 ID 记录</h4>
          <div className="grid gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Subscription ID</label>
              <input
                type="text"
                value={subscriptionId}
                onChange={(e) => setSubscriptionId(e.target.value)}
                placeholder="输入你的 Subscription ID"
                className="w-full px-3 py-1.5 text-sm border rounded-md bg-background"
                data-testid="input-subscription-id"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Upkeep ID</label>
              <input
                type="text"
                value={upkeepId}
                onChange={(e) => setUpkeepId(e.target.value)}
                placeholder="输入你的 Upkeep ID"
                className="w-full px-3 py-1.5 text-sm border rounded-md bg-background"
                data-testid="input-upkeep-id"
              />
            </div>
          </div>
        </div>

        {/* 提示信息 */}
        <Alert className={isComplete ? 'border-green-500' : ''}>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {isComplete ? (
              <span className="text-green-600 font-medium">
                🎉 恭喜！所有配置步骤已完成。现在可以在资产详情页测试自动化功能。
              </span>
            ) : (
              <span>
                完成所有步骤后，你的资产将能够自动获取收益数据并分配给代币持有者。
                确保记录好 Subscription ID 和 Upkeep ID。
              </span>
            )}
          </AlertDescription>
        </Alert>

        {/* 查看文档按钮 */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            asChild
            data-testid="button-view-docs"
          >
            <a href="/docs/chainlink-setup-guide.md" target="_blank">
              <ExternalLink className="h-4 w-4 mr-2" />
              查看完整配置文档
            </a>
          </Button>
          {isComplete && (
            <Button
              size="sm"
              onClick={() => window.location.href = '/assets/d3862b35-7167-4c89-9c59-5b78be97d894'}
              data-testid="button-goto-asset"
            >
              前往配置 999 资产
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}