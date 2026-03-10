import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type InsertPantryStaple } from "@shared/routes";

function safeParse(schema: any, data: any) {
  try { return schema.parse(data); } 
  catch (e) { console.error(e); return data; }
}

export function usePantryStaples() {
  return useQuery({
    queryKey: [api.pantryStaples.list.path],
    queryFn: async () => {
      const res = await fetch(api.pantryStaples.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pantry staples");
      const data = await res.json();
      return safeParse(api.pantryStaples.list.responses[200], data);
    },
  });
}

export function useCreatePantryStaple() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (staple: InsertPantryStaple) => {
      const res = await fetch(api.pantryStaples.create.path, {
        method: api.pantryStaples.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(staple),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create staple");
      const data = await res.json();
      return safeParse(api.pantryStaples.create.responses[201], data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.pantryStaples.list.path] });
    },
  });
}

export function useUpdatePantryStaple() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<InsertPantryStaple> }) => {
      const url = buildUrl(api.pantryStaples.update.path, { id });
      const res = await fetch(url, {
        method: api.pantryStaples.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update staple");
      const data = await res.json();
      return safeParse(api.pantryStaples.update.responses[200], data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.pantryStaples.list.path] });
    },
  });
}

export function useDeletePantryStaple() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.pantryStaples.delete.path, { id });
      const res = await fetch(url, {
        method: api.pantryStaples.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete staple");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.pantryStaples.list.path] });
    },
  });
}
