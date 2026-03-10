import { useState } from "react";
import { usePantryStaples, useUpdatePantryStaple, useCreatePantryStaple, useDeletePantryStaple } from "@/hooks/use-pantry";
import { Layout } from "@/components/Layout";
import { LoadingState } from "@/components/ui/LoadingState";
import { Plus, CheckCircle2, Circle, AlertCircle, Trash2 } from "lucide-react";
import { motion } from "framer-motion";

export default function PantryPage() {
  const { data: staples, isLoading } = usePantryStaples();
  const [newItemName, setNewItemName] = useState("");
  const createMutation = useCreatePantryStaple();

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    createMutation.mutate({ 
      ingredientNameNormalized: newItemName.trim().toLowerCase(),
      alwaysHave: true,
      currentlyInStock: true
    }, {
      onSuccess: () => setNewItemName("")
    });
  };

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight font-display mb-2">Pantry</h1>
            <p className="text-muted-foreground text-lg">Manage your staples</p>
          </div>
        </header>

        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            placeholder="Add new staple (e.g. Olive Oil)..."
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            className="flex-1 bg-card border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 px-4 py-4 rounded-2xl text-lg transition-all shadow-sm"
          />
          <button 
            type="submit"
            disabled={!newItemName.trim() || createMutation.isPending}
            className="active-elevate-2 bg-primary text-primary-foreground px-6 py-4 rounded-2xl font-semibold shadow-lg shadow-primary/25 disabled:opacity-50"
          >
            <Plus className="w-6 h-6" />
          </button>
        </form>

        {isLoading ? (
          <LoadingState />
        ) : (
          <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden">
            {staples?.map((staple: any, i: number) => (
              <StapleRow key={staple.id} staple={staple} isLast={i === staples.length - 1} />
            ))}
            {staples?.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                <p>Your pantry is empty. Add some staples above.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

function StapleRow({ staple, isLast }: { staple: any, isLast: boolean }) {
  const updateMutation = useUpdatePantryStaple();
  const deleteMutation = useDeletePantryStaple();

  const toggleStock = () => {
    updateMutation.mutate({ id: staple.id, updates: { currentlyInStock: !staple.currentlyInStock } });
  };

  return (
    <div className={`flex items-center justify-between p-4 sm:p-5 ${!isLast ? 'border-b border-border/50' : ''}`}>
      <div className="flex items-center gap-4 flex-1">
        <button 
          onClick={toggleStock}
          className={`shrink-0 transition-colors ${staple.currentlyInStock ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {staple.currentlyInStock ? <CheckCircle2 className="w-7 h-7" /> : <Circle className="w-7 h-7" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-lg capitalize truncate ${!staple.currentlyInStock ? 'text-muted-foreground line-through' : ''}`}>
            {staple.ingredientNameNormalized}
          </p>
          {!staple.currentlyInStock && staple.alwaysHave && (
            <p className="text-xs text-accent flex items-center gap-1 font-medium mt-0.5">
              <AlertCircle className="w-3 h-3" /> Needs restock
            </p>
          )}
        </div>
      </div>
      <button 
        onClick={() => deleteMutation.mutate(staple.id)}
        className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-colors ml-4"
      >
        <Trash2 className="w-5 h-5" />
      </button>
    </div>
  );
}
