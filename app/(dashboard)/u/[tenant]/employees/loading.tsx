import { SkeletonBlock, SkeletonRows } from "@/components/Skeleton";

export default function EmployeesLoading() {
  return (
    <div>
      <div className="mb-[30px]">
        <SkeletonBlock className="mb-3 h-3 w-24" />
        <SkeletonBlock className="h-9 w-64" />
      </div>
      <SkeletonRows rows={8} />
    </div>
  );
}
