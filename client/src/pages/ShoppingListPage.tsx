import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useShoppingList } from "@/hooks/use-weekly-plans";
import { Layout } from "@/components/Layout";
import { LoadingState } from "@/components/ui/LoadingState";
import { CheckCircle2, Circle, ChevronLeft, ShoppingBag, Leaf } from "lucide-react";

export default function ShoppingListPage() {
  const params = useParams();
  const planId = parseInt(params.id || "0");
  const { data: list, isLoading } = useShoppingList(planId);
  
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  // Auto-check staple items once list loads
  useEffect(() => {
    if (!list) return;
    const initial: Record<string, boolean> = {};
    Object.entries(list).forEach(([category, items]: [string, any]) => {
      items.forEach((item: any, i: number) => {
        const key = `${category}-${i}`;
        if (item.isStaple) initial[key] = true;
      });
    });
    setCheckedItems(initial);
  }, [list]);

  const toggleItem = (key: string) => {
    setCheckedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (isLoading) return <Layout><LoadingState message="Generating shopping list..." /></Layout>;

  if (!list || Object.keys(list).length === 0) {
    return (
      <Layout>
        <div className="text-center py-20">
          <p className="text-muted-foreground text-lg">Shopping list is empty or could not be generated.</p>
          <Link href="/" className="text-primary mt-4 inline-block font-semibold">Back to Plan</Link>
        </div>
      </Layout>
    );
  }

  const totalItems = Object.values(list).reduce((sum: number, items: any) => sum + items.length, 0);
  const checkedCount = Object.values(checkedItems).filter(Boolean).length;

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto pb-20">
        <header>
          <Link href="/" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors font-medium">
            <ChevronLeft className="w-5 h-5 mr-1" /> Back to Plan
          </Link>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-4xl font-extrabold tracking-tight font-display">Shopping List</h1>
                <p className="text-muted-foreground text-sm mt-0.5">{checkedCount} of {totalItems} items checked</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground bg-muted/50 rounded-xl px-3 py-2">
            <Leaf className="w-3.5 h-3.5 text-green-500 shrink-0" />
            <span>Items you likely already have are pre-checked. Uncheck anything you need to buy.</span>
          </div>
        </header>

        <div className="space-y-6">
          {Object.entries(list).map(([category, items]: [string, any]) => {
            const sortedItems = [...items].sort((a: any, b: any) => {
              const aChecked = checkedItems[`${category}-${items.indexOf(a)}`] ? 1 : 0;
              const bChecked = checkedItems[`${category}-${items.indexOf(b)}`] ? 1 : 0;
              return aChecked - bChecked;
            });

            return (
              <div key={category} className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden">
                <div className="bg-muted/50 px-5 py-3 border-b border-border flex items-center justify-between">
                  <h3 className="font-bold text-sm tracking-wider uppercase text-muted-foreground">{category}</h3>
                  <span className="text-xs text-muted-foreground">
                    {items.filter((_: any, i: number) => !checkedItems[`${category}-${i}`]).length} to buy
                  </span>
                </div>
                <div className="divide-y divide-border/50">
                  {sortedItems.map((item: any) => {
                    const origIdx = items.indexOf(item);
                    const key = `${category}-${origIdx}`;
                    const isChecked = checkedItems[key] ?? false;
                    
                    return (
                      <div 
                        key={key}
                        onClick={() => toggleItem(key)}
                        data-testid={`shopping-item-${key}`}
                        className={`flex items-center gap-4 p-4 cursor-pointer transition-colors ${
                          isChecked ? 'bg-muted/20 hover:bg-muted/30' : 'hover:bg-secondary/30'
                        }`}
                      >
                        <div className={`shrink-0 transition-colors ${isChecked ? 'text-green-500' : 'text-muted-foreground/40'}`}>
                          {isChecked ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                        </div>
                        <div className={`flex-1 min-w-0 transition-all ${isChecked ? 'opacity-40 line-through' : ''}`}>
                          <p className="font-medium text-base capitalize">{item.item || item.raw}</p>
                          {item.isStaple && !isChecked && (
                            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 mt-0.5">
                              <Leaf className="w-3 h-3" /> Pantry staple
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
