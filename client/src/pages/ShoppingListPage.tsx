import { useState } from "react";
import { useParams, Link } from "wouter";
import { useShoppingList } from "@/hooks/use-weekly-plans";
import { Layout } from "@/components/Layout";
import { LoadingState } from "@/components/ui/LoadingState";
import { CheckCircle2, Circle, ChevronLeft, ShoppingBag } from "lucide-react";
import { motion } from "framer-motion";

export default function ShoppingListPage() {
  const params = useParams();
  const planId = parseInt(params.id || "0");
  const { data: list, isLoading } = useShoppingList(planId);
  
  // Local state for checked items (in a real app, might sync to DB)
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

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

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto">
        <header>
          <Link href="/" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors font-medium">
            <ChevronLeft className="w-5 h-5 mr-1" /> Back to Plan
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight font-display">Shopping List</h1>
          </div>
        </header>

        <div className="space-y-6">
          {Object.entries(list).map(([category, items]: [string, any]) => (
            <div key={category} className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden">
              <div className="bg-muted/50 px-5 py-3 border-b border-border">
                <h3 className="font-bold text-sm tracking-wider uppercase text-muted-foreground">{category}</h3>
              </div>
              <div className="divide-y divide-border/50">
                {items.map((item: any, i: number) => {
                  const key = `${category}-${i}`;
                  const isChecked = checkedItems[key];
                  
                  return (
                    <div 
                      key={i} 
                      onClick={() => toggleItem(key)}
                      className="flex items-center gap-4 p-4 hover:bg-secondary/30 cursor-pointer transition-colors"
                    >
                      <div className={`shrink-0 transition-colors ${isChecked ? 'text-primary' : 'text-muted-foreground/40'}`}>
                        {isChecked ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                      </div>
                      <div className={`flex-1 min-w-0 transition-all ${isChecked ? 'opacity-50 line-through' : ''}`}>
                        <p className="font-medium text-lg capitalize">{item.ingredient_name_normalized || item.raw}</p>
                        {(item.quantity || item.unit) && (
                          <p className="text-sm text-muted-foreground">
                            {item.quantity} {item.unit}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
