import { Link, useLocation } from "wouter";
import { Utensils, BookOpen, ShoppingCart, ShoppingBag, Box, Compass } from "lucide-react";
import { motion } from "framer-motion";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-card shadow-sm z-10 sticky top-0 h-screen">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2 font-display">
            <Utensils className="w-6 h-6" /> Platter
          </h1>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          <DesktopNavItem href="/" icon={<Utensils />} label="Weekly Plan" />
          <DesktopNavItem href="/recipes" icon={<BookOpen />} label="Recipes" />
          <DesktopNavItem href="/pantry" icon={<Box />} label="Pantry" />
          <DesktopNavItem href="/shopping-list" icon={<ShoppingCart />} label="Shopping List" />
          <DesktopNavItem href="/discover" icon={<Compass />} label="Discover" />
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-x-hidden pb-[80px] md:pb-0">
        <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>

      {/* Bottom Nav for Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card/80 backdrop-blur-xl border-t border-border z-50 px-6 py-4 pb-safe flex justify-between items-center shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
        <MobileNavItem href="/" icon={<Utensils />} label="Plan" />
        <MobileNavItem href="/recipes" icon={<BookOpen />} label="Recipes" />
        <MobileNavItem href="/pantry" icon={<Box />} label="Pantry" />
        <MobileNavItem href="/shopping-list" icon={<ShoppingCart />} label="Shopping" />
        <MobileNavItem href="/discover" icon={<Compass />} label="Discover" />
      </nav>
    </div>
  );
}

function DesktopNavItem({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  const [location] = useLocation();
  const isActive = location === href || (href !== "/" && location.startsWith(href));

  return (
    <Link 
      href={href} 
      className={`
        flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium
        ${isActive 
          ? "bg-primary/10 text-primary" 
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        }
      `}
    >
      <div className="w-5 h-5 flex items-center justify-center">{icon}</div>
      {label}
    </Link>
  );
}

function MobileNavItem({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  const [location] = useLocation();
  const isActive = location === href || (href !== "/" && location.startsWith(href));

  return (
    <Link href={href} className="relative flex flex-col items-center gap-1 min-w-[64px]">
      <div className={`
        relative flex items-center justify-center w-12 h-12 rounded-full transition-colors duration-300
        ${isActive ? "text-primary" : "text-muted-foreground"}
      `}>
        {isActive && (
          <motion.div 
            layoutId="mobile-nav-bubble"
            className="absolute inset-0 bg-primary/15 rounded-full"
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          />
        )}
        <div className="relative z-10 w-6 h-6 flex items-center justify-center">{icon}</div>
      </div>
      <span className={`text-[10px] font-medium transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}>
        {label}
      </span>
    </Link>
  );
}
