const AVATAR_COLORS = [
  '#10b981',
  '#6366f1',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#f97316',
];

interface DriverAvatarProps {
  first: string;
  last: string;
  index: number;
}

export function DriverAvatar({ first, last, index }: DriverAvatarProps) {
  const initials = `${(first[0] ?? '').toUpperCase()}${(last[0] ?? '').toUpperCase()}`;
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
