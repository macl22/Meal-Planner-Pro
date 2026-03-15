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

  // Shared AI extraction helper
  async function extractRecipeFromText(text: string, title?: string): Promise<any> {
    const prompt = `Extract recipe data from this text.
Text: ${text.slice(0, 12000)}
Return ONLY a JSON object with:
title (string), description (string), mealType ("lunch", "dinner", or "both"), prepTimeMinutes (number), cookTimeMinutes (number),
ingredients (array of {raw: string, normalized: string, quantity: number|null, unit: string|null}), instructions (string),
hasRealInstructions (boolean — set to true ONLY if the text contains actual step-by-step cooking instructions. Set to false if the instructions are missing, empty, or just placeholder/redirect text like "visit my site", "link in bio", "full recipe on my page", "in my pro file", "check the link", or similar non-cooking content).
${title ? `If no recipe name is explicitly stated, use: "${title}"` : `If no recipe name is explicitly stated, synthesize a short descriptive title from the main ingredients and cooking method (e.g. "Garlic Butter Salmon", "Crispy Tofu Stir Fry"). Never use "Imported Recipe" as the title.`}`;
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant that extracts recipe data from text into clean JSON. Always provide a descriptive recipe title." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });
    return JSON.parse(completion.choices[0].message.content || "{}");
  }

  const PLACEHOLDER_PATTERNS = [
    /\bvisit\s+(my|the|our)\s+(site|website|blog|page)\b/i,
    /\blink\s+in\s+(bio|profile|description)\b/i,
    /\b(in|on)\s+(my|the)\s+pro\s*(file)?\b/i,
    /\bfull\s+(recipe|instructions?|details?)\s+(on|at|in)\s+(my|the|our)\b/i,
    /\bcheck\s+(the|my)\s+(link|bio|profile|site|page)\b/i,
    /\bfind\s+(the\s+)?(full\s+)?(recipe|instructions?)\s+(on|at|in)\b/i,
    /\bsubscribe\s+(to|for)\s+(the\s+)?(full|complete)\s+(recipe|instructions?)\b/i,
    /\bno\s+instructions?\s+found\b/i,
  ];

  function hasRealInstructions(data: any): boolean {
    if (!data) return false;
    if (data.hasRealInstructions === false) return false;
    const instructions = (data.instructions || "").trim();
    if (!instructions || instructions.length < 15) return false;
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(instructions)) return false;
    }
    return true;
  }

  const NO_INSTRUCTIONS_ERROR = "This recipe could not be imported — no cooking instructions were found.";

  function buildRecipeFromExtracted(data: any, overrides: any = {}) {
    const extractedIngredients = Array.isArray(data.ingredients) ? data.ingredients.map((i: any) => ({
      ingredient_name_raw: i.raw || (typeof i === 'string' ? i : "Ingredient"),
      ingredient_name_normalized: i.normalized || i.raw || (typeof i === 'string' ? i : "Ingredient"),
      quantity: typeof i.quantity === 'number' ? i.quantity : null,
      unit: i.unit || null,
      optional_boolean: false,
      preparation_note: null
    })) : [];
    return {
      title: (data.title && data.title !== "Imported Recipe" ? data.title : null) || overrides.title || "Untitled Recipe",
      description: data.description || "",
      sourceType: "imported" as const,
      ingredients: extractedIngredients,
      instructions: data.instructions || "No instructions found.",
      isApproved: true,
      mealType: data.mealType || "both",
      prepTimeMinutes: data.prepTimeMinutes || null,
      cookTimeMinutes: data.cookTimeMinutes || null,
      totalTimeMinutes: (data.prepTimeMinutes || 0) + (data.cookTimeMinutes || 0) || null,
      ...overrides
    };
  }

  // Import recipe from URL
  app.post(api.recipes.importFromUrl.path, async (req, res) => {
    try {
      const input = api.recipes.importFromUrl.input.parse(req.body);
      console.log(`Attempting to import from: ${input.url}`);

      const isTikTok = input.url.includes('tiktok.com');
      const isInstagram = input.url.includes('instagram.com') || input.url.includes('reels');

      // ── TikTok: use the public oEmbed API to get the caption ──────
      if (isTikTok) {
        try {
          const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(input.url)}`;
          const oembedRes = await fetch(oembedUrl);
          if (!oembedRes.ok) throw new Error(`oEmbed returned ${oembedRes.status}`);
          const oembedData = await oembedRes.json() as { title?: string; author_name?: string };
          const caption = (oembedData.title || '').trim();
          if (caption.length < 20) {
            return res.status(400).json({ message: "Couldn't read the caption for this TikTok — try copying the caption and using 'Paste Text' instead." });
          }
          console.log(`TikTok oEmbed caption (${caption.length} chars): ${caption.slice(0, 80)}...`);
          const recipeData = await extractRecipeFromText(caption);
          if (!hasRealInstructions(recipeData)) {
            return res.status(422).json({ message: NO_INSTRUCTIONS_ERROR });
          }
          const recipe = await storage.createRecipe(buildRecipeFromExtracted(recipeData || {}, {
            sourceUrl: input.url,
            sourceName: 'tiktok.com',
          }));
          console.log(`Successfully imported from TikTok: ${recipe.title}`);
          return res.status(200).json(recipe);
        } catch (tikErr: any) {
          console.error("TikTok oEmbed error:", tikErr);
          return res.status(400).json({ message: "Couldn't read the caption for this TikTok — try copying the caption and using 'Paste Text' instead." });
        }
      }

      // ── Instagram: still unsupported (requires app token) ─────────
      if (isInstagram) {
        return res.status(400).json({ message: "Instagram blocks automated access. Copy the caption text and use 'Paste Text' instead." });
      }

      // ── Regular URLs: fetch HTML and extract via cheerio + AI ─────
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

      const sourceName = new URL(input.url).hostname;
      const pageTitle = $('title').text().split('|')[0].trim() || $('h1').first().text().trim() || "Imported Recipe";

      $('script, style, header, footer, nav, noscript, .ads, .sidebar, .comments, iframe').remove();
      const recipeContainer = $('.wprm-recipe-container, .recipe-content, .recipe, article').first();
      const contentText = recipeContainer.length > 0 ? recipeContainer.text() : $('body').text();
      const cleanedContent = contentText.replace(/\s\s+/g, ' ').trim().slice(0, 12000);

      let recipeData: any = null;
      try {
        recipeData = await extractRecipeFromText(cleanedContent, pageTitle);
      } catch (e) {
        console.error("AI Extraction failed:", e);
      }

      if (!hasRealInstructions(recipeData)) {
        return res.status(422).json({ message: NO_INSTRUCTIONS_ERROR });
      }

      const recipe = await storage.createRecipe(buildRecipeFromExtracted(recipeData || {}, {
        sourceUrl: input.url,
        sourceName,
      }));

      console.log(`Successfully imported: ${recipe.title}`);
      res.status(200).json(recipe);
    } catch (err) {
      console.error("Import error details:", err);
      res.status(500).json({ message: "Failed to import recipe. The site might be blocking access or content is too complex." });
    }
  });

  // Import recipe from pasted text (TikTok captions, recipe text, etc.)
  app.post('/api/recipes/import-text', async (req, res) => {
    try {
      const { text } = z.object({ text: z.string().min(10) }).parse(req.body);
      const recipeData = await extractRecipeFromText(text);
      if (!hasRealInstructions(recipeData)) {
        return res.status(422).json({ message: NO_INSTRUCTIONS_ERROR });
      }
      const recipe = await storage.createRecipe(buildRecipeFromExtracted(recipeData));
      console.log(`Imported from text: ${recipe.title}`);
      res.status(200).json(recipe);
    } catch (err) {
      console.error("Text import error:", err);
      res.status(500).json({ message: "Failed to extract recipe from text." });
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

      const plan = await storage.createWeeklyPlan({
        startDate: new Date(),
        lunchesCount: input.lunchesCount,
        dinnersCount: input.dinnersCount,
        servingsPerMeal: input.servingsPerMeal
      });

      // Categorize recipes by type
      const BAD_TITLES = ["imported recipe", "untitled recipe"];
      const isBadTitle = (r: any) => BAD_TITLES.includes((r.title || '').toLowerCase().trim());
      const fullRecipes = allRecipes.filter(r => (!r.recipeType || r.recipeType === 'full') && !isBadTitle(r));
      const simpleRecipes = allRecipes.filter(r => r.recipeType === 'simple' && !isBadTitle(r));
      const leftoverRecipe = allRecipes.find(r => r.recipeType === 'leftovers' || r.title === 'Leftovers');
      const fallbackRecipe = allRecipes.find(r => !isBadTitle(r) && r.recipeType !== 'leftovers') || allRecipes[0];

      // ── Helpers: shuffle & anti-repetition ──────────────────────────
      const shuffle = <T>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);

      // Load recently-used recipe IDs from the most recent previous plan
      // getWeeklyPlans() returns plans sorted by startDate DESC, so after
      // filtering out the just-created plan, [0] is the most recent prior one.
      const allPlans = await storage.getWeeklyPlans();
      const prevPlan = allPlans.filter(p => p.id !== plan.id)[0] || null;
      let recentRecipeIds = new Set<number>();
      if (prevPlan) {
        const prevDetail = await storage.getWeeklyPlan(prevPlan.id);
        if (prevDetail) {
          recentRecipeIds = new Set(prevDetail.meals.map(m => m.recipeId));
        }
      }

      // Sort candidates so recently-used ones go to the back, then shuffle each group
      const deprioritiseRecent = <T extends { id: number }>(arr: T[]): T[] => {
        const fresh = shuffle(arr.filter(r => !recentRecipeIds.has(r.id)));
        const recent = shuffle(arr.filter(r => recentRecipeIds.has(r.id)));
        return [...fresh, ...recent];
      };

      // ── Protein variety: guess protein type from title if not set ──
      const PROTEIN_KEYWORDS: Record<string, string[]> = {
        chicken: ['chicken', 'poultry'],
        fish: ['fish', 'salmon', 'tuna', 'cod', 'shrimp', 'prawn', 'seafood', 'mahi', 'halibut', 'tilapia', 'crab', 'lobster', 'scallop'],
        beef: ['beef', 'steak', 'burger', 'ground beef', 'meatball', 'brisket'],
        pork: ['pork', 'bacon', 'ham', 'sausage', 'chorizo'],
        vegetarian: ['tofu', 'tempeh', 'vegetarian', 'vegan', 'veggie', 'lentil', 'chickpea', 'bean', 'mushroom'],
      };

      const guessProtein = (recipe: any): string => {
        const raw = (recipe.proteinType || '').toLowerCase();
        // Normalize stored proteinType into canonical buckets
        if (raw) {
          for (const [bucket, keywords] of Object.entries(PROTEIN_KEYWORDS)) {
            if (keywords.some(kw => raw.includes(kw))) return bucket;
          }
        }
        const title = (recipe.title || '').toLowerCase();
        for (const [type, keywords] of Object.entries(PROTEIN_KEYWORDS)) {
          if (keywords.some(kw => title.includes(kw))) return type;
        }
        return 'other';
      };

      // ── Build dinner list: max 3 full recipes with protein variety ──
      const MAX_PROPER_DINNERS = 3;
      const properDinnerCount = Math.min(MAX_PROPER_DINNERS, input.dinnersCount);
      const eligibleFull = deprioritiseRecent(
        fullRecipes.filter(r => r.mealType === 'dinner' || r.mealType === 'both')
      );

      // Group by protein type, pick one per group first for diversity
      const proteinGroups: Record<string, typeof eligibleFull> = {};
      eligibleFull.forEach(r => {
        const pt = guessProtein(r);
        (proteinGroups[pt] ||= []).push(r);
      });
      const groupKeys = shuffle(Object.keys(proteinGroups));

      const pickedFull: (typeof allRecipes[0])[] = [];
      const usedIds = new Set<number>();

      // Round 1: one from each protein group (up to properDinnerCount)
      for (const gk of groupKeys) {
        if (pickedFull.length >= properDinnerCount) break;
        const candidate = proteinGroups[gk].find(r => !usedIds.has(r.id));
        if (candidate) {
          pickedFull.push(candidate);
          usedIds.add(candidate.id);
        }
      }
      // Round 2: fill remaining slots from whoever is left (already deprioritised by recency)
      for (const r of eligibleFull) {
        if (pickedFull.length >= properDinnerCount) break;
        if (!usedIds.has(r.id)) {
          pickedFull.push(r);
          usedIds.add(r.id);
        }
      }

      // Fill remaining dinner slots with simple meals (shuffled, deduplicated)
      const simpleSlotCount = Math.max(0, input.dinnersCount - pickedFull.length);
      const shuffledSimple = deprioritiseRecent(simpleRecipes).filter(r => !usedIds.has(r.id));
      const pickedSimple = shuffledSimple.slice(0, simpleSlotCount);
      pickedSimple.forEach(r => usedIds.add(r.id));

      // If not enough simple meals, fall back to more full recipes
      const extraFull: (typeof allRecipes[0])[] = [];
      if (simpleSlotCount > pickedSimple.length) {
        for (const r of eligibleFull) {
          if (extraFull.length >= simpleSlotCount - pickedSimple.length) break;
          if (!usedIds.has(r.id)) {
            extraFull.push(r);
            usedIds.add(r.id);
          }
        }
      }

      const planDinners: (typeof allRecipes[0])[] = [...pickedFull, ...pickedSimple, ...extraFull].slice(0, input.dinnersCount);
      while (planDinners.length < input.dinnersCount) planDinners.push(fallbackRecipe);

      // Build lunch list: mostly leftovers from dinners; use Leftovers placeholder every other slot
      const planLunches: (typeof allRecipes[0])[] = [];
      for (let i = 0; i < input.lunchesCount; i++) {
        planLunches.push(leftoverRecipe || fallbackRecipe);
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
      
      const BAD_SWAP_TITLES = ["imported recipe", "untitled recipe"];
      const suitableRecipes = allRecipes.filter(r => 
        (r.mealType === meal.mealType || r.mealType === 'both') && 
        !usedRecipeIds.includes(r.id) &&
        r.title !== "Leftovers" &&
        !BAD_SWAP_TITLES.includes((r.title || '').toLowerCase().trim())
      );
      
      const fallbackRecipes = allRecipes.filter(r => 
        (r.mealType === meal.mealType || r.mealType === 'both') &&
        r.title !== "Leftovers" &&
        !BAD_SWAP_TITLES.includes((r.title || '').toLowerCase().trim())
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
      // Fuzzy matching: a staple keyword matches if the ingredient name contains it or vice versa
      const stapleKeywords = staples.map(s => s.ingredientNameNormalized.toLowerCase());
      const isStapleItem = (name: string): boolean => {
        const lower = name.toLowerCase();
        return stapleKeywords.some(k => lower.includes(k) || k.includes(lower.split(' ')[0]));
      };

      const list: Record<string, { item: string, raw: string, isStaple: boolean }[]> = {
        "Produce": [],
        "Meat & Seafood": [],
        "Dairy": [],
        "Pantry": [],
        "Other": []
      };

      const seenItems = new Set<string>();

      // Collect ALL ingredients from meals (deduplicate)
      plan.meals.forEach(meal => {
        const recipe = meal.recipe;
        if (!recipe || !Array.isArray(recipe.ingredients)) return;
        // Skip Leftovers recipe placeholder
        if (recipe.title === 'Leftovers') return;

        recipe.ingredients.forEach((ing: any) => {
          const name = (ing.ingredient_name_normalized || ing.ingredient_name_raw || "").trim();
          if (!name) return;
          const key = name.toLowerCase();
          if (seenItems.has(key)) return;
          seenItems.add(key);

          const lowerName = key;
          let category = "Other";
          if (lowerName.match(/apple|banana|onion|garlic|tomato|lettuce|carrot|spinach|potato|pepper|lemon|lime|mushroom|zucchini|cucumber|celery|corn|cabbage|scallion|ginger|herb|basil|cilantro|parsley/)) {
            category = "Produce";
          } else if (lowerName.match(/chicken|beef|pork|fish|salmon|shrimp|bacon|lamb|turkey|tuna|anchovy|sausage|steak|ground|meat/)) {
            category = "Meat & Seafood";
          } else if (lowerName.match(/milk|cheese|butter|cream|yogurt|egg|mozzarella|parmesan|cheddar|feta/)) {
            category = "Dairy";
          } else if (lowerName.match(/flour|sugar|salt|oil|rice|pasta|bean|sauce|spice|can|stock|broth|vinegar|mustard|honey|noodle|bread|crumb|baking|cumin|paprika|chili|cinnamon|turmeric|curry|coriander|soy|miso|tahini/)) {
            category = "Pantry";
          }

          list[category].push({
            item: name,
            raw: ing.ingredient_name_raw || name,
            isStaple: isStapleItem(name)
          });
        });
      });

      // Remove empty categories
      Object.keys(list).forEach(k => { if (list[k].length === 0) delete list[k]; });

      // Compute ingredient savings: how many ingredient names appear in 2+ different meals
      const ingredientMealCount: Record<string, number> = {};
      plan.meals.forEach(meal => {
        const recipe = meal.recipe;
        if (!recipe || recipe.title === 'Leftovers' || !Array.isArray(recipe.ingredients)) return;
        const recipeIngredients = new Set<string>();
        (recipe.ingredients as any[]).forEach((ing: any) => {
          const name = (ing.ingredient_name_normalized || ing.ingredient_name_raw || '').toLowerCase().trim();
          if (name) recipeIngredients.add(name);
        });
        recipeIngredients.forEach(name => {
          ingredientMealCount[name] = (ingredientMealCount[name] || 0) + 1;
        });
      });
      const sharedCount = Object.values(ingredientMealCount).filter(c => c >= 2).length;
      const totalRaw = Object.values(ingredientMealCount).reduce((sum, c) => sum + c, 0);
      const savedCount = totalRaw - Object.keys(ingredientMealCount).length;

      res.json({ ...list, _optimization: { sharedCount, savedCount } });
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

    // Seed Leftovers placeholder
    if (!existingRecipes.some(r => r.title === "Leftovers")) {
      await storage.createRecipe({
        title: "Leftovers",
        description: "Reheat leftovers from last night's dinner.",
        sourceType: "manual",
        mealType: "both",
        recipeType: "leftovers",
        ingredients: [],
        instructions: "Reheat and enjoy!",
        isApproved: true
      });
    } else {
      // Backfill recipeType for existing Leftovers recipe
      const lr = existingRecipes.find(r => r.title === "Leftovers");
      if (lr && (!lr.recipeType || lr.recipeType === 'full')) {
        await storage.updateRecipe(lr.id, { recipeType: 'leftovers' });
      }
    }

    // Seed simple assembly meals (no detailed recipe needed)
    const simpleMeals = [
      {
        title: "Chicken Thighs + Sweet Potato + Broccoli",
        description: "Sheet pan dinner — season, roast, done.",
        cuisine: "American",
        prepTimeMinutes: 5,
        cookTimeMinutes: 40,
        ingredients: [
          { ingredient_name_raw: "4 chicken thighs", ingredient_name_normalized: "chicken thighs", quantity: 4, unit: "pcs", optional_boolean: false, preparation_note: null },
          { ingredient_name_raw: "2 sweet potatoes", ingredient_name_normalized: "sweet potatoes", quantity: 2, unit: "large", optional_boolean: false, preparation_note: "cubed" },
          { ingredient_name_raw: "1 head broccoli", ingredient_name_normalized: "broccoli", quantity: 1, unit: "head", optional_boolean: false, preparation_note: "florets" }
        ],
        instructions: "Toss everything in olive oil, salt, and pepper. Roast at 425°F for 35-40 min.",
      },
      {
        title: "Salmon + Asparagus + White Rice",
        description: "Quick weeknight protein with simple sides.",
        cuisine: "American",
        prepTimeMinutes: 5,
        cookTimeMinutes: 20,
        ingredients: [
          { ingredient_name_raw: "2 salmon fillets", ingredient_name_normalized: "salmon", quantity: 2, unit: "fillets", optional_boolean: false, preparation_note: null },
          { ingredient_name_raw: "1 bunch asparagus", ingredient_name_normalized: "asparagus", quantity: 1, unit: "bunch", optional_boolean: false, preparation_note: "trimmed" },
          { ingredient_name_raw: "1 cup white rice", ingredient_name_normalized: "white rice", quantity: 1, unit: "cup", optional_boolean: false, preparation_note: null }
        ],
        instructions: "Cook rice. Pan-sear salmon 3-4 min per side. Roast asparagus at 400°F for 12 min.",
      },
      {
        title: "Ground Beef + Roasted Potatoes + Green Beans",
        description: "Hearty and filling, minimal prep.",
        cuisine: "American",
        prepTimeMinutes: 10,
        cookTimeMinutes: 30,
        ingredients: [
          { ingredient_name_raw: "1 lb ground beef", ingredient_name_normalized: "ground beef", quantity: 1, unit: "lb", optional_boolean: false, preparation_note: null },
          { ingredient_name_raw: "3 Yukon gold potatoes", ingredient_name_normalized: "potatoes", quantity: 3, unit: "medium", optional_boolean: false, preparation_note: "cubed" },
          { ingredient_name_raw: "2 cups green beans", ingredient_name_normalized: "green beans", quantity: 2, unit: "cups", optional_boolean: false, preparation_note: "trimmed" }
        ],
        instructions: "Roast potatoes at 425°F for 25 min. Cook beef in pan with garlic, salt, and pepper. Steam green beans.",
      },
    ];

    for (const meal of simpleMeals) {
      if (!existingRecipes.some(r => r.title === meal.title)) {
        await storage.createRecipe({
          ...meal,
          sourceType: "manual",
          mealType: "dinner",
          recipeType: "simple",
          defaultServings: 2,
          isApproved: true,
          totalTimeMinutes: (meal.prepTimeMinutes || 0) + (meal.cookTimeMinutes || 0)
        });
      }
    }

    // Ensure essential pantry staples always exist
    const existingStaples = await storage.getPantryStaples();
    const essentialStaples = [
      "salt", "pepper", "black pepper", "olive oil", "vegetable oil",
      "sugar", "soy sauce", "butter", "garlic", "onion",
      "flour", "rice", "chicken broth", "honey", "vinegar",
      "cumin", "paprika", "chili flakes", "eggs", "milk"
    ];
    for (const name of essentialStaples) {
      if (!existingStaples.find(s => s.ingredientNameNormalized === name)) {
        await storage.createPantryStaple({
          ingredientNameNormalized: name,
          alwaysHave: true,
          currentlyInStock: true
        }).catch(() => {}); // Ignore unique constraint errors
      }
    }
  } catch (e) {
    console.error("Seeding error:", e);
  }
}
