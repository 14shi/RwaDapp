import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import AssetCard from "@/components/AssetCard";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import type { RevenueAsset } from "@shared/schema";

export default function AllAssetsPage() {
  const [, navigate] = useLocation();
  
  const { data: assets, isLoading } = useQuery<RevenueAsset[]>({
    queryKey: ['/api/assets'],
  });

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-4xl font-bold">所有资产</h1>
            <p className="text-muted-foreground mt-2">
              浏览所有可投资的收益资产
            </p>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          共 {assets?.length || 0} 个资产
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="h-96 animate-pulse">
              <div className="h-full bg-muted" />
            </Card>
          ))}
        </div>
      ) : assets && assets.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {assets.map((asset) => (
            <AssetCard 
              key={asset.id} 
              asset={asset} 
              onClick={() => navigate(`/assets/${asset.id}`)} 
            />
          ))}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground mb-4">
            还没有资产，创建第一个收益资产吧！
          </p>
          <Link href="/create">
            <Button data-testid="button-create-first">
              创建资产
            </Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
