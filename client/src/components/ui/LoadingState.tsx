import { Loader2 } from "lucide-react";

export function LoadingState({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-muted-foreground">
      <Loader2 className="w-10 h-10 animate-spin text-primary/50" />
      <p className="font-medium animate-pulse">{message}</p>
    </div>
  );
}
