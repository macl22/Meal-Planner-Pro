import { useRecipes, useUpdateRecipe, useDeleteRecipe, useDiscoverRecipes } from "@/hooks/use-recipes";
import { Layout } from "@/components/Layout";
import { LoadingState } from "@/components/ui/LoadingState";
import { Check, X, Sparkles, Loader2, Clock, ChefHat, Star } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function DiscoveryPage() {
  const { data: suggestions, isLoading } = useRecipes({ isApproved: false });
  const updateMutation = useUpdateRecipe();
  const deleteMutation = useDeleteRecipe();
  const discoverMutation = useDiscoverRecipes();

  const handleApprove = (id: number) => {
    updateMutation.mutate({ id, updates: { isApproved: true } });
  };

  const handleReject = (id: number) => {
    deleteMutation.mutate(id);
  };

  if (isLoading) return <Layout><LoadingState message="Loading suggestions..." /></Layout>;

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <header className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight font-display mb-2 flex items-center gap-3">
              Discover <Sparkles className="w-8 h-8 text-accent" />
            </h1>
            <p className="text-muted-foreground text-lg">
              {suggestions && suggestions.length > 0
                ? `${suggestions.length} recipes picked for your taste`
                : "AI picks recipes matched to your style"}
            </p>
          </div>
          <button
            onClick={() => discoverMutation.mutate()}
            disabled={discoverMutation.isPending}
            className="active-elevate-2 bg-accent text-accent-foreground px-5 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-accent/20 hover:shadow-xl transition-all disabled:opacity-50"
          >
            {discoverMutation.isPending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Finding...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" /> {suggestions?.length ? 'Refresh' : 'Find Recipes'}
              </>
            )}
          </button>
        </header>

        {discoverMutation.isPending && (
          <div className="flex flex-col items-center justify-center py-20 bg-card rounded-3xl border border-dashed border-accent/30 space-y-4">
            <Loader2 className="w-10 h-10 text-accent animate-spin" />
            <p className="text-lg font-semibold text-muted-foreground">Analyzing your recipe collection...</p>
            <p className="text-sm text-muted-foreground">Finding popular recipes that match your taste</p>
          </div>
        )}

        {!discoverMutation.isPending && (!suggestions || suggestions.length === 0) && (
          <div className="text-center py-20 bg-card rounded-3xl border border-dashed border-border shadow-sm">
            <div className="w-20 h-20 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Sparkles className="w-10 h-10 text-accent" />
            </div>
            <h3 className="text-xl font-bold font-display mb-2">No suggestions yet</h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Tap "Find Recipes" and AI will suggest popular, highly-rated recipes tailored to your cooking style.
            </p>
            <button
              onClick={() => discoverMutation.mutate()}
              disabled={discoverMutation.isPending}
              className="bg-accent text-accent-foreground px-8 py-4 rounded-2xl font-bold shadow-lg shadow-accent/25 hover:-translate-y-0.5 transition-all disabled:opacity-50 flex items-center gap-2 mx-auto"
            >
              <Sparkles className="w-5 h-5" /> Generate Suggestions
            </button>
          </div>
        )}

        {!discoverMutation.isPending && suggestions && suggestions.length > 0 && (
          <div className="grid gap-6">
            <AnimatePresence>
              {suggestions.map((recipe: any, i: number) => (
                <motion.div
                  key={recipe.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden"
                >
                  <div className="p-6 sm:p-8">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="bg-accent/10 text-accent text-xs font-bold px-3 py-1 rounded-full capitalize">
                            {recipe.mealType}
                          </span>
                          {recipe.cuisine && (
                            <span className="bg-muted text-muted-foreground text-xs font-medium px-3 py-1 rounded-full">
                              {recipe.cuisine}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-xs font-bold text-yellow-500 bg-yellow-50 dark:bg-yellow-500/10 px-2 py-1 rounded-full">
                            <Star className="w-3 h-3 fill-yellow-500" /> Highly Rated
                          </span>
                        </div>
                        <h2 className="text-2xl font-bold font-display leading-tight">{recipe.title}</h2>
                      </div>
                    </div>

                    {recipe.discoveryReason && (
                      <div className="bg-accent/5 border border-accent/15 rounded-2xl p-4 mb-5">
                        <p className="text-sm font-medium text-accent/80 flex items-start gap-2">
                          <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                          {recipe.discoveryReason}
                        </p>
                      </div>
                    )}

                    <p className="text-muted-foreground mb-5 leading-relaxed">{recipe.description}</p>

                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
                      {recipe.prepTimeMinutes && (
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-4 h-4" /> {(recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0)} min
                        </span>
                      )}
                      {recipe.cuisine && (
                        <span className="flex items-center gap-1.5">
                          <ChefHat className="w-4 h-4" /> {recipe.cuisine}
                        </span>
                      )}
                    </div>

                    {recipe.ingredients && recipe.ingredients.length > 0 && (
                      <div className="mb-6">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Key Ingredients</p>
                        <div className="flex flex-wrap gap-2">
                          {recipe.ingredients.slice(0, 6).map((ing: any, j: number) => (
                            <span key={j} className="bg-muted text-foreground text-sm px-3 py-1 rounded-full">
                              {ing.ingredient_name_raw || ing}
                            </span>
                          ))}
                          {recipe.ingredients.length > 6 && (
                            <span className="bg-muted text-muted-foreground text-sm px-3 py-1 rounded-full">
                              +{recipe.ingredients.length - 6} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => handleApprove(recipe.id)}
                        disabled={updateMutation.isPending}
                        className="active-elevate-2 flex-1 bg-primary text-primary-foreground py-4 rounded-2xl font-bold shadow-lg shadow-primary/25 hover:shadow-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                      >
                        <Check className="w-5 h-5" /> Add to My Recipes
                      </button>
                      <button
                        onClick={() => handleReject(recipe.id)}
                        disabled={deleteMutation.isPending}
                        className="py-4 px-6 rounded-2xl font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center gap-2 transition-colors"
                      >
                        <X className="w-5 h-5" /> Skip
                      </button>
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
