import { db } from "./db";
import { 
  recipes, 
  pantryStaples, 
  weeklyPlans, 
  weeklyPlanMeals,
  type InsertRecipe,
  type InsertPantryStaple,
  type InsertWeeklyPlan,
  type InsertWeeklyPlanMeal,
  type Recipe,
  type PantryStaple,
  type WeeklyPlan,
  type WeeklyPlanMeal
} from "@shared/schema";
import { eq, desc, inArray, and } from "drizzle-orm";

export interface IStorage {
  // Recipes
  getRecipes(isApproved?: boolean): Promise<Recipe[]>;
  getRecipe(id: number): Promise<Recipe | undefined>;
  createRecipe(recipe: InsertRecipe): Promise<Recipe>;
  updateRecipe(id: number, recipe: Partial<InsertRecipe>): Promise<Recipe | undefined>;
  deleteRecipe(id: number): Promise<void>;

  // Pantry Staples
  getPantryStaples(): Promise<PantryStaple[]>;
  createPantryStaple(staple: InsertPantryStaple): Promise<PantryStaple>;
  updatePantryStaple(id: number, staple: Partial<InsertPantryStaple>): Promise<PantryStaple | undefined>;
  deletePantryStaple(id: number): Promise<void>;

  // Weekly Plans
  getWeeklyPlans(): Promise<WeeklyPlan[]>;
  getWeeklyPlan(id: number): Promise<(WeeklyPlan & { meals: (WeeklyPlanMeal & { recipe: Recipe })[] }) | undefined>;
  createWeeklyPlan(plan: InsertWeeklyPlan): Promise<WeeklyPlan>;
  deleteWeeklyPlan(id: number): Promise<void>;
  
  // Weekly Plan Meals
  createWeeklyPlanMeal(meal: InsertWeeklyPlanMeal): Promise<WeeklyPlanMeal>;
  updateWeeklyPlanMeal(id: number, meal: Partial<InsertWeeklyPlanMeal>): Promise<WeeklyPlanMeal | undefined>;
  getWeeklyPlanMeals(planId: number): Promise<WeeklyPlanMeal[]>;
  getWeeklyPlanByMealId(mealId: number): Promise<(WeeklyPlan & { meals: (WeeklyPlanMeal & { recipe: Recipe })[] }) | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getRecipes(isApproved?: boolean): Promise<Recipe[]> {
    if (isApproved !== undefined) {
      return await db.select().from(recipes).where(eq(recipes.isApproved, isApproved)).orderBy(desc(recipes.createdAt));
    }
    return await db.select().from(recipes).orderBy(desc(recipes.createdAt));
  }

  async getRecipe(id: number): Promise<Recipe | undefined> {
    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id));
    return recipe;
  }

  async createRecipe(recipe: InsertRecipe): Promise<Recipe> {
    const [newRecipe] = await db.insert(recipes).values(recipe).returning();
    return newRecipe;
  }

  async updateRecipe(id: number, updates: Partial<InsertRecipe>): Promise<Recipe | undefined> {
    const [updatedRecipe] = await db.update(recipes).set(updates).where(eq(recipes.id, id)).returning();
    return updatedRecipe;
  }

  async deleteRecipe(id: number): Promise<void> {
    await db.delete(recipes).where(eq(recipes.id, id));
  }

  async getPantryStaples(): Promise<PantryStaple[]> {
    return await db.select().from(pantryStaples).orderBy(pantryStaples.ingredientNameNormalized);
  }

  async createPantryStaple(staple: InsertPantryStaple): Promise<PantryStaple> {
    const [newStaple] = await db.insert(pantryStaples).values(staple).returning();
    return newStaple;
  }

  async updatePantryStaple(id: number, updates: Partial<InsertPantryStaple>): Promise<PantryStaple | undefined> {
    const [updatedStaple] = await db.update(pantryStaples).set(updates).where(eq(pantryStaples.id, id)).returning();
    return updatedStaple;
  }

  async deletePantryStaple(id: number): Promise<void> {
    await db.delete(pantryStaples).where(eq(pantryStaples.id, id));
  }

  async getWeeklyPlans(): Promise<WeeklyPlan[]> {
    return await db.select().from(weeklyPlans).orderBy(desc(weeklyPlans.startDate));
  }

  async getWeeklyPlan(id: number): Promise<(WeeklyPlan & { meals: (WeeklyPlanMeal & { recipe: Recipe })[] }) | undefined> {
    const [plan] = await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, id));
    if (!plan) return undefined;

    const meals = await db.select({
      meal: weeklyPlanMeals,
      recipe: recipes,
    }).from(weeklyPlanMeals)
      .leftJoin(recipes, eq(weeklyPlanMeals.recipeId, recipes.id))
      .where(eq(weeklyPlanMeals.weeklyPlanId, id));

    return {
      ...plan,
      meals: meals.filter(m => m.recipe !== null).map(m => ({
        ...m.meal,
        recipe: m.recipe as Recipe
      }))
    };
  }

  async createWeeklyPlan(plan: InsertWeeklyPlan): Promise<WeeklyPlan> {
    const [newPlan] = await db.insert(weeklyPlans).values(plan).returning();
    return newPlan;
  }

  async deleteWeeklyPlan(id: number): Promise<void> {
    await db.delete(weeklyPlans).where(eq(weeklyPlans.id, id));
  }

  async createWeeklyPlanMeal(meal: InsertWeeklyPlanMeal): Promise<WeeklyPlanMeal> {
    const [newMeal] = await db.insert(weeklyPlanMeals).values(meal).returning();
    return newMeal;
  }

  async updateWeeklyPlanMeal(id: number, updates: Partial<InsertWeeklyPlanMeal>): Promise<WeeklyPlanMeal | undefined> {
    const [updatedMeal] = await db.update(weeklyPlanMeals).set(updates).where(eq(weeklyPlanMeals.id, id)).returning();
    return updatedMeal;
  }

  async getWeeklyPlanMeals(planId: number): Promise<WeeklyPlanMeal[]> {
    return await db.select().from(weeklyPlanMeals).where(eq(weeklyPlanMeals.weeklyPlanId, planId));
  }

  async getWeeklyPlanByMealId(mealId: number): Promise<(WeeklyPlan & { meals: (WeeklyPlanMeal & { recipe: Recipe })[] }) | undefined> {
    const [meal] = await db.select().from(weeklyPlanMeals).where(eq(weeklyPlanMeals.id, mealId));
    if (!meal) return undefined;
    return this.getWeeklyPlan(meal.weeklyPlanId);
  }
}

export const storage = new DatabaseStorage();
