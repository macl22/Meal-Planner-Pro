import { useState } from "react";
import { useRecipes, useImportRecipe, useDeleteRecipe } from "@/hooks/use-recipes";
import { Layout } from "@/components/Layout";
import { LoadingState } from "@/components/ui/LoadingState";
import { Plus, Search, Link as LinkIcon, Trash2, Clock, Users, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function RecipesPage() {
  const [search, setSearch] = useState("");
  const { data: recipes, isLoading } = useRecipes({ isApproved: true, search: search.length > 2 ? search : undefined });
  const [selectedRecipe, setSelectedRecipe] = useState<any>(null);
  const importMutation = useImportRecipe();

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight font-display mb-2">Recipes</h1>
            <p className="text-muted-foreground text-lg">Your curated collection</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button className="active-elevate-2 flex-1 sm:flex-none flex items-center justify-center gap-2 bg-foreground text-background px-4 py-3 rounded-2xl font-semibold hover:bg-foreground/90 transition-all shadow-xl">
              <Plus className="w-5 h-5" /> New
            </button>
          </div>
        </header>

        <div className="bg-card rounded-3xl p-6 border border-border shadow-sm">
          <h2 className="text-xl font-bold font-display mb-4 flex items-center gap-2">
            <LinkIcon className="w-5 h-5 text-primary" /> Quick Import
          </h2>
          <div className="flex gap-3">
            <input
              type="url"
              placeholder="Paste recipe URL (https://...)"
              id="quick-import-url"
              className="flex-1 bg-background border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 px-4 py-3 rounded-xl transition-all"
            />
            <button 
              onClick={() => {
                const input = document.getElementById('quick-import-url') as HTMLInputElement;
                if (input.value) {
                  importMutation.mutate(input.value, { 
                    onSuccess: () => { input.value = ''; } 
                  });
                }
              }}
              disabled={importMutation.isPending}
              className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-semibold shadow-lg shadow-primary/25 hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {importMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Import'}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">Paste a URL from any site to automatically extract ingredients and instructions.</p>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search recipes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-card border-2 border-transparent focus:border-primary/20 focus:ring-4 focus:ring-primary/10 pl-12 pr-4 py-4 rounded-2xl text-lg transition-all shadow-sm"
          />
        </div>

        <AnimatePresence>
          {selectedRecipe && (
            <RecipeDetailModal 
              recipe={selectedRecipe} 
              onClose={() => setSelectedRecipe(null)} 
            />
          )}
        </AnimatePresence>

        {isLoading ? (
          <LoadingState />
        ) : !recipes?.length ? (
          <div className="text-center py-20 text-muted-foreground bg-card rounded-3xl border border-dashed border-border">
            <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">No recipes found.</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {recipes.map((recipe: any, i: number) => (
              <RecipeCard 
                key={recipe.id} 
                recipe={recipe} 
                index={i} 
                onClick={() => setSelectedRecipe(recipe)}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

import { BookOpen } from "lucide-react"; // Import missing icon

function RecipeCard({ recipe, index, onClick }: { recipe: any, index: number, onClick: () => void }) {
  const deleteMutation = useDeleteRecipe();

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onClick}
      className="bg-card rounded-3xl overflow-hidden border border-border shadow-sm hover:shadow-ios transition-all group flex flex-col cursor-pointer"
    >
      <div className="relative h-48 bg-muted overflow-hidden">
        {recipe.imageUrl ? (
          <img src={recipe.imageUrl} alt={recipe.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
            <Utensils className="w-16 h-16" />
          </div>
        )}
        <div className="absolute top-3 right-3 flex gap-2">
           <span className="bg-background/90 backdrop-blur text-foreground text-xs font-bold px-3 py-1 rounded-full capitalize shadow-sm">
            {recipe.mealType}
          </span>
        </div>
      </div>
      
      <div className="p-5 flex-1 flex flex-col">
        <h3 className="text-xl font-bold font-display leading-tight mb-2 line-clamp-2">{recipe.title}</h3>
        <p className="text-muted-foreground text-sm line-clamp-2 mb-4 flex-1">{recipe.description}</p>
        
        <div className="flex items-center justify-between mt-auto pt-4 border-t border-border/50 text-sm text-muted-foreground font-medium">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> {recipe.totalTimeMinutes || '?'}m</span>
            <span className="flex items-center gap-1.5"><Users className="w-4 h-4" /> {recipe.defaultServings}</span>
          </div>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("Are you sure you want to delete this recipe?")) {
                deleteMutation.mutate(recipe.id);
              }
            }}
            className="text-muted-foreground hover:text-destructive transition-colors p-1"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function RecipeDetailModal({ recipe, onClose }: { recipe: any, onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="bg-card w-full max-w-2xl max-h-[90vh] rounded-3xl shadow-ios-lg border border-border flex flex-col overflow-hidden"
      >
        <div className="relative h-64 shrink-0">
          {recipe.imageUrl ? (
            <img src={recipe.imageUrl} alt={recipe.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground/20">
              <Utensils className="w-24 h-24" />
            </div>
          )}
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 bg-background/80 backdrop-blur p-2 rounded-full shadow-lg"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 overflow-y-auto">
          <div className="flex justify-between items-start gap-4 mb-6">
            <div>
              <h2 className="text-3xl font-extrabold font-display leading-tight">{recipe.title}</h2>
              <div className="flex gap-4 mt-2 text-muted-foreground font-medium">
                <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> {recipe.totalTimeMinutes || '?'}m</span>
                <span className="flex items-center gap-1.5"><Users className="w-4 h-4" /> {recipe.defaultServings} servings</span>
                <span className="capitalize">{recipe.cuisine} {recipe.proteinType}</span>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <section>
              <h3 className="text-xl font-bold font-display mb-4">Ingredients</h3>
              <ul className="space-y-3">
                {recipe.ingredients?.map((ing: any, i: number) => (
                  <li key={i} className="flex gap-3 bg-muted/30 p-3 rounded-xl border border-border/50">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                    <span className="text-lg">{ing.ingredient_name_raw}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="text-xl font-bold font-display mb-4">Instructions</h3>
              <div className="text-lg leading-relaxed whitespace-pre-wrap text-foreground/90">
                {recipe.instructions}
              </div>
            </section>

            {recipe.notes && (
              <section className="bg-primary/5 p-6 rounded-3xl border border-primary/10">
                <h3 className="text-lg font-bold font-display mb-2 text-primary">Notes</h3>
                <p className="text-muted-foreground italic">{recipe.notes}</p>
              </section>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function ImportRecipeModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");
  const importMutation = useImportRecipe();

  const handleImport = () => {
    if (!url) return;
    importMutation.mutate(url, { onSuccess: onClose });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card w-full max-w-md rounded-3xl shadow-ios-lg border border-border p-6"
      >
        <h2 className="text-2xl font-bold font-display mb-2">Import Recipe</h2>
        <p className="text-muted-foreground mb-6 text-sm">Paste a URL from any major recipe site to automatically extract ingredients and instructions.</p>
        
        <input
          type="url"
          placeholder="https://..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full bg-background border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 px-4 py-4 rounded-xl text-lg mb-6 transition-all"
        />

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl font-semibold bg-muted text-foreground hover:bg-muted/80 transition-colors">
            Cancel
          </button>
          <button 
            onClick={handleImport}
            disabled={!url || importMutation.isPending}
            className="flex-1 py-3 rounded-xl font-semibold bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center"
          >
            {importMutation.isPending ? "Importing..." : "Import"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
import { Utensils } from "lucide-react"; // Ensure Utensils is imported
