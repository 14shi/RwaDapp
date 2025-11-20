import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { insertRevenueAssetSchema } from '@shared/schema';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Shield, Zap, Info } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const formSchema = z.object({
  name: z.string().min(1, '请输入资产名称'),
  description: z.string().min(10, '描述至少需要10个字符'),
  assetType: z.string().min(1, '请选择资产类型'),
  imageUrl: z.string().url('请输入有效的图片URL'),
  estimatedValue: z.coerce.number().min(0.01, '估值必须大于0'),
  verificationMode: z.enum(['direct', 'chainlink']).default('direct'),
  externalId: z.string().optional(),
  ownerProof: z.string().optional(),
}).refine((data) => {
  if (data.verificationMode === 'chainlink') {
    return data.externalId && data.externalId.length > 0 && data.ownerProof && data.ownerProof.length > 0;
  }
  return true;
}, {
  message: '使用 Chainlink 验证时，必须提供外部资产ID和所有权证明',
  path: ['externalId'],
});

type FormData = z.infer<typeof formSchema>;

interface CreateAssetFormProps {
  onSubmit: (data: FormData) => Promise<void>;
  isSubmitting: boolean;
}

export default function CreateAssetForm({ onSubmit, isSubmitting }: CreateAssetFormProps) {
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      assetType: 'song',
      imageUrl: '',
      estimatedValue: 0,
      verificationMode: 'direct',
      externalId: '',
      ownerProof: '',
    },
  });

  const verificationMode = form.watch('verificationMode');
  const assetType = form.watch('assetType');

  const getPlaceholderText = (type: string) => {
    switch (type) {
      case 'song':
        return {
          externalId: 'Spotify Track ID (例如: 3n3Ppam7vgaVa1iaRUc9Lp)',
          ownerProof: 'Spotify Artist ID 或 Artist URI',
        };
      case 'patent':
        return {
          externalId: 'USPTO专利号 (例如: US10123456B2)',
          ownerProof: '专利持有人姓名或企业名称',
        };
      case 'gpu':
        return {
          externalId: 'GPU序列号或设备ID',
          ownerProof: '设备所有权证明URL或Hash',
        };
      default:
        return {
          externalId: '外部资产ID',
          ownerProof: '所有权证明',
        };
    }
  };

  const placeholders = getPlaceholderText(assetType);

  return (
    <Card>
      <CardHeader>
        <CardTitle>创建收益资产</CardTitle>
        <CardDescription>
          创建一个代表收益生成资产的NFT（如歌曲、GPU等）
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>资产名称</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="例如: 流行歌曲 - 夏日回忆" 
                      {...field}
                      data-testid="input-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="verificationMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>验证模式</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-verification-mode">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="direct" data-testid="option-direct">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4" />
                          <span>直接铸造</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="chainlink" data-testid="option-chainlink">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4" />
                          <span>Chainlink 预言机验证</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {verificationMode === 'direct' 
                      ? '立即铸造NFT（无需外部验证）' 
                      : '使用 Chainlink Functions 验证资产所有权（需提供外部ID和证明）'
                    }
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {verificationMode === 'chainlink' && (
              <Alert data-testid="alert-chainlink-info">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Chainlink 验证将调用去中心化预言机网络验证您对 Spotify 歌曲、USPTO 专利或 GPU 设备的所有权。验证可能需要1-3分钟。
                </AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="assetType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>资产类型</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-asset-type">
                        <SelectValue placeholder="选择资产类型" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="song" data-testid="option-song">歌曲 (Spotify)</SelectItem>
                      <SelectItem value="patent" data-testid="option-patent">专利 (USPTO)</SelectItem>
                      <SelectItem value="gpu" data-testid="option-gpu">GPU算力</SelectItem>
                      <SelectItem value="other" data-testid="option-other">其他</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    选择能够产生持续收益的资产类型
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>资产描述</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="详细描述您的资产，包括收益来源、预期收益等信息..."
                      className="min-h-32 resize-none"
                      {...field}
                      data-testid="input-description"
                    />
                  </FormControl>
                  <FormDescription>
                    至少10个字符
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="imageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>图片URL</FormLabel>
                  <FormControl>
                    <Input
                      type="url"
                      placeholder="https://example.com/image.jpg"
                      {...field}
                      data-testid="input-image-url"
                    />
                  </FormControl>
                  <FormDescription>
                    提供一个代表您资产的图片链接
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="estimatedValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>估值 (ETH)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="10"
                      {...field}
                      data-testid="input-estimated-value"
                    />
                  </FormControl>
                  <FormDescription>
                    您对此资产的估值（以ETH计）
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {verificationMode === 'chainlink' && (
              <>
                <FormField
                  control={form.control}
                  name="externalId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>外部资产 ID</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={placeholders.externalId}
                          {...field}
                          data-testid="input-external-id"
                        />
                      </FormControl>
                      <FormDescription>
                        {assetType === 'song' && 'Spotify Track ID，可从歌曲链接中获取'}
                        {assetType === 'patent' && 'USPTO 专利号，格式如 US10123456B2'}
                        {assetType === 'gpu' && 'GPU 设备的唯一序列号或标识符'}
                        {assetType === 'other' && '您的资产在外部系统中的唯一标识符'}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="ownerProof"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>所有权证明</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={placeholders.ownerProof}
                          {...field}
                          data-testid="input-owner-proof"
                        />
                      </FormControl>
                      <FormDescription>
                        {assetType === 'song' && '您的 Spotify Artist ID 或 Artist URI'}
                        {assetType === 'patent' && '专利文件中登记的持有人姓名或企业名称'}
                        {assetType === 'gpu' && '设备所有权证明文件的URL或Hash值'}
                        {assetType === 'other' && '能够证明您拥有此资产的凭证'}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isSubmitting}
              data-testid="button-create-asset"
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {verificationMode === 'chainlink' ? '提交验证请求' : '创建资产'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
