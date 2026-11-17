import { domAnimation, LazyMotion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

// LazyMotion carrega só o pacote domAnimation (componentes `m.*`; `strict` barra o `motion.*` completo).
// reducedMotion="user": com prefers-reduced-motion, transforms e layout não animam.
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
