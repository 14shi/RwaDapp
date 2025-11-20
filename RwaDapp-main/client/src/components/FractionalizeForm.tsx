import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Coins } from 'lucide-react';

const formSchema = z.object({
  erc20TokenName: z.string().min(3, '代币名称至少3个字符'),
  erc20TokenSymbol: z.string().min(2, '代币符号至少2个字符').max(10, '代币符号最多10个字符'),
  totalTokenSupply: z.coerce.number().min(1, '总供应量必须大于0'),
  pricePerToken: z.coerce.number().min(0.0001, '代币价格必须大于0'),
});

type FormData = z.infer<typeof formSchema>;

interface FractionalizeFormProps {
  assetName: string;
  onSubmit: (data: FormData) => Promise<void>;
  isSubmitting: boolean;
}

export default function FractionalizeForm({ assetName, onSubmit, isSubmitting }: FractionalizeFormProps) {
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      erc20TokenName: `${assetName} Token`,
      erc20TokenSymbol: '',
      totalTokenSupply: 10000,
      pricePerToken: 0.001,
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="w-5 h-5" />
          分割化资产
        </CardTitle>
        <CardDescription>
          将NFT分割为ERC-20代币，允许多个投资者共同拥有收益权
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="erc20TokenName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>代币名称</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="例如: Summer Memories Token" 
                      {...field}
                      data-testid="input-token-name"
                    />
                  </FormControl>
                  <FormDescription>
                    ERC-20代币的完整名称
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="erc20TokenSymbol"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>代币符号</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="例如: SMT" 
                      {...field}
                      data-testid="input-token-symbol"
                      className="uppercase"
                    />
                  </FormControl>
                  <FormDescription>
                    2-10个字符的代币简称（通常使用大写字母）
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="totalTokenSupply"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>总供应量</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      data-testid="input-total-supply"
                    />
                  </FormControl>
                  <FormDescription>
                    将要铸造的ERC-20代币总数量
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="pricePerToken"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>每代币价格 (ETH)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.0001"
                      {...field}
                      data-testid="input-price-per-token"
                    />
                  </FormControl>
                  <FormDescription>
                    投资者购买每个代币需要支付的ETH价格
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="bg-muted p-4 rounded-md space-y-2">
              <div className="flex justify-between text-sm">
                <span>估值总额:</span>
                <span className="font-medium">
                  {(form.watch('totalTokenSupply') * form.watch('pricePerToken')).toFixed(4)} ETH
                </span>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isSubmitting}
              data-testid="button-fractionalize"
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              分割化资产
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
