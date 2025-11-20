import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface ValidationIssue {
  assetId: string;
  assetName: string;
  issue: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface ValidationResult {
  totalAssets: number;
  issuesFound: number;
  issues: ValidationIssue[];
}

interface RepairResult {
  totalChecked: number;
  totalRepaired: number;
  repaired: Array<{
    assetId: string;
    assetName: string;
    changes: string[];
  }>;
}

export default function SystemAdminPage() {
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [repairResult, setRepairResult] = useState<RepairResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const { toast } = useToast();

  const handleValidate = async () => {
    setIsValidating(true);
    setValidationResult(null);
    setRepairResult(null);
    
    try {
      const res = await apiRequest('POST', '/api/system/validate-data');
      const result = await res.json() as ValidationResult;
      setValidationResult(result);
      
      if (result.issuesFound === 0) {
        toast({
          title: '验证完成',
          description: '所有数据一致，未发现问题',
        });
      } else {
        toast({
          title: '发现数据问题',
          description: `发现 ${result.issuesFound} 个问题`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: '验证失败',
        description: (error as Error).message || '无法验证数据',
        variant: 'destructive',
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleRepair = async () => {
    setIsRepairing(true);
    setRepairResult(null);
    
    try {
      const res = await apiRequest('POST', '/api/system/repair-data');
      const result = await res.json() as RepairResult;
      setRepairResult(result);
      
      if (result.totalRepaired === 0) {
        toast({
          title: '修复完成',
          description: '无需修复任何数据',
        });
      } else {
        toast({
          title: '修复完成',
          description: `成功修复 ${result.totalRepaired} 个资产`,
        });
      }
      
      // Clear validation result after repair
      setValidationResult(null);
    } catch (error) {
      toast({
        title: '修复失败',
        description: (error as Error).message || '无法修复数据',
        variant: 'destructive',
      });
    } finally {
      setIsRepairing(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500';
      case 'high':
        return 'bg-orange-500';
      case 'medium':
        return 'bg-yellow-500';
      default:
        return 'bg-blue-500';
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">系统管理</h1>
          <p className="text-muted-foreground">
            验证和修复区块链数据与本地数据库的一致性
          </p>
        </div>

        <Card data-testid="card-data-validation">
          <CardHeader>
            <CardTitle>数据验证与修复</CardTitle>
            <CardDescription>
              检查本地数据库与区块链状态是否一致，并自动修复不一致的数据
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Button 
                onClick={handleValidate} 
                disabled={isValidating || isRepairing}
                data-testid="button-validate"
              >
                {isValidating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                验证数据
              </Button>
              <Button 
                onClick={handleRepair} 
                disabled={isRepairing || isValidating}
                variant="secondary"
                data-testid="button-repair"
              >
                {isRepairing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                自动修复
              </Button>
            </div>

            {validationResult && (
              <Alert 
                variant={validationResult.issuesFound > 0 ? 'destructive' : 'default'}
                data-testid="alert-validation-result"
              >
                {validationResult.issuesFound > 0 ? (
                  <AlertCircle className="h-4 w-4" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                <AlertTitle>验证结果</AlertTitle>
                <AlertDescription>
                  检查了 {validationResult.totalAssets} 个资产，
                  发现 {validationResult.issuesFound} 个问题
                </AlertDescription>
              </Alert>
            )}

            {validationResult && validationResult.issues.length > 0 && (
              <div className="space-y-3" data-testid="list-validation-issues">
                <h3 className="font-semibold">发现的问题：</h3>
                {validationResult.issues.map((issue, index) => (
                  <Card key={index} data-testid={`issue-${index}`}>
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <Badge className={getSeverityColor(issue.severity)}>
                          {issue.severity}
                        </Badge>
                        <div className="flex-1">
                          <p className="font-medium" data-testid="text-asset-name">
                            {issue.assetName} (ID: {issue.assetId})
                          </p>
                          <p className="text-sm text-muted-foreground" data-testid="text-issue-description">
                            {issue.issue}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {repairResult && (
              <Alert data-testid="alert-repair-result">
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>修复结果</AlertTitle>
                <AlertDescription>
                  检查了 {repairResult.totalChecked} 个资产，
                  修复了 {repairResult.totalRepaired} 个资产
                </AlertDescription>
              </Alert>
            )}

            {repairResult && repairResult.repaired.length > 0 && (
              <div className="space-y-3" data-testid="list-repair-results">
                <h3 className="font-semibold">修复的资产：</h3>
                {repairResult.repaired.map((item, index) => (
                  <Card key={index} data-testid={`repair-${index}`}>
                    <CardContent className="pt-6">
                      <p className="font-medium mb-2" data-testid="text-repaired-asset">
                        {item.assetName} (ID: {item.assetId})
                      </p>
                      <ul className="list-disc list-inside space-y-1">
                        {item.changes.map((change, changeIndex) => (
                          <li key={changeIndex} className="text-sm text-muted-foreground" data-testid="text-change">
                            {change}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>使用说明</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              <strong>验证数据：</strong>检查本地数据库中的所有资产数据是否与区块链状态一致，
              包括代币总量、已售代币数量、代币价格等。
            </p>
            <p>
              <strong>自动修复：</strong>从区块链获取最新数据，自动更新本地数据库中不一致的字段。
              修复过程安全，不会修改区块链数据。
            </p>
            <p className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>
                建议在应用启动后或怀疑数据不一致时运行验证和修复。
              </span>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
