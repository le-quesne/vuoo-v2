import type { ReactNode } from 'react';

interface IntegrationCardProps {
  icon: ReactNode;
  iconBgClassName: string;
  title: string;
  description: string;
  active?: boolean;
  activeLabel?: string;
  action: ReactNode;
}

/**
 * Tamaño fijo compartido por todas las tarjetas de integración (E-commerce, API,
 * y las que se agreguen a futuro) para que midan lo mismo sin importar el largo
 * de la descripción. `line-clamp-4` + `min-h` reservan el mismo alto de texto
 * siempre; el botón queda anclado abajo vía `mt-auto`.
 */
export function IntegrationCard({
  icon,
  iconBgClassName,
  title,
  description,
  active,
  activeLabel,
  action,
}: IntegrationCardProps) {
  return (
    <div className="relative flex flex-col h-72 rounded-2xl border border-gray-200 bg-white p-5 hover:border-gray-300 transition-colors">
      {active && (
        <span
          className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full bg-green-500"
          title={activeLabel}
        />
      )}
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${iconBgClassName}`}>
        {icon}
      </div>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-500 mt-1 min-h-[3.75rem] line-clamp-4">{description}</p>
      <div className="mt-auto pt-4">{action}</div>
    </div>
  );
}
