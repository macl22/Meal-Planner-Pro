import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import * as cheerio from "cheerio";
import { openai } from "./replit_integrations/audio/client"; // Reuse openai instance from audio integration

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Recipes
  app.get(api.recipes.list.path, async (req, res) => {
    try {
      const isApproved = req.query.isApproved ? req.query.isApproved === 'true' : undefined;
      const allRecipes = await storage.getRecipes(isApproved);
      
      let filtered = allRecipes;
      if (req.query.search) {
        const search = String(req.query.search).toLowerCase();
        filtered = allRecipes.filter(r => 
          r.title.toLowerCase().includes(search) || 
          (r.cuisine && r.cuisine.toLowerCase().includes(search)) ||
          (r.description && r.description.toLowerCase().includes(search))
        );
      }
      res.json(filtered);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch recipes" });
    }
  });

  app.get(api.recipes.get.path, async (req, res) => {
    try {
      const recipe = await storage.getRecipe(Number(req.params.id));
      if (!recipe) return res.status(404).json({ message: 'Recipe not found' });
      res.json(recipe);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch recipe" });
    }
  });

  app.post(api.recipes.create.path, async (req, res) => {
    try {
      const input = api.recipes.create.input.parse(req.body);
      const recipe = await storage.createRecipe(input);
      res.status(201).json(recipe);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      res.status(500).json({ message: "Failed to create recipe" });
    }
  });

  app.put(api.recipes.update.path, async (req, res) => {
    try {
      const input = api.recipes.update.input.parse(req.body);
      const recipe = await storage.updateRecipe(Number(req.params.id), input);
      if (!recipe) return res.status(404).json({ message: 'Recipe not found' });
      res.json(recipe);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      res.status(500).json({ message: "Failed to update recipe" });
    }
  });

  app.delete(api.recipes.delete.path, async (req, res) => {
    try {
      await storage.deleteRecipe(Number(req.params.id));
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete recipe" });
    }
  });

  // Import recipe from URL
  app.post(api.recipes.importFromUrl.path, async (req, res) => {
    try {
      const input = api.recipes.importFromUrl.input.parse(req.body);
      
      const response = await fetch(input.url);
      const html = await response.text();
      const $ = cheerio.load(html);
      
      const title = $('title').text() || $('h1').first().text() || "Imported Recipe";
      const description = $('meta[name="description"]').attr('content') || "";
      const sourceName = new URL(input.url).hostname;
      
      // AI Extraction fallback for sites without schema.org
      const prompt = `Extract recipe data from this HTML. 
      HTML: ${html.slice(0, 10000)}
      Return ONLY a JSON object with:
      title, description, mealType (lunch, dinner, or both), prepTimeMinutes, cookTimeMinutes, 
      ingredients (array of {raw, normalized, quantity, unit}), instructions (string).`;
      
      let recipeData: any = null;
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" }
        });
        recipeData = JSON.parse(completion.choices[0].message.content || "{}");
      } catch (e) {
        console.error("AI Extraction failed, falling back to basic extraction", e);
      }

      let extractedIngredients: any[] = [];
      let extractedInstructions = "";

      if (recipeData && recipeData.ingredients) {
        extractedIngredients = recipeData.ingredients.map((i: any) => ({
          ingredient_name_raw: i.raw || i,
          ingredient_name_normalized: i.normalized || i.raw || i,
          quantity: i.quantity || null,
          unit: i.unit || null,
          optional_boolean: false,
          preparation_note: null
        }));
        extractedInstructions = recipeData.instructions || "";
      }

      const recipe = await storage.createRecipe({
        title: recipeData?.title || title,
        description: recipeData?.description || description,
        sourceUrl: input.url,
        sourceName,
        sourceType: "imported",
        ingredients: extractedIngredients,
        instructions: extractedInstructions,
        isApproved: true,
        mealType: recipeData?.mealType || "both"
      });

      res.status(200).json(recipe);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to import recipe" });
    }
  });

  // Discover recipes
  app.post(api.recipes.discover.path, async (req, res) => {
    try {
      const approvedRecipes = await storage.getRecipes(true);
      
      // Extract preferences
      const cuisines = [...new Set(approvedRecipes.map(r => r.cuisine).filter(Boolean))];
      const proteins = [...new Set(approvedRecipes.map(r => r.proteinType).filter(Boolean))];
      const titles = approvedRecipes.map(r => r.title);
      
      const prompt = `Suggest a simple, tasty recipe for a weekly meal planner. 
      The user likes these cuisines: ${cuisines.join(', ') || 'Various'}.
      They often use these proteins: ${proteins.join(', ') || 'Any'}.
      They already have these recipes: ${titles.slice(0, 10).join(', ')}.
      Suggest something NEW that fits these preferences but is different from what they have.
      
      Return ONLY a JSON object with:
      title, description, mealType (lunch, dinner, or both), cuisine, proteinType, prepTimeMinutes, cookTimeMinutes, 
      ingredients (array of strings), instructions (string).`;
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });
      
      const data = JSON.parse(completion.choices[0].message.content || "{}");
      
      const newRecipe = await storage.createRecipe({
        title: data.title || "Suggested Recipe",
        description: data.description || "",
        sourceType: "web",
        mealType: data.mealType || "dinner",
        cuisine: data.cuisine || cuisines[0] || "International",
        proteinType: data.proteinType || proteins[0] || "Various",
        prepTimeMinutes: data.prepTimeMinutes || 15,
        cookTimeMinutes: data.cookTimeMinutes || 30,
        ingredients: (data.ingredients || []).map((i: string) => ({
          ingredient_name_raw: i,
          ingredient_name_normalized: i,
          quantity: null,
          unit: null,
          optional_boolean: false,
          preparation_note: null
        })),
        instructions: data.instructions || "",
        isApproved: false,
        discoveryScore: Math.floor(Math.random() * 20) + 80,
        discoveryReason: `Fits your preference for ${data.cuisine || 'variety'}`
      });
      
      const unapproved = await storage.getRecipes(false);
      res.status(200).json(unapproved);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to discover recipes" });
    }
  });

  // Pantry Staples
  app.get(api.pantryStaples.list.path, async (req, res) => {
    try {
      const staples = await storage.getPantryStaples();
      res.json(staples);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch pantry staples" });
    }
  });

  app.post(api.pantryStaples.create.path, async (req, res) => {
    try {
      const input = api.pantryStaples.create.input.parse(req.body);
      const staple = await storage.createPantryStaple(input);
      res.status(201).json(staple);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create pantry staple" });
    }
  });

  app.put(api.pantryStaples.update.path, async (req, res) => {
    try {
      const input = api.pantryStaples.update.input.parse(req.body);
      const staple = await storage.updatePantryStaple(Number(req.params.id), input);
      if (!staple) return res.status(404).json({ message: 'Pantry staple not found' });
      res.json(staple);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update pantry staple" });
    }
  });

  app.delete(api.pantryStaples.delete.path, async (req, res) => {
    try {
      await storage.deletePantryStaple(Number(req.params.id));
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete pantry staple" });
    }
  });

  // Weekly Plans
  app.get(api.weeklyPlans.list.path, async (req, res) => {
    try {
      const plans = await storage.getWeeklyPlans();
      res.json(plans);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch weekly plans" });
    }
  });

  app.get(api.weeklyPlans.get.path, async (req, res) => {
    try {
      const plan = await storage.getWeeklyPlan(Number(req.params.id));
      if (!plan) return res.status(404).json({ message: 'Weekly plan not found' });
      res.json(plan);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch weekly plan" });
    }
  });

  app.post(api.weeklyPlans.generate.path, async (req, res) => {
    try {
      const input = api.weeklyPlans.generate.input.parse(req.body);
      
      const allRecipes = await storage.getRecipes(true);
      if (allRecipes.length === 0) {
        return res.status(400).json({ message: "You need to add some recipes first!" });
      }

      const plan = await storage.createWeeklyPlan({
        startDate: new Date(),
        lunchesCount: input.lunchesCount,
        dinnersCount: input.dinnersCount,
        servingsPerMeal: input.servingsPerMeal
      });

      const usedInPlan: number[] = [];

      // Logic for picking recipes with leftover/simple meal support
      const pickRecipe = (type: string) => {
        // 20% chance of a "Simple Meal" if we have any
        if (Math.random() < 0.2) {
          const simple = allRecipes.find(r => r.title.toLowerCase().includes("chicken thighs") || r.title.toLowerCase().includes("simple"));
          if (simple) return simple;
        }

        // 15% chance of leftovers if we've already picked a meal
        if (usedInPlan.length > 0 && Math.random() < 0.15) {
          return { id: -1, title: "Leftovers", mealType: type } as any;
        }

        const suitable = allRecipes.filter(r => (r.mealType === type || r.mealType === 'both') && !usedInPlan.includes(r.id));
        const picked = suitable.length > 0 ? suitable[Math.floor(Math.random() * suitable.length)] : allRecipes[0];
        if (picked.id !== -1) usedInPlan.push(picked.id);
        return picked;
      };

      for (let i = 0; i < input.lunchesCount; i++) {
        const recipe = pickRecipe('lunch');
        await storage.createWeeklyPlanMeal({
          weeklyPlanId: plan.id,
          recipeId: recipe.id === -1 ? allRecipes[0].id : recipe.id, // Fallback for schema
          mealType: 'lunch'
        });
      }

      for (let i = 0; i < input.dinnersCount; i++) {
        const recipe = pickRecipe('dinner');
        await storage.createWeeklyPlanMeal({
          weeklyPlanId: plan.id,
          recipeId: recipe.id === -1 ? allRecipes[0].id : recipe.id,
          mealType: 'dinner'
        });
      }

      const completePlan = await storage.getWeeklyPlan(plan.id);
      res.status(201).json(completePlan);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to generate plan" });
    }
  });

  // Swap a meal
  app.post(api.weeklyPlans.regenerateMeal.path, async (req, res) => {
    try {
      const mealId = Number(req.params.id);
      
      // Need to find the meal to know its type
      // Using direct db query here for simplicity since we don't have getWeeklyPlanMeal
      const [meal] = await db.select().from(weeklyPlanMeals).where(eq(weeklyPlanMeals.id, mealId));
      if (!meal) return res.status(404).json({ message: "Meal not found" });

      const allRecipes = await storage.getRecipes(true);
      const suitableRecipes = allRecipes.filter(r => r.mealType === meal.mealType || r.mealType === 'both');
      
      if (suitableRecipes.length > 0) {
        // Pick a different recipe
        let newRecipe = suitableRecipes[Math.floor(Math.random() * suitableRecipes.length)];
        
        const updated = await storage.updateWeeklyPlanMeal(mealId, {
          recipeId: newRecipe.id
        });
        return res.json(updated);
      }
      
      res.json(meal); // Return original if no alternatives
    } catch (err) {
      res.status(500).json({ message: "Failed to regenerate meal" });
    }
  });

  // Generate Shopping List
  app.get(api.weeklyPlans.shoppingList.path, async (req, res) => {
    try {
      const plan = await storage.getWeeklyPlan(Number(req.params.id));
      if (!plan) return res.status(404).json({ message: 'Weekly plan not found' });

      const staples = await storage.getPantryStaples();
      const inStockStaples = staples.filter(s => s.currentlyInStock).map(s => s.ingredientNameNormalized.toLowerCase());
      const outOfStockStaples = staples.filter(s => !s.currentlyInStock);

      const list: Record<string, { item: string, raw: string }[]> = {
        "Produce": [],
        "Meat & Seafood": [],
        "Dairy": [],
        "Pantry": [],
        "Other": [],
        "Check Pantry": []
      };

      // Add out of stock staples to Pantry
      outOfStockStaples.forEach(staple => {
        list["Pantry"].push({
          item: staple.ingredientNameNormalized,
          raw: `${staple.ingredientNameNormalized} (from staples)`
        });
      });

      // Add all "always have" staples to Check Pantry
      staples.filter(s => s.alwaysHave).forEach(staple => {
        list["Check Pantry"].push({
          item: staple.ingredientNameNormalized,
          raw: staple.ingredientNameNormalized
        });
      });

      // Collect ingredients from meals
      plan.meals.forEach(meal => {
        const recipe = meal.recipe;
        if (recipe && Array.isArray(recipe.ingredients)) {
          recipe.ingredients.forEach((ing: any) => {
            const name = ing.ingredient_name_normalized || ing.ingredient_name_raw || "";
            
            // Skip if it's an in-stock staple
            if (inStockStaples.includes(name.toLowerCase())) {
              return;
            }

            // Simple categorization based on keywords
            let category = "Other";
            const lowerName = name.toLowerCase();
            
            if (lowerName.match(/apple|banana|onion|garlic|tomato|lettuce|carrot|spinach|potato|pepper|lemon|lime/)) {
              category = "Produce";
            } else if (lowerName.match(/chicken|beef|pork|fish|salmon|shrimp|bacon/)) {
              category = "Meat & Seafood";
            } else if (lowerName.match(/milk|cheese|butter|cream|yogurt|egg/)) {
              category = "Dairy";
            } else if (lowerName.match(/flour|sugar|salt|oil|rice|pasta|bean|sauce|spice|can/)) {
              category = "Pantry";
            }

            list[category].push({
              item: name,
              raw: ing.ingredient_name_raw || name
            });
          });
        }
      });

      res.json(list);
    } catch (err) {
      res.status(500).json({ message: "Failed to generate shopping list" });
    }
  });

  app.put(api.weeklyPlans.updateMeal.path, async (req, res) => {
    try {
      const input = api.weeklyPlans.updateMeal.input.parse(req.body);
      const meal = await storage.updateWeeklyPlanMeal(Number(req.params.id), input);
      if (!meal) return res.status(404).json({ message: 'Meal not found' });
      res.json(meal);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update meal" });
    }
  });

  seedDatabase().catch(console.error);

  return httpServer;
}

async function seedDatabase() {
  const existingRecipes = await storage.getRecipes();
  if (existingRecipes.length === 0) {
    // ... (existing recipes)
  }

  const existingStaples = await storage.getPantryStaples();
  if (existingStaples.length <= 2) { // 2 are from the initial seed
    const commonStaples = [
      "Milk", "Eggs", "Butter", "Flour", "Sugar", 
      "Rice", "Pasta", "Onions", "Garlic", "Potatoes",
      "Chicken Broth", "Soy Sauce", "Black Pepper", "Honey"
    ];

    for (const name of commonStaples) {
      const normalized = name.toLowerCase();
      if (!existingStaples.find(s => s.ingredientNameNormalized === normalized)) {
        await storage.createPantryStaple({
          ingredientNameNormalized: normalized,
          alwaysHave: true,
          currentlyInStock: true
        });
      }
    }
  }
}
