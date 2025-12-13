import { Spinner } from "@/components/ui/spinner";

export default function LoadingScreen() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Spinner className="h-8 w-8 text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">Loading Ikamba AI...</p>
      </div>
    </div>
  );
}
