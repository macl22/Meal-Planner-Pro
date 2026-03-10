import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const recipes = pgTable("recipes", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  sourceType: text("source_type").notNull().default("manual"), // manual, web, imported
  sourceName: text("source_name"),
  sourceUrl: text("source_url"),
  description: text("description"),
  mealType: text("meal_type").notNull().default("both"), // lunch, dinner, both
  cuisine: text("cuisine"),
  proteinType: text("protein_type"),
  prepTimeMinutes: integer("prep_time_minutes"),
  cookTimeMinutes: integer("cook_time_minutes"),
  totalTimeMinutes: integer("total_time_minutes"),
  defaultServings: integer("default_servings").notNull().default(2),
  ingredients: jsonb("ingredients").notNull().default([]), // array of { raw, normalized, quantity, unit, optional, prep_note }
  instructions: text("instructions").notNull().default(""),
  imageUrl: text("image_url"),
  notes: text("notes"),
  isApproved: boolean("is_approved").notNull().default(true), // false for discovered recipes until approved
  discoveryScore: integer("discovery_score"), // for discovered recipes ranking
  discoveryReason: text("discovery_reason"), // why it was suggested
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const pantryStaples = pgTable("pantry_staples", {
  id: serial("id").primaryKey(),
  ingredientNameNormalized: text("ingredient_name_normalized").notNull().unique(),
  defaultUnit: text("default_unit"),
  alwaysHave: boolean("always_have_boolean").notNull().default(true),
  currentlyInStock: boolean("currently_in_stock_boolean").notNull().default(true),
  notes: text("notes"),
});

export const weeklyPlans = pgTable("weekly_plans", {
  id: serial("id").primaryKey(),
  startDate: timestamp("start_date").notNull(),
  lunchesCount: integer("lunches_count").notNull(),
  dinnersCount: integer("dinners_count").notNull(),
  servingsPerMeal: integer("servings_per_meal").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const weeklyPlanMeals = pgTable("weekly_plan_meals", {
  id: serial("id").primaryKey(),
  weeklyPlanId: integer("weekly_plan_id").notNull().references(() => weeklyPlans.id, { onDelete: 'cascade' }),
  recipeId: integer("recipe_id").notNull().references(() => recipes.id),
  mealType: text("meal_type").notNull(), // lunch, dinner
  isLocked: boolean("is_locked").notNull().default(false),
  cookedDate: timestamp("cooked_date"),
  rating: integer("rating"), // 1-5
  wouldRepeat: boolean("would_repeat"),
});

export const recipesRelations = relations(recipes, ({ many }) => ({
  weeklyPlanMeals: many(weeklyPlanMeals),
}));

export const weeklyPlansRelations = relations(weeklyPlans, ({ many }) => ({
  meals: many(weeklyPlanMeals),
}));

export const weeklyPlanMealsRelations = relations(weeklyPlanMeals, ({ one }) => ({
  weeklyPlan: one(weeklyPlans, {
    fields: [weeklyPlanMeals.weeklyPlanId],
    references: [weeklyPlans.id],
  }),
  recipe: one(recipes, {
    fields: [weeklyPlanMeals.recipeId],
    references: [recipes.id],
  }),
}));

const ingredientSchema = z.object({
  ingredient_name_raw: z.string(),
  ingredient_name_normalized: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  optional_boolean: z.boolean().default(false),
  preparation_note: z.string().nullable()
});

export const insertRecipeSchema = createInsertSchema(recipes, {
  ingredients: z.array(ingredientSchema).default([])
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertPantryStapleSchema = createInsertSchema(pantryStaples).omit({ id: true });
export const insertWeeklyPlanSchema = createInsertSchema(weeklyPlans).omit({ id: true, createdAt: true });
export const insertWeeklyPlanMealSchema = createInsertSchema(weeklyPlanMeals).omit({ id: true });

export type Recipe = typeof recipes.$inferSelect;
export type InsertRecipe = z.infer<typeof insertRecipeSchema>;
export type PantryStaple = typeof pantryStaples.$inferSelect;
export type InsertPantryStaple = z.infer<typeof insertPantryStapleSchema>;
export type WeeklyPlan = typeof weeklyPlans.$inferSelect;
export type InsertWeeklyPlan = z.infer<typeof insertWeeklyPlanSchema>;
export type WeeklyPlanMeal = typeof weeklyPlanMeals.$inferSelect;
export type InsertWeeklyPlanMeal = z.infer<typeof insertWeeklyPlanMealSchema>;

export type RecipeIngredient = z.infer<typeof ingredientSchema>;

// API Contract Types
export type CreateRecipeRequest = InsertRecipe;
export type UpdateRecipeRequest = Partial<InsertRecipe>;
export type RecipeResponse = Recipe;
export type RecipesListResponse = Recipe[];

export type CreatePantryStapleRequest = InsertPantryStaple;
export type UpdatePantryStapleRequest = Partial<InsertPantryStaple>;
export type PantryStapleResponse = PantryStaple;
export type PantryStaplesListResponse = PantryStaple[];

export type CreateWeeklyPlanRequest = InsertWeeklyPlan;
export type WeeklyPlanResponse = WeeklyPlan & { meals?: (WeeklyPlanMeal & { recipe: Recipe })[] };
export type WeeklyPlansListResponse = WeeklyPlan[];

export type CreateWeeklyPlanMealRequest = InsertWeeklyPlanMeal;
export type UpdateWeeklyPlanMealRequest = Partial<InsertWeeklyPlanMeal>;

export type GenerateMenuRequest = {
  lunchesCount: number;
  dinnersCount: number;
  servingsPerMeal: number;
};

export type DiscoverRecipesRequest = {
  count?: number;
};
