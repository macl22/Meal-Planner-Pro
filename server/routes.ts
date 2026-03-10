import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import * as cheerio from "cheerio";
import { openai } from "./replit_integrations/audio/client"; // Reuse openai instance from audio integration
import { db } from "./db";
import { weeklyPlanMeals } from "@shared/schema";
import { eq } from "drizzle-orm";

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
      const id = Number(req.params.id);
      
      // Check if recipe is used in any weekly plans
      const meals = await db.select().from(weeklyPlanMeals).where(eq(weeklyPlanMeals.recipeId, id));
      if (meals.length > 0) {
        return res.status(400).json({ message: "Cannot delete recipe as it is used in a weekly plan. Remove it from the plan first." });
      }

      await storage.deleteRecipe(id);
      res.status(204).send();
    } catch (err) {
      console.error("Delete error:", err);
      res.status(500).json({ message: "Failed to delete recipe" });
    }
  });

  // Import recipe from URL
  app.post(api.recipes.importFromUrl.path, async (req, res) => {
    try {
      const input = api.recipes.importFromUrl.input.parse(req.body);
      console.log(`Attempting to import from: ${input.url}`);
      
      const response = await fetch(input.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Better cleaning: remove non-content elements
      $('script, style, header, footer, nav, noscript, .ads, .sidebar, .comments, iframe').remove();
      
      // Try to find the recipe specific content first
      const recipeContainer = $('.wprm-recipe-container, .recipe-content, .recipe, article').first();
      const contentText = recipeContainer.length > 0 ? recipeContainer.text() : $('body').text();
      const cleanedContent = contentText.replace(/\s\s+/g, ' ').trim().slice(0, 12000);

      const pageTitle = $('title').text().split('|')[0].trim() || $('h1').first().text().trim() || "Imported Recipe";
      const sourceName = new URL(input.url).hostname;
      
      const prompt = `Extract recipe data from this text. 
      Text: ${cleanedContent}
      Return ONLY a JSON object with:
      title (string), description (string), mealType ("lunch", "dinner", or "both"), prepTimeMinutes (number), cookTimeMinutes (number), 
      ingredients (array of {raw: string, normalized: string, quantity: number|null, unit: string|null}), instructions (string).`;
      
      let recipeData: any = null;
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a helpful assistant that extracts recipe data from text into clean JSON." },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" }
        });
        recipeData = JSON.parse(completion.choices[0].message.content || "{}");
      } catch (e) {
        console.error("AI Extraction failed:", e);
      }

      const finalTitle = recipeData?.title || pageTitle || "Imported Recipe";
      
      let extractedIngredients: any[] = [];
      if (recipeData && Array.isArray(recipeData.ingredients)) {
        extractedIngredients = recipeData.ingredients.map((i: any) => ({
          ingredient_name_raw: i.raw || (typeof i === 'string' ? i : "Ingredient"),
          ingredient_name_normalized: i.normalized || i.raw || (typeof i === 'string' ? i : "Ingredient"),
          quantity: typeof i.quantity === 'number' ? i.quantity : null,
          unit: i.unit || null,
          optional_boolean: false,
          preparation_note: null
        }));
      }

      const recipe = await storage.createRecipe({
        title: finalTitle,
        description: recipeData?.description || "",
        sourceUrl: input.url,
        sourceName,
        sourceType: "imported",
        ingredients: extractedIngredients,
        instructions: recipeData?.instructions || "No instructions found.",
        isApproved: true,
        mealType: recipeData?.mealType || "both",
        prepTimeMinutes: recipeData?.prepTimeMinutes || null,
        cookTimeMinutes: recipeData?.cookTimeMinutes || null,
        totalTimeMinutes: (recipeData?.prepTimeMinutes || 0) + (recipeData?.cookTimeMinutes || 0) || null
      });

      console.log(`Successfully imported: ${recipe.title}`);
      res.status(200).json(recipe);
    } catch (err) {
      console.error("Import error details:", err);
      res.status(500).json({ message: "Failed to import recipe. The site might be blocking access or content is too complex." });
    }
  });

  // Discover recipes
  app.post(api.recipes.discover.path, async (req, res) => {
    try {
      const approvedRecipes = await storage.getRecipes(true);
      
      // Extract preferences from existing recipes
      const cuisines = [...new Set(approvedRecipes.map(r => r.cuisine).filter(Boolean))];
      const proteins = [...new Set(approvedRecipes.map(r => r.proteinType).filter(Boolean))];
      const titles = approvedRecipes.map(r => r.title);

      // Infer style from recipe titles
      const styleClues = titles.slice(0, 15).join(', ');
      
      const prompt = `You are a recipe discovery engine. Based on a user's existing recipe collection, suggest 3 NEW popular, highly-rated recipes they would love.

User's existing recipes: ${styleClues || 'None yet - suggest popular weeknight dinners'}
Cuisines they enjoy: ${cuisines.join(', ') || 'variety'}
Proteins they use: ${proteins.join(', ') || 'chicken, beef, pork, fish'}

Rules:
- Suggest POPULAR recipes that are widely loved (think recipes that would have 4.3+ star ratings on major cooking sites)
- Each suggestion must be DIFFERENT from what the user already has
- Include a mix of weeknight dinners and lunch/versatile options
- Keep ingredients practical and accessible
- Each recipe should be flavorful, simple enough for a home cook, and meal-prep friendly

Return ONLY a JSON object with a "suggestions" array of 3 recipes. Each recipe should have:
title, description, mealType ("lunch", "dinner", or "both"), cuisine, proteinType, prepTimeMinutes, cookTimeMinutes, 
ingredients (array of strings like "2 cloves garlic, minced"), instructions (step-by-step string), 
discoveryReason (why this fits the user's taste, 1 sentence)`;
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a helpful recipe recommendation assistant. Always return valid JSON." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      });
      
      const data = JSON.parse(completion.choices[0].message.content || "{}");
      const suggestions = data.suggestions || [data];
      
      // Delete any old unreviewed suggestions to keep things fresh
      const oldUnreviewed = await storage.getRecipes(false);
      for (const old of oldUnreviewed) {
        await storage.deleteRecipe(old.id);
      }

      // Save all new suggestions
      const savedSuggestions = await Promise.all(suggestions.map(async (s: any) => {
        return storage.createRecipe({
          title: s.title || "Suggested Recipe",
          description: s.description || "",
          sourceType: "web",
          mealType: s.mealType || "dinner",
          cuisine: s.cuisine || cuisines[0] || "International",
          proteinType: s.proteinType || proteins[0] || "Various",
          prepTimeMinutes: s.prepTimeMinutes || 15,
          cookTimeMinutes: s.cookTimeMinutes || 30,
          ingredients: (s.ingredients || []).map((i: string) => ({
            ingredient_name_raw: i,
            ingredient_name_normalized: i,
            quantity: null,
            unit: null,
            optional_boolean: false,
            preparation_note: null
          })),
          instructions: s.instructions || "",
          isApproved: false,
          discoveryScore: Math.floor(Math.random() * 15) + 85,
          discoveryReason: s.discoveryReason || `Matches your taste for ${s.cuisine || 'flavorful cooking'}`
        });
      }));
      
      res.status(200).json(savedSuggestions);
    } catch (err) {
      console.error("Discover error:", err);
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

      // Instead of always creating a new plan, we can reuse or replace
      // For now, let's just make sure the generation is robust
      const plan = await storage.createWeeklyPlan({
        startDate: new Date(),
        lunchesCount: input.lunchesCount,
        dinnersCount: input.dinnersCount,
        servingsPerMeal: input.servingsPerMeal
      });

      const usedInPlan: number[] = [];

      // Logic for picking recipes with leftover/simple meal support
      const pickRecipe = (type: string, dayIndex: number) => {
        // Leftover logic: 30% chance of leftovers for lunch if dinner was cooked yesterday
        if (type === 'lunch' && dayIndex > 0 && Math.random() < 0.3) {
          const leftoverRecipe = allRecipes.find(r => r.title === "Leftovers");
          if (leftoverRecipe) return leftoverRecipe;
        }

        // 20% chance of a "Simple Meal" 
        if (Math.random() < 0.2) {
          const simple = allRecipes.find(r => 
            r.title.toLowerCase().includes("chicken thighs") || 
            r.title.toLowerCase().includes("simple") ||
            r.title.toLowerCase().includes("roasted")
          );
          if (simple) return simple;
        }

        let suitable = allRecipes.filter(r => 
          (r.mealType === type || r.mealType === 'both') && 
          !usedInPlan.includes(r.id) &&
          r.title !== "Leftovers"
        );
        
        // If we ran out of unique recipes, relax the constraint
        if (suitable.length === 0) {
          suitable = allRecipes.filter(r => 
            (r.mealType === type || r.mealType === 'both') && 
            r.title !== "Leftovers"
          );
        }
        
        const picked = suitable.length > 0 ? suitable[Math.floor(Math.random() * suitable.length)] : allRecipes[0];
        if (picked.id !== -1 && picked.title !== "Leftovers") usedInPlan.push(picked.id);
        return picked;
      };

      const mealPromises = [];
      const planLunches = [];
      const planDinners = [];

      // 1. Generate Dinners first so we can plan leftovers
      for (let i = 0; i < input.dinnersCount; i++) {
        const recipe = pickRecipe('dinner', i);
        planDinners.push(recipe);
      }

      // 2. Generate Lunches with explicit leftover rule
      for (let i = 0; i < input.lunchesCount; i++) {
        // If there was a dinner the night before (i-1), 70% chance this lunch is its leftovers
        if (i > 0 && i <= planDinners.length && Math.random() < 0.7) {
          const leftoverRecipe = allRecipes.find(r => r.title === "Leftovers");
          if (leftoverRecipe) {
            planLunches.push(leftoverRecipe);
            continue;
          }
        }
        
        const recipe = pickRecipe('lunch', i);
        planLunches.push(recipe);
      }

      // 3. Save all meals
      for (const recipe of planLunches) {
        mealPromises.push(storage.createWeeklyPlanMeal({
          weeklyPlanId: plan.id,
          recipeId: recipe.id,
          mealType: 'lunch'
        }));
      }

      for (const recipe of planDinners) {
        mealPromises.push(storage.createWeeklyPlanMeal({
          weeklyPlanId: plan.id,
          recipeId: recipe.id,
          mealType: 'dinner'
        }));
      }

      await Promise.all(mealPromises);

      const completePlan = await storage.getWeeklyPlan(plan.id);
      res.status(201).json(completePlan);
    } catch (err) {
      console.error("Generation error:", err);
      res.status(500).json({ message: "Failed to generate plan" });
    }
  });

  app.delete(api.weeklyPlans.delete.path, async (req, res) => {
    try {
      await storage.deleteWeeklyPlan(Number(req.params.id));
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete weekly plan" });
    }
  });

  // Swap a meal
  app.post(api.weeklyPlans.regenerateMeal.path, async (req, res) => {
    try {
      const mealId = Number(req.params.id);
      
      const planWithMeals = await storage.getWeeklyPlanByMealId(mealId);
      if (!planWithMeals) return res.status(404).json({ message: "Meal or Plan not found" });

      const meal = planWithMeals.meals.find(m => m.id === mealId);
      if (!meal) return res.status(404).json({ message: "Meal not found" });

      const allRecipes = await storage.getRecipes(true);
      const usedRecipeIds = planWithMeals.meals.map(m => m.recipeId);
      
      const suitableRecipes = allRecipes.filter(r => 
        (r.mealType === meal.mealType || r.mealType === 'both') && 
        !usedRecipeIds.includes(r.id) &&
        r.title !== "Leftovers"
      );
      
      const fallbackRecipes = allRecipes.filter(r => 
        (r.mealType === meal.mealType || r.mealType === 'both') &&
        r.title !== "Leftovers"
      );

      const candidates = suitableRecipes.length > 0 ? suitableRecipes : fallbackRecipes;
      
      if (candidates.length > 0) {
        const newRecipe = candidates[Math.floor(Math.random() * candidates.length)];
        const updated = await storage.updateWeeklyPlanMeal(mealId, {
          recipeId: newRecipe.id
        });
        return res.json(updated);
      }
      
      res.json(meal);
    } catch (err) {
      console.error("Swap error:", err);
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
  try {
    const existingRecipes = await storage.getRecipes();
    const hasLeftovers = existingRecipes.some(r => r.title === "Leftovers");
    
    if (!hasLeftovers) {
      await storage.createRecipe({
        title: "Leftovers",
        description: "Enjoy leftovers from a previous meal.",
        sourceType: "manual",
        mealType: "both",
        ingredients: [],
        instructions: "Reheat and enjoy!",
        isApproved: true
      });
    }

    const hasSimple = existingRecipes.some(r => r.title.includes("Simple Roasted Chicken"));
    if (!hasSimple) {
      await storage.createRecipe({
        title: "Simple Roasted Chicken & Sweet Potatoes",
        description: "A healthy, easy meal with minimal cleanup.",
        sourceType: "manual",
        mealType: "dinner",
        cuisine: "American",
        prepTimeMinutes: 10,
        cookTimeMinutes: 40,
        defaultServings: 2,
        ingredients: [
          { ingredient_name_raw: "4 chicken thighs", ingredient_name_normalized: "chicken thighs", quantity: 4, unit: "pcs", optional_boolean: false, preparation_note: null },
          { ingredient_name_raw: "2 sweet potatoes", ingredient_name_normalized: "sweet potatoes", quantity: 2, unit: "large", optional_boolean: false, preparation_note: "cubed" },
          { ingredient_name_raw: "1 head broccoli", ingredient_name_normalized: "broccoli", quantity: 1, unit: "head", optional_boolean: false, preparation_note: "florets" }
        ],
        instructions: "1. Toss chicken and veggies in olive oil, salt, and pepper.\n2. Roast at 400°F for 35-40 minutes.",
        isApproved: true
      });
    }

    const existingStaples = await storage.getPantryStaples();
    if (existingStaples.length <= 2) {
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
  } catch (e) {
    console.error("Seeding error:", e);
  }
}
