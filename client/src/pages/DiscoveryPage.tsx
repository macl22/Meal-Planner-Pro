import { useRecipes, useUpdateRecipe, useDeleteRecipe, useDiscoverRecipes } from "@/hooks/use-recipes";
import { Layout } from "@/components/Layout";
import { LoadingState } from "@/components/ui/LoadingState";
import { Check, X, Sparkles, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function DiscoveryPage() {
  const { data: recipes, isLoading } = useRecipes({ isApproved: false });
  const updateMutation = useUpdateRecipe();
  const deleteMutation = useDeleteRecipe();
  const discoverMutation = useDiscoverRecipes();

  const handleApprove = (id: number) => {
    updateMutation.mutate({ id, updates: { isApproved: true } });
  };

  const handleReject = (id: number) => {
    deleteMutation.mutate(id);
  };

  const handleDiscoverMore = () => {
    discoverMutation.mutate();
  };

  if (isLoading) return <Layout><LoadingState message="Finding new recipes..." /></Layout>;

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <header className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight font-display mb-2 flex items-center gap-3">
              Discover <Sparkles className="w-8 h-8 text-accent" />
            </h1>
            <p className="text-muted-foreground text-lg">AI suggestions based on your pantry</p>
          </div>
          <button 
            onClick={handleDiscoverMore}
            disabled={discoverMutation.isPending}
            className="bg-accent/10 text-accent hover:bg-accent/20 px-5 py-3 rounded-2xl font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {discoverMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Find More'}
          </button>
        </header>

        {!recipes || recipes.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-3xl border border-dashed border-border shadow-sm">
            <Sparkles className="w-12 h-12 mx-auto mb-4 text-accent/50" />
            <h3 className="text-xl font-bold font-display mb-2">No new suggestions</h3>
            <p className="text-muted-foreground mb-6">You've reviewed all suggested recipes.</p>
            <button 
              onClick={handleDiscoverMore}
              className="bg-accent text-accent-foreground px-6 py-3 rounded-xl font-bold shadow-lg shadow-accent/25 hover:-translate-y-0.5 transition-all"
            >
              Generate Suggestions
            </button>
          </div>
        ) : (
          <div className="grid gap-8">
            <AnimatePresence>
              {recipes.map((recipe: any) => (
                <motion.div
                  key={recipe.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className="bg-card rounded-3xl border border-border shadow-ios overflow-hidden"
                >
                  <div className="p-6 sm:p-8">
                    <div className="flex items-start justify-between gap-6 mb-6">
                      <div>
                        <h2 className="text-2xl font-bold font-display leading-tight mb-2">{recipe.title}</h2>
                        <div className="inline-block bg-accent/10 text-accent font-medium text-sm px-3 py-1 rounded-full mb-4">
                          Score: {recipe.discoveryScore || 85}% Match
                        </div>
                        <p className="text-muted-foreground italic text-lg border-l-4 border-accent/30 pl-4 py-1">
                          "{recipe.discoveryReason || 'Great match for ingredients you already have.'}"
                        </p>
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-6 mt-6 pt-6 border-t border-border/50">
                      <div>
                        <h4 className="font-bold mb-3 text-sm uppercase tracking-wider text-muted-foreground">Ingredients</h4>
                        <ul className="space-y-2">
                          {recipe.ingredients?.slice(0, 5).map((ing: any, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary/50 mt-1.5 shrink-0" />
                              <span className="capitalize">{ing.ingredient_name_raw || ing.raw}</span>
                            </li>
                          ))}
                          {recipe.ingredients?.length > 5 && (
                            <li className="text-sm text-muted-foreground italic pl-3">+ {recipe.ingredients.length - 5} more</li>
                          )}
                        </ul>
                      </div>
                      <div className="flex flex-col justify-end gap-3 sm:items-end">
                        <button 
                          onClick={() => handleApprove(recipe.id)}
                          className="w-full sm:w-48 active-elevate-2 bg-primary text-primary-foreground py-4 rounded-2xl font-bold shadow-lg shadow-primary/25 hover:shadow-xl flex items-center justify-center gap-2 transition-all"
                        >
                          <Check className="w-5 h-5" /> Add to Library
                        </button>
                        <button 
                          onClick={() => handleReject(recipe.id)}
                          className="w-full sm:w-48 py-4 rounded-2xl font-bold text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center gap-2 transition-colors"
                        >
                          <X className="w-5 h-5" /> Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </Layout>
  );
}
