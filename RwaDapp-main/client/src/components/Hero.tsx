import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Link } from 'wouter';
import heroImage from '@assets/generated_images/Hero_abstract_artwork_45cf7ad6.png';

export default function Hero() {
  return (
    <div className="relative w-full h-[70vh] min-h-[500px] overflow-hidden">
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${heroImage})` }}
      />
      
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/30" />
      
      <div className="relative h-full max-w-7xl mx-auto px-6 flex items-center">
        <div className="max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/20 backdrop-blur-sm border border-primary/30">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
            <span className="text-sm font-medium text-primary-foreground">基于区块链的 RWA 平台</span>
          </div>
          
          <h1 className="font-mono text-5xl md:text-6xl font-bold text-white leading-tight">
            将艺术品转化为
            <br />
            数字资产
          </h1>
          
          <p className="text-xl text-white/90 max-w-2xl">
            ArtChain 让您轻松将实体艺术品代币化为 NFT，
            在以太坊区块链上实现所有权的透明管理和追踪
          </p>
          
          <div className="flex flex-wrap gap-4 pt-4">
            <Link href="/gallery">
              <Button 
                size="lg" 
                className="bg-primary/90 backdrop-blur-sm hover:bg-primary border border-primary-border"
                data-testid="button-browse-art"
              >
                浏览艺术品
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            
            <Link href="/mint">
              <Button 
                size="lg" 
                variant="outline"
                className="bg-background/10 backdrop-blur-sm border-white/30 text-white hover:bg-background/20"
                data-testid="button-tokenize"
              >
                代币化您的艺术品
              </Button>
            </Link>
          </div>
          
          <div className="flex items-center gap-8 pt-8">
            <div>
              <div className="text-3xl font-bold text-white font-mono">128</div>
              <div className="text-sm text-white/70">已铸造艺术品</div>
            </div>
            <div className="h-12 w-px bg-white/20" />
            <div>
              <div className="text-3xl font-bold text-white font-mono">45</div>
              <div className="text-sm text-white/70">活跃艺术家</div>
            </div>
            <div className="h-12 w-px bg-white/20" />
            <div>
              <div className="text-3xl font-bold text-white font-mono">$2.4M</div>
              <div className="text-sm text-white/70">总估值</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
