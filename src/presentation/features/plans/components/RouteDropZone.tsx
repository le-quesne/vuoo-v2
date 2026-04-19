import { useDroppable } from '@dnd-kit/core';

interface RouteDropZoneProps {
  id: string;
  children: React.ReactNode;
}

export function RouteDropZone({ id, children }: RouteDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`px-3 pb-3 pt-1 space-y-1 min-h-[12px] transition-colors ${isOver ? 'bg-blue-50/50' : ''}`}
    >
      {children}
    </div>
  );
}
