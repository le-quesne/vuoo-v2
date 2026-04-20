const AVATAR_COLORS = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#f97316',
];

interface VehicleAvatarProps {
  name: string;
  index: number;
}

export function VehicleAvatar({ name, index }: VehicleAvatarProps) {
  const initials = name
    .split(/[\s()]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  const color = AVATAR_COLORS[index % AVATAR_COLORS.length];
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  );
}
