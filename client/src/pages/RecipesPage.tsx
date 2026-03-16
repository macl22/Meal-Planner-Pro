import { useState } from "react";
import { useRecipes, useImportRecipe, useImportText, useDeleteRecipe, useCreateRecipe, useUpdateRecipe } from "@/hooks/use-recipes";
import { Layout } from "@/components/Layout";
import { LoadingState } from "@/components/ui/LoadingState";
import { Plus, Search, Link as LinkIcon, Trash2, Clock, Users, X, Loader2, BookOpen, Utensils, FileText, Zap, ChevronDown, ChevronUp, Check, Pencil, Save } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

type ImportMode = "url" | "text" | "bulk";

export default function RecipesPage() {
  const [search, setSearch] = useState("");
  const { data: recipes, isLoading } = useRecipes({ isApproved: true, search: search.length > 2 ? search : undefined });
  const [selectedRecipe, setSelectedRecipe] = useState<any>(null);
  const [importMode, setImportMode] = useState<ImportMode>("url");
  const [showSimpleCreator, setShowSimpleCreator] = useState(false);

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight font-display mb-2">Recipes</h1>
            <p className="text-muted-foreground text-lg">Your curated collection</p>
          </div>
          <button
            onClick={() => setShowSimpleCreator(!showSimpleCreator)}
            className="active-elevate-2 flex items-center gap-2 bg-foreground text-background px-4 py-3 rounded-2xl font-semibold hover:bg-foreground/90 transition-all shadow-xl"
          >
            <Plus className="w-5 h-5" /> Add Simple Meal
          </button>
        </header>

        {/* Simple Meal Creator */}
        <AnimatePresence>
          {showSimpleCreator && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <SimpleMealCreator onClose={() => setShowSimpleCreator(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Import Card */}
        <div className="bg-card rounded-3xl p-6 border border-border shadow-sm">
          <h2 className="text-xl font-bold font-display mb-4 flex items-center gap-2">
            <LinkIcon className="w-5 h-5 text-primary" /> Import Recipe
          </h2>

          {/* Mode Tabs */}
          <div className="flex gap-1 bg-muted rounded-xl p-1 mb-5">
            {([
              { key: "url", label: "From URL", icon: LinkIcon },
              { key: "text", label: "Paste Text", icon: FileText },
              { key: "bulk", label: "Bulk URLs", icon: BookOpen },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setImportMode(key)}
                data-testid={`import-tab-${key}`}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                  importMode === key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {importMode === "url" && <UrlImport onSwitchToText={() => setImportMode("text")} />}
          {importMode === "text" && <TextImport />}
          {importMode === "bulk" && <BulkImport />}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search recipes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-recipes"
            className="w-full bg-card border-2 border-transparent focus:border-primary/20 focus:ring-4 focus:ring-primary/10 pl-12 pr-4 py-4 rounded-2xl text-lg transition-all shadow-sm"
          />
        </div>

        <AnimatePresence>
          {selectedRecipe && (
            <RecipeDetailModal recipe={selectedRecipe} onClose={() => setSelectedRecipe(null)} onUpdate={(updated: any) => setSelectedRecipe(updated)} />
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
              <RecipeCard key={recipe.id} recipe={recipe} index={i} onClick={() => setSelectedRecipe(recipe)} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

function UrlImport({ onSwitchToText }: { onSwitchToText: () => void }) {
  const importMutation = useImportRecipe();
  const { toast } = useToast();

  const handleImport = () => {
    const input = document.getElementById('quick-import-url') as HTMLInputElement;
    if (!input.value) return;
    importMutation.mutate(input.value, {
      onSuccess: (recipe: any) => {
        input.value = '';
        toast({ title: `Imported: ${recipe.title}`, description: "Added to your library." });
      },
      onError: (err: any) => {
        const msg = err.message || "";
        if (msg.includes("blocks automated access")) {
          toast({ title: "Site blocked access", description: "Switching to Paste Text — copy the recipe from the page and paste it there.", variant: "destructive" });
          onSwitchToText();
        } else {
          toast({ title: "Import failed", description: msg || "Try pasting the text instead.", variant: "destructive" });
        }
      }
    });
  };

  return (
    <div>
      <div className="flex gap-3">
        <input
          type="url"
          placeholder="Paste recipe URL (https://...)"
          id="quick-import-url"
          data-testid="input-import-url"
          className="flex-1 bg-background border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 px-4 py-3 rounded-xl transition-all"
        />
        <button
          onClick={handleImport}
          disabled={importMutation.isPending}
          data-testid="button-import-url"
          className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-semibold shadow-lg shadow-primary/25 hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2"
        >
          {importMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Import'}
        </button>
      </div>
      <p className="text-xs text-muted-foreground mt-2">Some sites may block automated access. If import fails, use Paste Text instead.</p>
    </div>
  );
}

function TextImport() {
  const [text, setText] = useState("");
  const importMutation = useImportText();
  const { toast } = useToast();

  const handleImport = () => {
    if (!text.trim()) return;
    importMutation.mutate(text, {
      onSuccess: (recipe: any) => {
        setText('');
        toast({ title: `Imported: ${recipe.title}`, description: "Added to your library." });
      },
      onError: (err: any) => {
        toast({ title: "Import failed", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Paste a TikTok/Instagram caption, recipe text, or any text with ingredients & instructions...\n\nExample:\n\"Crispy chicken thighs:\n- 4 chicken thighs\n- 2 tbsp soy sauce\n- 1 tsp garlic powder\nMarinate 30 min. Roast 425°F for 40 min.\""}
        data-testid="input-import-text"
        rows={7}
        className="w-full bg-background border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 px-4 py-3 rounded-xl transition-all text-sm resize-none"
      />
      <button
        onClick={handleImport}
        disabled={!text.trim() || importMutation.isPending}
        data-testid="button-import-text"
        className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-semibold shadow-lg shadow-primary/25 hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {importMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Extracting recipe...</> : 'Extract & Import Recipe'}
      </button>
      <p className="text-xs text-muted-foreground">Works great for TikTok captions, Instagram posts, copied webpage text, and recipe screenshots (transcribed).</p>
    </div>
  );
}

function BulkImport() {
  const [urls, setUrls] = useState("");
  const [results, setResults] = useState<{ url: string; status: 'pending' | 'done' | 'error'; title?: string; error?: string }[]>([]);
  const [running, setRunning] = useState(false);
  const importMutation = useImportRecipe();

  const handleBulkImport = async () => {
    const lines = urls.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
    if (!lines.length) return;
    setResults(lines.map(url => ({ url, status: 'pending' })));
    setRunning(true);
    for (let i = 0; i < lines.length; i++) {
      const url = lines[i];
      try {
        await new Promise<void>((resolve, reject) => {
          importMutation.mutate(url, {
            onSuccess: (recipe: any) => {
              setResults(prev => prev.map(r => r.url === url ? { ...r, status: 'done', title: recipe.title } : r));
              resolve();
            },
            onError: (err: any) => {
              setResults(prev => prev.map(r => r.url === url ? { ...r, status: 'error', error: err.message } : r));
              resolve();
            }
          });
        });
      } catch {
        setResults(prev => prev.map(r => r.url === url ? { ...r, status: 'error' } : r));
      }
    }
    setRunning(false);
  };

  return (
    <div className="space-y-3">
      <textarea
        value={urls}
        onChange={(e) => setUrls(e.target.value)}
        placeholder={"One URL per line:\nhttps://cooking.nytimes.com/recipes/...\nhttps://www.tiktok.com/@creator/video/...\nhttps://www.seriouseats.com/..."}
        data-testid="input-bulk-urls"
        rows={5}
        className="w-full bg-background border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 px-4 py-3 rounded-xl transition-all text-sm font-mono resize-none"
      />
      <button
        onClick={handleBulkImport}
        disabled={running || !urls.trim()}
        data-testid="button-bulk-import"
        className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-semibold shadow-lg shadow-primary/25 hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {running ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</> : 'Import All'}
      </button>
      {results.length > 0 && (
        <div className="space-y-2 mt-2">
          {results.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              {r.status === 'pending' && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
              {r.status === 'done' && <Check className="w-4 h-4 text-green-500 shrink-0" />}
              {r.status === 'error' && <X className="w-4 h-4 text-destructive shrink-0" />}
              <span className={`truncate ${r.status === 'error' ? 'text-destructive' : r.status === 'done' ? 'text-muted-foreground' : ''}`}>
                {r.title || r.url}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SimpleMealCreator({ onClose }: { onClose: () => void }) {
  const [protein, setProtein] = useState("");
  const [veg, setVeg] = useState("");
  const [carb, setCarb] = useState("");
  const [notes, setNotes] = useState("");
  const [cookTime, setCookTime] = useState(30);
  const createMutation = useCreateRecipe();
  const { toast } = useToast();

  const title = [protein, veg, carb].filter(Boolean).join(' + ') || 'Simple Assembly Meal';

  const handleCreate = () => {
    if (!protein) return;
    const ingredients = [];
    if (protein) ingredients.push({ ingredient_name_raw: protein, ingredient_name_normalized: protein.toLowerCase(), quantity: null, unit: null, optional_boolean: false, preparation_note: null });
    if (veg) ingredients.push({ ingredient_name_raw: veg, ingredient_name_normalized: veg.toLowerCase(), quantity: null, unit: null, optional_boolean: false, preparation_note: null });
    if (carb) ingredients.push({ ingredient_name_raw: carb, ingredient_name_normalized: carb.toLowerCase(), quantity: null, unit: null, optional_boolean: false, preparation_note: null });

    createMutation.mutate({
      title,
      description: "Simple assembly meal — season and cook to your preference.",
      sourceType: "manual",
      mealType: "dinner",
      recipeType: "simple",
      cookTimeMinutes: cookTime,
      totalTimeMinutes: cookTime + 5,
      defaultServings: 2,
      ingredients,
      instructions: notes || `1. Prep ${protein}. 2. Cook with your preferred seasonings. 3. Serve with ${[veg, carb].filter(Boolean).join(' and ')}.`,
      isApproved: true,
    }, {
      onSuccess: () => {
        toast({ title: `Added: ${title}`, description: "Simple meal added to your library." });
        onClose();
      },
      onError: () => {
        toast({ title: "Failed to create meal", variant: "destructive" });
      }
    });
  };

  return (
    <div className="bg-card rounded-3xl p-6 border border-green-500/20 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-green-500/10 rounded-xl flex items-center justify-center">
            <Zap className="w-4 h-4 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold font-display">Create Simple Meal</h2>
            <p className="text-xs text-muted-foreground">No recipe needed — just protein + veg + carb</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {title !== 'Simple Assembly Meal' && (
        <div className="bg-green-500/10 text-green-700 dark:text-green-400 text-sm font-semibold px-4 py-2 rounded-xl mb-4 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5" /> {title}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Protein *</label>
          <input
            value={protein}
            onChange={e => setProtein(e.target.value)}
            placeholder="Chicken thighs"
            data-testid="input-simple-protein"
            className="w-full bg-background border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/10 px-3 py-2.5 rounded-xl text-sm transition-all"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Vegetable</label>
          <input
            value={veg}
            onChange={e => setVeg(e.target.value)}
            placeholder="Broccoli"
            data-testid="input-simple-veg"
            className="w-full bg-background border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/10 px-3 py-2.5 rounded-xl text-sm transition-all"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Carb</label>
          <input
            value={carb}
            onChange={e => setCarb(e.target.value)}
            placeholder="White rice"
            data-testid="input-simple-carb"
            className="w-full bg-background border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/10 px-3 py-2.5 rounded-xl text-sm transition-all"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Cook time (min)</label>
          <input
            type="number"
            value={cookTime}
            onChange={e => setCookTime(Number(e.target.value))}
            min={5} max={120}
            className="w-full bg-background border-2 border-border focus:border-primary px-3 py-2.5 rounded-xl text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Notes (optional)</label>
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. marinate overnight"
            className="w-full bg-background border-2 border-border focus:border-primary px-3 py-2.5 rounded-xl text-sm"
          />
        </div>
      </div>

      <button
        onClick={handleCreate}
        disabled={!protein || createMutation.isPending}
        data-testid="button-create-simple-meal"
        className="w-full bg-foreground text-background py-3 rounded-2xl font-semibold hover:bg-foreground/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Add to My Meals</>}
      </button>
    </div>
  );
}

function RecipeCard({ recipe, index, onClick }: { recipe: any, index: number, onClick: () => void }) {
  const deleteMutation = useDeleteRecipe();
  const recipeType = recipe.recipeType || 'full';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onClick}
      data-testid={`card-recipe-${recipe.id}`}
      className={`rounded-3xl overflow-hidden border shadow-sm hover:shadow-ios transition-all group flex flex-col cursor-pointer ${
        recipeType === 'simple' ? 'bg-card border-green-500/20' :
        recipeType === 'leftovers' ? 'bg-muted/40 border-border/50' :
        'bg-card border-border'
      }`}
    >
      <div className="relative h-48 bg-muted overflow-hidden">
        {recipe.imageUrl ? (
          <img src={recipe.imageUrl} alt={recipe.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className={`w-full h-full flex items-center justify-center ${
            recipeType === 'simple' ? 'text-green-500/30 bg-green-500/5' :
            recipeType === 'leftovers' ? 'text-muted-foreground/20' :
            'text-muted-foreground/30'
          }`}>
            {recipeType === 'simple' ? <Zap className="w-16 h-16" /> : <Utensils className="w-16 h-16" />}
          </div>
        )}
        <div className="absolute top-3 right-3 flex gap-2">
          <span className="bg-background/90 backdrop-blur text-foreground text-xs font-bold px-3 py-1 rounded-full capitalize shadow-sm">
            {recipeType === 'simple' ? '⚡ Easy' : recipeType === 'leftovers' ? '🔄 Leftovers' : recipe.mealType}
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

function RecipeDetailModal({ recipe, onClose, onUpdate }: { recipe: any, onClose: () => void, onUpdate: (updated: any) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(recipe.title || "");
  const [editInstructions, setEditInstructions] = useState(recipe.instructions || "");
  const [editNotes, setEditNotes] = useState(recipe.notes || "");
  const updateRecipe = useUpdateRecipe();
  const { toast } = useToast();

  const handleSave = () => {
    if (!editTitle.trim()) {
      toast({ title: "Title cannot be empty", variant: "destructive" });
      return;
    }
    updateRecipe.mutate(
      { id: recipe.id, updates: { title: editTitle, instructions: editInstructions, notes: editNotes } },
      {
        onSuccess: (updatedRecipe) => {
          const merged = { ...recipe, title: editTitle, instructions: editInstructions, notes: editNotes, ...(updatedRecipe || {}) };
          onUpdate(merged);
          setIsEditing(false);
          toast({ title: "Recipe updated" });
        },
        onError: () => {
          toast({ title: "Failed to update recipe", variant: "destructive" });
        },
      }
    );
  };

  const handleCancel = () => {
    setEditTitle(recipe.title || "");
    setEditInstructions(recipe.instructions || "");
    setEditNotes(recipe.notes || "");
    setIsEditing(false);
  };

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
          <div className="absolute top-4 right-4 flex gap-2">
            {isEditing ? (
              <>
                <button
                  data-testid="button-save-recipe"
                  onClick={handleSave}
                  disabled={updateRecipe.isPending}
                  className="bg-primary text-primary-foreground backdrop-blur px-3 py-2 rounded-full shadow-lg font-semibold text-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  {updateRecipe.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save
                </button>
                <button
                  data-testid="button-cancel-edit"
                  onClick={handleCancel}
                  disabled={updateRecipe.isPending}
                  className="bg-background/80 backdrop-blur px-3 py-2 rounded-full shadow-lg font-semibold text-sm disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                data-testid="button-edit-recipe"
                onClick={() => setIsEditing(true)}
                className="bg-background/80 backdrop-blur p-2 rounded-full shadow-lg"
              >
                <Pencil className="w-6 h-6" />
              </button>
            )}
            <button 
              data-testid="button-close-modal"
              onClick={onClose}
              className="bg-background/80 backdrop-blur p-2 rounded-full shadow-lg"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-8 overflow-y-auto">
          <div className="flex justify-between items-start gap-4 mb-6">
            <div className="flex-1">
              {isEditing ? (
                <input
                  data-testid="input-edit-title"
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="text-3xl font-extrabold font-display leading-tight w-full bg-muted/50 border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              ) : (
                <h2 data-testid="text-recipe-title" className="text-3xl font-extrabold font-display leading-tight">{recipe.title}</h2>
              )}
              <div className="flex gap-4 mt-2 text-muted-foreground font-medium">
                <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> {recipe.totalTimeMinutes || '?'}m</span>
                <span className="flex items-center gap-1.5"><Users className="w-4 h-4" /> {recipe.defaultServings} servings</span>
                <span className="capitalize">{recipe.cuisine} {recipe.proteinType}</span>
              </div>
            </div>
          </div>


          <div className="space-y-8">
            {recipe.ingredients?.length > 0 && (
              <section>
                <h3 className="text-xl font-bold font-display mb-4">Ingredients</h3>
                <ul className="space-y-3">
                  {recipe.ingredients.map((ing: any, i: number) => (
                    <li key={i} className="flex gap-3 bg-muted/30 p-3 rounded-xl border border-border/50">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                      <span className="text-lg">{ing.ingredient_name_raw}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3 className="text-xl font-bold font-display mb-4">Instructions</h3>
              {isEditing ? (
                <textarea
                  data-testid="input-edit-instructions"
                  value={editInstructions}
                  onChange={(e) => setEditInstructions(e.target.value)}
                  rows={8}
                  className="w-full text-lg leading-relaxed bg-muted/50 border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                />
              ) : (
                recipe.instructions && (
                  <div data-testid="text-recipe-instructions" className="text-lg leading-relaxed whitespace-pre-wrap text-foreground/90">
                    {recipe.instructions}
                  </div>
                )
              )}
            </section>

            {isEditing ? (
              <section>
                <h3 className="text-lg font-bold font-display mb-2 text-primary">Notes</h3>
                <textarea
                  data-testid="input-edit-notes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                  placeholder="Add personal notes (e.g. 'add extra chili next time')"
                  className="w-full text-base bg-primary/5 border border-primary/10 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                />
              </section>
            ) : (
              recipe.notes && (
                <section data-testid="section-recipe-notes" className="bg-primary/5 p-6 rounded-3xl border border-primary/10">
                  <h3 className="text-lg font-bold font-display mb-2 text-primary">Notes</h3>
                  <p className="text-muted-foreground italic">{recipe.notes}</p>
                </section>
              )
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
