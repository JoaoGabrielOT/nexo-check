import { cn } from '../lib/cn';
import { DecorativePills } from './DecorativePills';

// Camada fixa atrás do conteúdo (que usa relative z-10). Claro: grão + pílulas da marca.
// Escuro: manchas radiais mescladas + grão (ver --wallpaper no theme.css), sem pílulas.
export function Wallpaper({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('bg-wallpaper pointer-events-none fixed inset-0 z-0', className)}
    >
      <DecorativePills className="dark:hidden" />
    </div>
  );
}
