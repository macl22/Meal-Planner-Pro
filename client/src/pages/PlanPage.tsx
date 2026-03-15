import { useState } from "react";
import { useWeeklyPlans, useWeeklyPlan, useGeneratePlan, useRegenerateMeal, useUpdateMeal, useDeleteWeeklyPlan } from "@/hooks/use-weekly-plans";
import { useDiscoverRecipes, useUpdateRecipe, useDeleteRecipe, useRecipes } from "@/hooks/use-recipes";
import { Layout } from "@/components/Layout";
import { LoadingState } from "@/components/ui/LoadingState";
import { format, parseISO } from "date-fns";
import { Utensils, RefreshCw, Lock, LockOpen, ShoppingCart, Plus, Loader2, Trash2, Sparkles, Check, X, Clock, Star, Repeat2, Zap, Search, List } from "lucide-react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";

export default function PlanPage() {
  const { data: plans, isLoading: plansLoading } = useWeeklyPlans();
  const [isGenerating, setIsGenerating] = useState(false);
  const deleteMutation = useDeleteWeeklyPlan();
  const [, setLocation] = useLocation();

  if (plansLoading) return <Layout><LoadingState message="Loading your plan..." /></Layout>;

  // Pick the most recent plan, or null if none
  const activePlan = plans && plans.length > 0 ? plans[0] : null;

  const handleDelete = () => {
    if (!activePlan) return;
    if (confirm("Are you sure you want to delete this weekly plan? This will clear your current menu.")) {
      deleteMutation.mutate(activePlan.id);
    }
  };

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
        <header className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight font-display mb-2">This Week</h1>
            <p className="text-muted-foreground text-lg">Your personalized menu</p>
          </div>
          <div className="flex gap-2">
            {activePlan && (
              <button 
                onClick={() => setIsGenerating(true)}
                className="active-elevate-2 flex items-center gap-2 bg-secondary text-secondary-foreground px-5 py-3 rounded-2xl font-semibold hover:bg-secondary/80 transition-all"
              >
                <RefreshCw className="w-5 h-5" />
                <span className="hidden sm:inline">Regenerate</span>
              </button>
            )}
            {activePlan && (
              <Link href={`/shopping-list/${activePlan.id}`} className="active-elevate-2 flex items-center gap-2 bg-primary text-primary-foreground px-5 py-3 rounded-2xl font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all">
                <ShoppingCart className="w-5 h-5" />
                <span className="hidden sm:inline">Shopping List</span>
              </Link>
            )}
          </div>
        </header>

        {!activePlan ? (
          <div className="bg-card rounded-3xl p-8 sm:p-12 text-center border border-border shadow-ios flex flex-col items-center">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 text-primary">
              <Utensils className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold mb-3 font-display">No active plan</h2>
            <p className="text-muted-foreground mb-8 max-w-md text-balance">
              Generate a new weekly plan based on your recipes and pantry staples.
            </p>
            <button 
              onClick={() => setIsGenerating(true)}
              className="active-elevate-2 bg-foreground text-background px-8 py-4 rounded-2xl font-semibold text-lg flex items-center gap-2 hover:bg-foreground/90 transition-all shadow-xl"
            >
              <Plus className="w-5 h-5" /> Generate Plan
            </button>
          </div>
        ) : (
          <>
            <PlanViewer planId={activePlan.id} />
            <div className="flex justify-center pt-8">
              <button 
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="active-elevate-2 flex items-center gap-2 text-destructive hover:bg-destructive/10 px-6 py-4 rounded-2xl font-semibold transition-all"
              >
                {deleteMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                Delete This Plan
              </button>
            </div>
          </>
        )}

        <AnimatePresence>
          {isGenerating && <GeneratePlanModal onClose={() => setIsGenerating(false)} />}
        </AnimatePresence>
      </div>
    </Layout>
  );
}

function PlanViewer({ planId }: { planId: number }) {
  const { data: plan, isLoading } = useWeeklyPlan(planId);
  const [pickingMealId, setPickingMealId] = useState<number | null>(null);
  
  if (isLoading || !plan) return <LoadingState />;

  const groupedMeals = plan.meals?.reduce((acc: any, meal: any) => {
    const group = meal.mealType;
    if (!acc[group]) acc[group] = [];
    acc[group].push(meal);
    return acc;
  }, {});

  const typeLabel = (t: string) => t === 'lunch' ? 'Lunches' : 'Dinners';

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2">
        {['dinner', 'lunch'].map((type) => (
          groupedMeals?.[type]?.length > 0 && (
            <div key={type} className="space-y-2">
              <h3 className="text-lg font-bold font-display flex items-center gap-2 mb-1">
                {typeLabel(type)} <span className="bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full">{groupedMeals[type].length}</span>
              </h3>
              <div className="space-y-2">
                {groupedMeals[type].map((meal: any) => (
                  <MealCard key={meal.id} meal={meal} onPickRecipe={() => setPickingMealId(meal.id)} />
                ))}
              </div>
            </div>
          )
        ))}
      </div>
      <AnimatePresence>
        {pickingMealId !== null && (
          <RecipePickerSheet
            mealId={pickingMealId}
            onClose={() => setPickingMealId(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function MealCard({ meal, onPickRecipe }: { meal: any; onPickRecipe: () => void }) {
  const regenerateMutation = useRegenerateMeal();
  const updateMutation = useUpdateMeal();

  const handleShuffle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (meal.isLocked) return;
    regenerateMutation.mutate(meal.id);
  };

  const toggleLock = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateMutation.mutate({ id: meal.id, updates: { isLocked: !meal.isLocked } });
  };

  const recipeType = meal.recipe.recipeType || 'full';
  const isLeftovers = recipeType === 'leftovers';
  const isSimple = recipeType === 'simple';

  const TypeIcon = isLeftovers ? Repeat2 : isSimple ? Zap : Utensils;

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      data-testid={`meal-card-${meal.id}`}
      className={`
        flex items-center gap-3 rounded-xl px-3 py-3 border transition-all cursor-pointer
        ${meal.isLocked ? 'border-primary/30 bg-primary/5' : 
          isLeftovers ? 'border-border/50 bg-muted/30' :
          isSimple ? 'border-green-500/20 bg-green-500/5' :
          'bg-card border-border hover:bg-muted/30'}
      `}
      onClick={() => !meal.isLocked && onPickRecipe()}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
        isLeftovers ? 'bg-muted text-muted-foreground' :
        isSimple ? 'bg-green-500/15 text-green-600' :
        'bg-primary/10 text-primary'
      }`}>
        <TypeIcon className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-sm leading-tight truncate" data-testid={`meal-title-${meal.id}`}>
          {meal.recipe.title}
        </h4>
        {!isLeftovers && (meal.recipe.totalTimeMinutes || meal.recipe.prepTimeMinutes || meal.recipe.cookTimeMinutes) && (
          <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <Clock className="w-3 h-3" />
            {meal.recipe.totalTimeMinutes || ((meal.recipe.prepTimeMinutes || 0) + (meal.recipe.cookTimeMinutes || 0))}m
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button 
          onClick={toggleLock}
          data-testid={`meal-lock-${meal.id}`}
          className={`p-1.5 rounded-lg transition-colors ${meal.isLocked ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
        >
          {meal.isLocked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={handleShuffle}
          disabled={meal.isLocked || regenerateMutation.isPending}
          data-testid={`meal-shuffle-${meal.id}`}
          className={`p-1.5 rounded-lg transition-colors ${meal.isLocked ? 'text-muted-foreground/30 cursor-not-allowed' : 'text-muted-foreground hover:bg-muted'}`}
        >
          {regenerateMutation.isPending && regenerateMutation.variables === meal.id ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onPickRecipe(); }}
          disabled={meal.isLocked}
          data-testid={`meal-pick-${meal.id}`}
          className={`p-1.5 rounded-lg transition-colors ${meal.isLocked ? 'text-muted-foreground/30 cursor-not-allowed' : 'text-muted-foreground hover:bg-muted'}`}
        >
          <List className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

function RecipePickerSheet({ mealId, onClose }: { mealId: number; onClose: () => void }) {
  const { data: recipes, isLoading } = useRecipes({ isApproved: true });
  const updateMealMutation = useUpdateMeal();
  const [search, setSearch] = useState("");

  const filtered = (recipes || []).filter((r: any) =>
    r.title !== 'Leftovers' &&
    r.title.toLowerCase().includes(search.toLowerCase())
  );

  const handlePick = (recipe: any) => {
    updateMealMutation.mutate(
      { id: mealId, updates: { recipeId: recipe.id } },
      { onSuccess: () => onClose() }
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        exit={{ y: 100 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-ios-lg border border-border overflow-hidden max-h-[80vh] flex flex-col"
      >
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold font-display">Choose a Recipe</h2>
            <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-muted transition-colors" data-testid="picker-close">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search recipes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="picker-search"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-muted border-0 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-2">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">No recipes found</p>
          ) : (
            <div className="space-y-1">
              {filtered.map((recipe: any) => {
                const rt = recipe.recipeType || 'full';
                const Icon = rt === 'simple' ? Zap : Utensils;
                return (
                  <button
                    key={recipe.id}
                    onClick={() => handlePick(recipe)}
                    disabled={updateMealMutation.isPending}
                    data-testid={`picker-recipe-${recipe.id}`}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted transition-colors text-left"
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      rt === 'simple' ? 'bg-green-500/15 text-green-600' : 'bg-primary/10 text-primary'
                    }`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{recipe.title}</p>
                      {(recipe.totalTimeMinutes || recipe.prepTimeMinutes || recipe.cookTimeMinutes) && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {recipe.totalTimeMinutes || ((recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0))}m
                        </span>
                      )}
                    </div>
                    {recipe.proteinType && (
                      <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground capitalize shrink-0">
                        {recipe.proteinType}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function GeneratePlanModal({ onClose }: { onClose: () => void }) {
  const generateMutation = useGeneratePlan();
  const discoverMutation = useDiscoverRecipes();
  const updateMutation = useUpdateRecipe();
  const deleteMutation = useDeleteRecipe();
  const [lunches, setLunches] = useState(3);
  const [dinners, setDinners] = useState(5);
  const [servings, setServings] = useState(2);
  const [step, setStep] = useState<"configure" | "discovering" | "suggestions">("configure");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [approvedIds, setApprovedIds] = useState<Set<number>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());

  const handleGenerate = () => {
    generateMutation.mutate({ lunchesCount: lunches, dinnersCount: dinners, servingsPerMeal: servings }, {
      onSuccess: () => {
        setStep("discovering");
        discoverMutation.mutate(undefined, {
          onSuccess: (data: any) => {
            if (data && data.length > 0) {
              setSuggestions(data);
              setStep("suggestions");
            } else {
              onClose();
            }
          },
          onError: () => onClose()
        });
      }
    });
  };

  const handleApprove = (recipe: any) => {
    updateMutation.mutate({ id: recipe.id, updates: { isApproved: true } });
    setApprovedIds(prev => new Set([...prev, recipe.id]));
  };

  const handleDismiss = (recipe: any) => {
    deleteMutation.mutate(recipe.id);
    setDismissedIds(prev => new Set([...prev, recipe.id]));
  };

  const visibleSuggestions = suggestions.filter(s => !dismissedIds.has(s.id));

  if (step === "configure") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-card w-full max-w-md rounded-3xl shadow-ios-lg border border-border p-6 overflow-hidden"
        >
          <h2 className="text-2xl font-bold font-display mb-6">Create New Plan</h2>

          <div className="space-y-6">
            <div className="space-y-3">
              <label className="text-sm font-semibold text-muted-foreground flex justify-between">
                Dinners <span>{dinners}</span>
              </label>
              <input
                type="range" min="0" max="7" value={dinners}
                onChange={(e) => setDinners(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-semibold text-muted-foreground flex justify-between">
                Lunches <span>{lunches}</span>
              </label>
              <input
                type="range" min="0" max="7" value={lunches}
                onChange={(e) => setLunches(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-semibold text-muted-foreground flex justify-between">
                Servings per meal <span>{servings}</span>
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5, 6].map(n => (
                  <button
                    key={n}
                    onClick={() => setServings(n)}
                    className={`flex-1 py-3 rounded-xl font-medium transition-colors ${servings === n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-secondary'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <button
              onClick={onClose}
              className="flex-1 py-4 rounded-2xl font-semibold bg-muted text-foreground hover:bg-muted/80 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
              className="flex-1 py-4 rounded-2xl font-semibold bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {generateMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Generate'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (step === "discovering") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-card w-full max-w-md rounded-3xl shadow-ios-lg border border-border p-10 flex flex-col items-center gap-6"
        >
          <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-accent animate-pulse" />
          </div>
          <div className="text-center">
            <h3 className="text-xl font-bold font-display mb-2">Plan generated!</h3>
            <p className="text-muted-foreground">Finding new recipes you might like...</p>
          </div>
          <Loader2 className="w-6 h-6 text-accent animate-spin" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="bg-card w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-ios-lg border border-border overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold font-display flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-accent" /> New Discoveries
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Popular recipes matched to your taste — add any to your library
              </p>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          <AnimatePresence>
            {visibleSuggestions.map((recipe: any) => {
              const isApproved = approvedIds.has(recipe.id);
              return (
                <motion.div
                  key={recipe.id}
                  layout
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  className={`rounded-2xl border p-4 transition-colors ${isApproved ? 'bg-primary/5 border-primary/30' : 'bg-background border-border'}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full capitalize">
                          {recipe.mealType}
                        </span>
                        <span className="flex items-center gap-1 text-xs font-bold text-yellow-500">
                          <Star className="w-3 h-3 fill-yellow-500" /> Highly Rated
                        </span>
                        {(recipe.prepTimeMinutes || recipe.cookTimeMinutes) && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {(recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0)} min
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold leading-snug">{recipe.title}</h3>
                      {recipe.discoveryReason && (
                        <p className="text-xs text-muted-foreground mt-1 italic">{recipe.discoveryReason}</p>
                      )}
                    </div>
                  </div>

                  {recipe.ingredients?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {recipe.ingredients.slice(0, 4).map((ing: any, j: number) => (
                        <span key={j} className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                          {ing.ingredient_name_raw || ing}
                        </span>
                      ))}
                      {recipe.ingredients.length > 4 && (
                        <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                          +{recipe.ingredients.length - 4} more
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    {isApproved ? (
                      <div className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/10 text-primary font-semibold text-sm">
                        <Check className="w-4 h-4" /> Added to library
                      </div>
                    ) : (
                      <button
                        onClick={() => handleApprove(recipe)}
                        className="active-elevate-2 flex-1 bg-primary text-primary-foreground py-2.5 rounded-xl font-semibold text-sm shadow-sm flex items-center justify-center gap-2 transition-all"
                      >
                        <Check className="w-4 h-4" /> Add to My Recipes
                      </button>
                    )}
                    {!isApproved && (
                      <button
                        onClick={() => handleDismiss(recipe)}
                        className="py-2.5 px-4 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors text-sm font-medium"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        <div className="p-4 border-t border-border">
          <button
            onClick={onClose}
            className="w-full py-4 rounded-2xl font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl transition-all"
          >
            Done — View My Plan
          </button>
        </div>
      </motion.div>
    </div>
  );
}
