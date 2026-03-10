import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import PlanPage from "./pages/PlanPage";
import RecipesPage from "./pages/RecipesPage";
import PantryPage from "./pages/PantryPage";
import ShoppingListPage from "./pages/ShoppingListPage";
import DiscoveryPage from "./pages/DiscoveryPage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={PlanPage} />
      <Route path="/recipes" component={RecipesPage} />
      <Route path="/pantry" component={PantryPage} />
      <Route path="/shopping-list/:id" component={ShoppingListPage} />
      <Route path="/discover" component={DiscoveryPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
