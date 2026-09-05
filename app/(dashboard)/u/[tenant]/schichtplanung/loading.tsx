import { SkeletonBlock, SkeletonCard } from "@/components/Skeleton";

export default function SchichtplanungLoading() {
  return (
    <div>
      <div className="mb-[30px]">
        <SkeletonBlock className="mb-3 h-3 w-24" />
        <SkeletonBlock className="h-9 w-64" />
      </div>
      <SkeletonCard lines={10} />
    </div>
  );
}
