import { z } from 'zod';
import { 
  insertRecipeSchema, 
  insertPantryStapleSchema, 
  insertWeeklyPlanSchema, 
  insertWeeklyPlanMealSchema,
  recipes,
  pantryStaples,
  weeklyPlans,
  weeklyPlanMeals
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  recipes: {
    list: {
      method: 'GET' as const,
      path: '/api/recipes' as const,
      input: z.object({
        search: z.string().optional(),
        isApproved: z.string().optional(), // 'true' or 'false'
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof recipes.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/recipes/:id' as const,
      responses: {
        200: z.custom<typeof recipes.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/recipes' as const,
      input: insertRecipeSchema,
      responses: {
        201: z.custom<typeof recipes.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/recipes/:id' as const,
      input: insertRecipeSchema.partial(),
      responses: {
        200: z.custom<typeof recipes.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/recipes/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    importFromUrl: {
      method: 'POST' as const,
      path: '/api/recipes/import' as const,
      input: z.object({ url: z.string().url() }),
      responses: {
        200: z.custom<typeof recipes.$inferSelect>(),
        400: errorSchemas.validation,
        500: errorSchemas.internal,
      }
    },
    importText: {
      method: 'POST' as const,
      path: '/api/recipes/import-text' as const,
      input: z.object({ text: z.string().min(10) }),
      responses: {
        200: z.custom<typeof recipes.$inferSelect>(),
        500: errorSchemas.internal,
      }
    },
    discover: {
      method: 'POST' as const,
      path: '/api/recipes/discover' as const,
      responses: {
        200: z.array(z.custom<typeof recipes.$inferSelect>()),
        500: errorSchemas.internal,
      }
    }
  },
  pantryStaples: {
    list: {
      method: 'GET' as const,
      path: '/api/pantry-staples' as const,
      responses: {
        200: z.array(z.custom<typeof pantryStaples.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/pantry-staples' as const,
      input: insertPantryStapleSchema,
      responses: {
        201: z.custom<typeof pantryStaples.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/pantry-staples/:id' as const,
      input: insertPantryStapleSchema.partial(),
      responses: {
        200: z.custom<typeof pantryStaples.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/pantry-staples/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  weeklyPlans: {
    list: {
      method: 'GET' as const,
      path: '/api/weekly-plans' as const,
      responses: {
        200: z.array(z.custom<typeof weeklyPlans.$inferSelect>()), 
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/weekly-plans/:id' as const,
      responses: {
        200: z.any(), // Returning plan + meals + recipes
        404: errorSchemas.notFound,
      },
    },
    generate: {
      method: 'POST' as const,
      path: '/api/weekly-plans/generate' as const,
      input: z.object({
        lunchesCount: z.number().min(0),
        dinnersCount: z.number().min(0),
      }),
      responses: {
        201: z.any(), // Returning plan + meals + recipes
        400: errorSchemas.validation,
      }
    },
    regenerateMeal: {
      method: 'POST' as const,
      path: '/api/weekly-plan-meals/:id/regenerate' as const,
      responses: {
        200: z.custom<typeof weeklyPlanMeals.$inferSelect>(),
        404: errorSchemas.notFound,
      }
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/weekly-plans/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      }
    },
    updateMeal: {
      method: 'PUT' as const,
      path: '/api/weekly-plan-meals/:id' as const,
      input: insertWeeklyPlanMealSchema.partial(),
      responses: {
        200: z.custom<typeof weeklyPlanMeals.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      }
    },
    shoppingList: {
      method: 'GET' as const,
      path: '/api/weekly-plans/:id/shopping-list' as const,
      responses: {
        200: z.any(), // Grouped shopping list: { category: { item: quantity } }
        404: errorSchemas.notFound,
      }
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
