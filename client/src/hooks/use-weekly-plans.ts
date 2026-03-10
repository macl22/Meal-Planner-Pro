import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type GenerateMenuRequest, type InsertWeeklyPlanMeal } from "@shared/routes";

export function useWeeklyPlans() {
  return useQuery({
    queryKey: [api.weeklyPlans.list.path],
    queryFn: async () => {
      const res = await fetch(api.weeklyPlans.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch plans");
      return await res.json(); // Loose parsing as defined in instructions
    },
  });
}

export function useWeeklyPlan(id: number) {
  const url = buildUrl(api.weeklyPlans.get.path, { id });
  return useQuery({
    queryKey: [api.weeklyPlans.get.path, id],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch plan");
      return await res.json();
    },
    enabled: !!id,
  });
}

export function useGeneratePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: GenerateMenuRequest) => {
      const res = await fetch(api.weeklyPlans.generate.path, {
        method: api.weeklyPlans.generate.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to generate plan");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.weeklyPlans.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.weeklyPlans.get.path] });
    },
  });
}

export function useDeleteWeeklyPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.weeklyPlans.delete.path, { id });
      const res = await fetch(url, {
        method: api.weeklyPlans.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete plan");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.weeklyPlans.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.weeklyPlans.get.path] });
    },
  });
}

export function useRegenerateMeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (mealId: number) => {
      const url = buildUrl(api.weeklyPlans.regenerateMeal.path, { id: mealId });
      const res = await fetch(url, {
        method: api.weeklyPlans.regenerateMeal.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to regenerate meal");
      return await res.json();
    },
    onSuccess: (_, mealId) => {
      // Invalidate everything to be safe, ideally we'd specifically target the plan this meal belongs to
      queryClient.invalidateQueries({ queryKey: [api.weeklyPlans.list.path] });
      // Clear all specific plan queries to force refetch
      queryClient.invalidateQueries({ queryKey: [api.weeklyPlans.get.path] }); 
    },
  });
}

export function useUpdateMeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<InsertWeeklyPlanMeal> }) => {
      const url = buildUrl(api.weeklyPlans.updateMeal.path, { id });
      const res = await fetch(url, {
        method: api.weeklyPlans.updateMeal.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update meal");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.weeklyPlans.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.weeklyPlans.get.path] }); 
    },
  });
}

export function useShoppingList(planId: number) {
  const url = buildUrl(api.weeklyPlans.shoppingList.path, { id: planId });
  return useQuery({
    queryKey: [api.weeklyPlans.shoppingList.path, planId],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch shopping list");
      return await res.json(); // Returns grouped object
    },
    enabled: !!planId,
  });
}
