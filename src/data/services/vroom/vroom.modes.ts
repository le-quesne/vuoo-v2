import { Zap, Scale, Clock, Package, Target } from 'lucide-react';
import type { ComponentType } from 'react';
import type { OptimizationMode } from '@/data/types/database';

export interface OptimizationModeDef {
  id: OptimizationMode;
  icon: ComponentType<{ size?: number | string; className?: string }>;
  title: string;
  /**
   * Frase corta orientada al modelo de negocio del cliente.
   * Se renderiza en negrita antes de `desc`. Debe arrancar con "Útil si".
   */
  billingHint: string;
  /** Detalle de qué hace la optimización. Sin jerga técnica. */
  desc: string;
}

export const OPTIMIZATION_MODES: OptimizationModeDef[] = [
  {
    id: 'efficiency',
    icon: Zap,
    title: 'Eficiencia',
    billingHint: 'Útil si tenés flota propia o pagás por hora/km.',
    desc: 'Minimiza el costo total: menos kilómetros y menos horas, sin importar si algún vehículo queda con poca carga.',
  },
  {
    id: 'consolidate',
    icon: Package,
    title: 'Consolidar rutas',
    billingHint: 'Útil si pagás por vuelta/ruta al transportista.',
    desc: 'Usa la menor cantidad posible de vehículos. Los vehículos sobrantes quedan libres del día.',
  },
  {
    id: 'balance_stops',
    icon: Scale,
    title: 'Balancear paradas',
    billingHint: 'Útil si pagás por entrega o querés que ningún conductor cargue más que otro.',
    desc: 'Reparte una cantidad similar de paradas entre todos los vehículos disponibles.',
  },
  {
    id: 'balance_time',
    icon: Clock,
    title: 'Balancear tiempo',
    billingHint: 'Útil si querés que los conductores terminen a una hora similar (ej. viernes corto).',
    desc: 'Distribuye la jornada para que todos vuelvan al depot más o menos a la misma hora.',
  },
  {
    id: 'on_time',
    icon: Target,
    title: 'Cumplimiento de ventanas',
    billingHint: 'Útil si tenés SLA con tus clientes o ventanas horarias estrictas (farmacia, comida, B2B con multa).',
    desc: 'Prioriza llegar dentro de la ventana horaria de cada parada por sobre el costo total.',
  },
];

export function getOptimizationMode(id: OptimizationMode): OptimizationModeDef | undefined {
  return OPTIMIZATION_MODES.find((m) => m.id === id);
}
