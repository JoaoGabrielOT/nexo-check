import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { cn } from '@nexo/ui';

/** QR do link de check-in; fundo branco fixo para a câmera ler também no tema escuro. */
export function QrImage({ url, alt, className }: { url: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width: 320 }).then(
      (data) => alive && setSrc(data),
      () => alive && setSrc(null),
    );
    return () => {
      alive = false;
    };
  }, [url]);
  if (!src)
    return (
      <div aria-hidden="true" className={cn('aspect-square rounded-2xl bg-white', className)} />
    );
  return (
    <img src={src} alt={alt} className={cn('aspect-square rounded-2xl bg-white p-2', className)} />
  );
}
