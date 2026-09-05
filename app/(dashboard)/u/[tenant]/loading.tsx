import { SkeletonBlock, SkeletonCardGrid } from "@/components/Skeleton";

export default function DashboardHomeLoading() {
  return (
    <div>
      <div className="mb-[30px]">
        <SkeletonBlock className="mb-3 h-3 w-24" />
        <SkeletonBlock className="h-9 w-64" />
      </div>
      <SkeletonCardGrid count={6} />
    </div>
  );
}
