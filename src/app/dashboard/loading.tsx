// src/app/dashboard/loading.tsx
export default function DashboardLoading() {
  return (
    <div className="p-6">
      <div className="h-8 w-1/4 animate-pulse rounded-md bg-gray-200"></div>
      <div className="mt-4 h-64 w-full animate-pulse rounded-md bg-gray-200"></div>
    </div>
  );
}