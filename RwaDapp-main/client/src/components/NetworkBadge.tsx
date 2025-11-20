import { Badge } from '@/components/ui/badge';
import { Circle } from 'lucide-react';

interface NetworkBadgeProps {
  chainId?: number | null;
}

export default function NetworkBadge({ chainId }: NetworkBadgeProps) {
  const getNetworkName = (id?: number | null) => {
    if (!id) return 'Sepolia 测试网';
    
    switch (id) {
      case 11155111:
        return 'Sepolia 测试网';
      case 1:
        return '以太坊主网';
      case 5:
        return 'Goerli 测试网';
      default:
        return `网络 ${id}`;
    }
  };

  const isCorrectNetwork = !chainId || chainId === 11155111;

  return (
    <Badge 
      variant={isCorrectNetwork ? 'secondary' : 'destructive'}
      className="gap-1.5"
      data-testid="badge-network"
    >
      <Circle className="h-2 w-2 fill-current" />
      {getNetworkName(chainId)}
    </Badge>
  );
}
