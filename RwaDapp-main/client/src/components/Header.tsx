import { Link, useLocation } from 'wouter';
import WalletButton from './WalletButton';
import ThemeToggle from './ThemeToggle';
import NetworkBadge from './NetworkBadge';
import { useWallet } from '@/lib/web3';

export default function Header() {
  const [location] = useLocation();
  const { chainId } = useWallet();

  const navItems = [
    { path: '/', label: '首页' },
    { path: '/assets', label: '浏览资产' },
    { path: '/create', label: '创建资产' },
    { path: '/my-tokens', label: '我的代币' },
    { path: '/admin', label: '系统管理' },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" data-testid="link-home">
            <div className="font-mono text-xl font-bold cursor-pointer hover-elevate px-3 py-1 rounded-md">
              RevShare
            </div>
          </Link>
          
          <nav className="hidden md:flex items-center gap-2">
            {navItems.map((item) => (
              <Link key={item.path} href={item.path}>
                <div
                  className={`px-3 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors ${
                    location === item.path
                      ? 'bg-accent text-accent-foreground'
                      : 'hover-elevate'
                  }`}
                  data-testid={`link-${item.label}`}
                >
                  {item.label}
                </div>
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <NetworkBadge chainId={chainId} />
          <WalletButton />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
