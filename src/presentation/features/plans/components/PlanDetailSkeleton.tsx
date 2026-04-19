export function PlanDetailSkeleton() {
  return (
    <div className="flex h-screen">
      <div className="w-96 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-200 space-y-3">
          <div className="h-4 w-16 bg-gray-100 rounded animate-pulse" />
          <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
          <div className="h-6 w-40 bg-gray-200 rounded animate-pulse" />
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex gap-3">
              <div className="h-4 w-14 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-14 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-10 bg-gray-100 rounded animate-pulse" />
            </div>
            <div className="h-6 w-16 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
        <div className="flex-1 overflow-hidden p-2 space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-3 bg-white">
              <div className="flex items-start gap-2">
                <div className="w-1 self-stretch rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                  <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
                  <div className="flex gap-3">
                    <div className="h-3 w-10 bg-gray-100 rounded animate-pulse" />
                    <div className="h-3 w-12 bg-gray-100 rounded animate-pulse" />
                    <div className="h-3 w-10 bg-gray-100 rounded animate-pulse" />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                {[0, 1, 2].map((j) => (
                  <div key={j} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                    <div className="w-5 h-5 rounded-full bg-gray-200 animate-pulse" />
                    <div className="flex-1 space-y-1">
                      <div className="h-3 w-28 bg-gray-200 rounded animate-pulse" />
                      <div className="h-2.5 w-40 bg-gray-100 rounded animate-pulse" />
                    </div>
                    <div className="h-4 w-14 bg-gray-100 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-gray-200 space-y-2">
          <div className="h-9 w-full bg-gray-100 rounded-lg animate-pulse" />
          <div className="h-9 w-full bg-gray-100 rounded-lg animate-pulse" />
        </div>
      </div>
      <div className="flex-1 bg-gray-100 animate-pulse" />
    </div>
  );
}
