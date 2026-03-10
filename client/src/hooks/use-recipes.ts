import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type RecipeResponse, type InsertRecipe } from "@shared/routes";

// Utility to parse JSON safely if it's stringified
function safeParse(schema: any, data: any) {
  try {
    return schema.parse(data);
  } catch (e) {
    console.error("Zod parse error:", e);
    return data; // Fallback to raw data on error to prevent total crash, UI will handle
  }
}

export function useRecipes(params?: { isApproved?: boolean; search?: string }) {
  const queryParams = new URLSearchParams();
  if (params?.isApproved !== undefined) queryParams.set("isApproved", String(params.isApproved));
  if (params?.search) queryParams.set("search", params.search);
  
  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : "";
  const url = `${api.recipes.list.path}${queryString}`;

  return useQuery({
    queryKey: [api.recipes.list.path, params],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch recipes");
      const data = await res.json();
      return safeParse(api.recipes.list.responses[200], data);
    },
  });
}

export function useRecipe(id: number) {
  const url = buildUrl(api.recipes.get.path, { id });
  return useQuery({
    queryKey: [api.recipes.get.path, id],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch recipe");
      const data = await res.json();
      return safeParse(api.recipes.get.responses[200], data);
    },
    enabled: !!id,
  });
}

export function useCreateRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (recipe: InsertRecipe) => {
      const res = await fetch(api.recipes.create.path, {
        method: api.recipes.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipe),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create recipe");
      const data = await res.json();
      return safeParse(api.recipes.create.responses[201], data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.recipes.list.path] });
    },
  });
}

export function useUpdateRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<InsertRecipe> }) => {
      const url = buildUrl(api.recipes.update.path, { id });
      const res = await fetch(url, {
        method: api.recipes.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update recipe");
      const data = await res.json();
      return safeParse(api.recipes.update.responses[200], data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.recipes.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.recipes.get.path, variables.id] });
    },
  });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.recipes.delete.path, { id });
      const res = await fetch(url, {
        method: api.recipes.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete recipe");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.recipes.list.path] });
    },
  });
}

export function useImportRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (url: string) => {
      const res = await fetch(api.recipes.importFromUrl.path, {
        method: api.recipes.importFromUrl.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to import recipe");
      const data = await res.json();
      return safeParse(api.recipes.importFromUrl.responses[200], data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.recipes.list.path] });
    },
  });
}

export function useDiscoverRecipes() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(api.recipes.discover.path, {
        method: api.recipes.discover.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to discover recipes");
      const data = await res.json();
      return safeParse(api.recipes.discover.responses[200], data);
    },
  });
}
