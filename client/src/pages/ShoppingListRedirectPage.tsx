import { useEffect } from "react";
import { useLocation } from "wouter";
import { useWeeklyPlans } from "@/hooks/use-weekly-plans";
import { Layout } from "@/components/Layout";
import { LoadingState } from "@/components/ui/LoadingState";

export default function ShoppingListRedirectPage() {
  const { data: plans, isLoading } = useWeeklyPlans();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!plans) return;
    const sorted = [...plans].sort((a: any, b: any) => b.id - a.id);
    if (sorted.length > 0) {
      setLocation(`/shopping-list/${sorted[0].id}`, { replace: true });
    }
  }, [plans, setLocation]);

  if (isLoading || (plans && plans.length > 0)) {
    return <Layout><LoadingState message="Opening shopping list..." /></Layout>;
  }

  return (
    <Layout>
      <div className="text-center py-20 text-muted-foreground">
        No weekly plan found. Create a plan first.
      </div>
    </Layout>
  );
}
