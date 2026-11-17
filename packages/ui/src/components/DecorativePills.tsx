import { cn } from '../lib/cn';

// Pílulas fixas do piloto (.blob/.l1/.l2): parcialmente fora da tela e atrás do conteúdo.
const pill = 'fixed -z-10 h-[110px] w-[70px] rounded-[35px]';

export function DecorativePills({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('pointer-events-none max-sm:hidden', className)}>
      <span className={cn(pill, '-right-[30px] top-[6vh] bg-or')} />
      <span className={cn(pill, '-right-[30px] top-[28vh] bg-rd')} />
      <span className={cn(pill, '-right-[30px] top-[50vh] bg-bl')} />
      <span className={cn(pill, '-left-[30px] bottom-[6vh] bg-or')} />
      <span className={cn(pill, '-left-[30px] bottom-[calc(6vh+130px)] bg-rd')} />
    </div>
  );
}
