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
import { Loader2, ShoppingCart } from 'lucide-react';
import { parseTokenAmount, formatTokenAmount } from '@/lib/tokenUnits';
import type { RevenueAsset } from '@shared/schema';

const formSchema = z.object({
  tokenAmount: z.coerce.number().min(1, '购买数量必须大于0'),
});

type FormData = z.infer<typeof formSchema>;

interface TokenPurchaseFormProps {
  asset: RevenueAsset;
  onSubmit: (data: FormData) => Promise<void>;
  isSubmitting: boolean;
}

export default function TokenPurchaseForm({ asset, onSubmit, isSubmitting }: TokenPurchaseFormProps) {
  const totalSupply = parseTokenAmount(asset.totalTokenSupply);
  const tokensSold = parseTokenAmount(asset.tokensSold);
  const availableTokens = totalSupply - tokensSold;
  const pricePerToken = parseFloat(asset.pricePerToken || "0");

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tokenAmount: 100,
    },
  });

  const watchedAmount = form.watch('tokenAmount');
  const totalCost = watchedAmount * pricePerToken;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5" />
          购买代币
        </CardTitle>
        <CardDescription>
          购买 {asset.erc20TokenSymbol} 代币以获得收益分配权
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 mb-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">代币符号</div>
              <div className="font-medium text-lg">{asset.erc20TokenSymbol}</div>
            </div>
            <div>
              <div className="text-muted-foreground">每代币价格</div>
              <div className="font-medium text-lg">{pricePerToken} ETH</div>
            </div>
            <div>
              <div className="text-muted-foreground">可购买数量</div>
              <div className="font-medium text-lg">{availableTokens}</div>
            </div>
            <div>
              <div className="text-muted-foreground">已售出</div>
              <div className="font-medium text-lg">
                {formatTokenAmount(asset.tokensSold, 0)} / {formatTokenAmount(asset.totalTokenSupply, 0)}
              </div>
            </div>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="tokenAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>购买数量</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      data-testid="input-token-amount"
                      max={availableTokens}
                    />
                  </FormControl>
                  <FormDescription>
                    最多可购买 {availableTokens} 个代币
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="bg-primary/10 border border-primary/20 p-4 rounded-md space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">购买数量:</span>
                <span className="font-medium">{watchedAmount} {asset.erc20TokenSymbol}</span>
              </div>
              <div className="flex justify-between text-lg font-bold">
                <span>总计:</span>
                <span data-testid="text-total-cost">{totalCost.toFixed(4)} ETH</span>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isSubmitting || availableTokens === 0}
              data-testid="button-purchase-tokens"
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {availableTokens === 0 ? '已售罄' : '购买代币'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
