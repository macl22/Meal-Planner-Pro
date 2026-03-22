import { useState } from "react";
import { useParams, Link } from "wouter";
import { useShoppingList } from "@/hooks/use-weekly-plans";
import { Layout } from "@/components/Layout";
import { LoadingState } from "@/components/ui/LoadingState";
import { ChevronLeft, ShoppingBag, ChevronDown, ChevronUp } from "lucide-react";

interface ShoppingItem {
  ingredientName: string;
  quantity: number | null;
  unit: string | null;
}

type ItemRoute = "got" | "chinese" | "online";

function formatQty(item: ShoppingItem): string {
  if (item.quantity !== null && item.unit) return `${item.quantity} ${item.unit}`;
  if (item.quantity !== null) return `${item.quantity}`;
  if (item.unit) return item.unit;
  return "";
}

function unroute(name: string, prev: Record<string, ItemRoute>): Record<string, ItemRoute> {
  const next = { ...prev };
  delete next[name];
  return next;
}

export default function ShoppingListPage() {
  const params = useParams();
  const planId = parseInt(params.id || "0");
  const { data, isLoading } = useShoppingList(planId);

  const [routes, setRoutes] = useState<Record<string, ItemRoute>>({});
  const [gotExpanded, setGotExpanded] = useState(false);

  const route = (name: string, dest: ItemRoute) =>
    setRoutes(prev => ({ ...prev, [name]: dest }));

  if (isLoading) return <Layout><LoadingState message="Building shopping list..." /></Layout>;

  const items: ShoppingItem[] = data?.items ?? [];

  if (items.length === 0) {
    return (
      <Layout>
        <div className="text-center py-20">
          <p className="text-muted-foreground text-lg">Shopping list is empty.</p>
          <Link href="/" className="text-primary mt-4 inline-block font-semibold">Back to Plan</Link>
        </div>
      </Layout>
    );
  }

  const unrouted = items.filter(i => !routes[i.ingredientName]);
  const got = items.filter(i => routes[i.ingredientName] === "got");
  const chinese = items
    .filter(i => routes[i.ingredientName] === "chinese")
    .sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));
  const online = items
    .filter(i => routes[i.ingredientName] === "online")
    .sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));

  const routedCount = items.length - unrouted.length;

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto pb-20">

        <header>
          <Link href="/" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors font-medium">
            <ChevronLeft className="w-5 h-5 mr-1" /> Back to Plan
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight font-display">Shopping List</h1>
              <p className="text-muted-foreground text-sm mt-0.5">{routedCount} of {items.length} sorted</p>
            </div>
          </div>
        </header>

        {/* To sort */}
        {unrouted.length > 0 ? (
          <section>
            <h2 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground mb-3">To sort</h2>
            <div className="bg-card rounded-3xl border border-border shadow-sm divide-y divide-border/50 overflow-hidden">
              {unrouted.map(item => (
                <div key={item.ingredientName} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-base capitalize">{item.ingredientName}</span>
                    {formatQty(item) && (
                      <span className="text-muted-foreground text-sm ml-2">{formatQty(item)}</span>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => route(item.ingredientName, "got")}
                      className="text-xs px-3 py-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 font-medium transition-colors"
                    >
                      Got it
                    </button>
                    <button
                      onClick={() => route(item.ingredientName, "chinese")}
                      className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/60 font-medium transition-colors"
                    >
                      Chinese
                    </button>
                    <button
                      onClick={() => route(item.ingredientName, "online")}
                      className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-950/60 font-medium transition-colors"
                    >
                      Online
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <p className="text-center text-muted-foreground text-sm py-4">
            All items sorted — see your lists below.
          </p>
        )}

        {/* Already have — collapsed */}
        {got.length > 0 && (
          <section>
            <button
              onClick={() => setGotExpanded(e => !e)}
              className="w-full flex items-center justify-between text-xs font-semibold tracking-wider uppercase text-muted-foreground mb-3 hover:text-foreground transition-colors"
            >
              <span>Already have ({got.length})</span>
              {gotExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {gotExpanded && (
              <div className="bg-card rounded-3xl border border-border shadow-sm divide-y divide-border/50 overflow-hidden opacity-60">
                {got.map(item => (
                  <div key={item.ingredientName} className="flex items-center justify-between px-4 py-3">
                    <span className="font-medium text-base capitalize text-muted-foreground line-through">
                      {item.ingredientName}
                    </span>
                    <button
                      onClick={() => setRoutes(prev => unroute(item.ingredientName, prev))}
                      className="text-xs text-muted-foreground hover:text-foreground ml-4 transition-colors"
                    >
                      undo
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Chinese grocery */}
        {chinese.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground mb-3">Chinese grocery</h2>
            <div className="bg-card rounded-3xl border border-border shadow-sm divide-y divide-border/50 overflow-hidden">
              {chinese.map(item => (
                <div key={item.ingredientName} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <span className="font-medium text-base capitalize">{item.ingredientName}</span>
                    {formatQty(item) && (
                      <span className="text-muted-foreground text-sm ml-2">{formatQty(item)}</span>
                    )}
                  </div>
                  <button
                    onClick={() => setRoutes(prev => unroute(item.ingredientName, prev))}
                    className="text-xs text-muted-foreground hover:text-foreground ml-4 transition-colors"
                  >
                    undo
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Online */}
        {online.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground mb-3">Online</h2>
            <div className="bg-card rounded-3xl border border-border shadow-sm divide-y divide-border/50 overflow-hidden">
              {online.map(item => (
                <div key={item.ingredientName} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <span className="font-medium text-base capitalize">{item.ingredientName}</span>
                    {formatQty(item) && (
                      <span className="text-muted-foreground text-sm ml-2">{formatQty(item)}</span>
                    )}
                  </div>
                  <button
                    onClick={() => setRoutes(prev => unroute(item.ingredientName, prev))}
                    className="text-xs text-muted-foreground hover:text-foreground ml-4 transition-colors"
                  >
                    undo
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </Layout>
  );
}
