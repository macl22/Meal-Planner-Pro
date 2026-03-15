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
      
      const cuisines = [...new Set(approvedRecipes.map(r => r.cuisine).filter(Boolean))];
      const proteins = [...new Set(approvedRecipes.map(r => r.proteinType).filter(Boolean))];
      const titles = approvedRecipes.map(r => r.title);

      const keyIngredients = [...new Set(
        approvedRecipes
          .flatMap(r => {
            const ingredients = r.ingredients as any[];
            return (ingredients || []).map((i: any) => {
              const raw = typeof i === 'string' ? i : (i.ingredient_name_normalized || i.ingredient_name_raw || '');
              return raw.replace(/^\d[\d\/\s]*(?:cup|tbsp|tsp|oz|lb|g|ml|clove|bunch|can|piece|slice|pinch|dash)s?\b\s*/i, '').replace(/,.*$/, '').trim().toLowerCase();
            }).filter((name: string) => name.length > 2);
          })
      )].slice(0, 25);

      const sampleIngredientContext = keyIngredients.length > 0
        ? `Key ingredients they cook with: ${keyIngredients.join(', ')}`
        : '';

      const styleClues = titles.slice(0, 15).join(', ');
      
      const prompt = `Based on this home cook's recipe collection, suggest 3 NEW recipes they'd genuinely crave making on a weeknight.

USER'S COOKING PROFILE:
Existing recipes: ${styleClues || 'None yet - suggest exciting weeknight dinners'}
Cuisines they enjoy: ${cuisines.join(', ') || 'variety'}
Proteins they use: ${proteins.join(', ') || 'chicken, beef, pork, fish, tofu'}
${sampleIngredientContext}

REQUIREMENTS — every suggestion MUST satisfy ALL of these:
1. FAST: Total time (prep + cook) must be 45 minutes or under. No exceptions. Most should be 30 minutes or less.
2. BOLD FLAVOR: Every recipe needs a punch — think caramelized edges, punchy sauces, fresh herbs, toasted spices, acid brightness, umami depth. No bland food. No plain steamed anything.
3. NUTRITIOUS: Lean protein + at least one vegetable in every dish. Whole grains and legumes welcome. No beige-only plates.
4. GLOBALLY INSPIRED: Draw from real cuisines worldwide — Thai, Mexican, Mediterranean, Korean, Japanese, Indian, Middle Eastern, West African, Peruvian, etc. No generic "stir fry" or "grain bowl" without real culinary identity.
5. HOME-COOK ACCESSIBLE: Ingredients available at a regular grocery store. Techniques a confident beginner can handle.
6. CRAVE-WORTHY: These should be meals people get excited about, not dutiful health food. Think "restaurant-quality flavor, home-kitchen effort."
7. DIFFERENT from the user's existing recipes — no duplicates or obvious variations.

ANTI-PATTERNS to avoid:
- Sad salads, plain grain bowls, unseasoned chicken + rice
- Anything that tastes like "diet food" or "meal prep bro food"
- Overly fussy plating or cheffy techniques
- Recipes that rely on a single condiment for all flavor

Return ONLY a JSON object with a "suggestions" array of 3 recipes. Each recipe must have:
title, description (1-2 sentences emphasizing what makes it delicious), mealType ("lunch", "dinner", or "both"), cuisine, proteinType, prepTimeMinutes, cookTimeMinutes, 
ingredients (array of strings like "2 cloves garlic, minced"), instructions (step-by-step string), 
discoveryReason (why this fits the user's taste AND why it's exciting, 1 sentence)`;
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a world-class chef who specializes in making healthy food taste absolutely amazing. You believe nutritious cooking should be vibrant, bold, and crave-worthy — never bland or punishing. You draw on global cuisines and restaurant techniques adapted for the home kitchen. You always keep weeknight reality in mind: 45 minutes max, grocery-store ingredients, minimal cleanup. Always return valid JSON." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      });
      
      const data = JSON.parse(completion.choices[0].message.content || "{}");
      let suggestions = data.suggestions || [data];

      const MAX_TOTAL_TIME = 45;
      suggestions = suggestions
        .map((s: any) => {
          let prep = Number(s.prepTimeMinutes);
          let cook = Number(s.cookTimeMinutes);
          if (!Number.isFinite(prep) || prep < 0) prep = 10;
          if (!Number.isFinite(cook) || cook < 0) cook = 20;
          if (prep + cook > MAX_TOTAL_TIME) {
            s.timeCapped = true;
            const ratio = prep / (prep + cook);
            prep = Math.round(MAX_TOTAL_TIME * ratio);
            cook = MAX_TOTAL_TIME - prep;
          }
          s.prepTimeMinutes = prep;
          s.cookTimeMinutes = cook;
          return s;
        })
        .filter((s: any) => s.prepTimeMinutes + s.cookTimeMinutes <= MAX_TOTAL_TIME);
      
      const oldUnreviewed = await storage.getRecipes(false);
      for (const old of oldUnreviewed) {
        await storage.deleteRecipe(old.id);
      }

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
          discoveryReason: (s.discoveryReason || `Matches your taste for ${s.cuisine || 'flavorful cooking'}`) + (s.timeCapped ? ' (time adjusted to fit 45-min limit)' : '')
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

      const pickRecipe = (type: string) => {
        let suitable = allRecipes.filter(r => 
          (r.mealType === type || r.mealType === 'both') && 
          !usedInPlan.includes(r.id) &&
          r.title !== "Leftovers"
        );
        
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

      const leftoverRecipe = allRecipes.find(r => r.title === "Leftovers");

      const planLunches = [];
      const planDinners = [];

      for (let i = 0; i < input.dinnersCount; i++) {
        if (i % 2 === 1 && leftoverRecipe) {
          planDinners.push(leftoverRecipe);
        } else {
          planDinners.push(pickRecipe('dinner'));
        }
      }

      for (let i = 0; i < input.lunchesCount; i++) {
        if (i % 2 === 1 && leftoverRecipe) {
          planLunches.push(leftoverRecipe);
        } else {
          planLunches.push(pickRecipe('lunch'));
        }
      }

      for (const recipe of planLunches) {
        await storage.createWeeklyPlanMeal({
          weeklyPlanId: plan.id,
          recipeId: recipe.id,
          mealType: 'lunch'
        });
      }

      for (const recipe of planDinners) {
        await storage.createWeeklyPlanMeal({
          weeklyPlanId: plan.id,
          recipeId: recipe.id,
          mealType: 'dinner'
        });
      }

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
