interface SectionHeaderProps {
  icon?: React.ReactNode;
  label: string;
}

export function SectionHeader({ icon, label }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
      {icon}
      <span>{label}</span>
    </div>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}

export function Field({ label, children, full }: FieldProps) {
  return (
    <div className={full ? 'col-span-2 space-y-1' : 'space-y-1'}>
      <label className="text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}
