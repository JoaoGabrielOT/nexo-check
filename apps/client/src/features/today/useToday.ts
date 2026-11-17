import { useCallback, useEffect, useState } from 'react';
import { msUntilNextLocalMidnight, toLocalDateKey } from '@nexo/shared';
import { now } from '../../db/clock';

/** Data local atual (`YYYY-MM-DD`); troca na meia-noite e ao voltar ao app. */
export function useToday(): string {
  const [date, setDate] = useState(() => toLocalDateKey(now()));
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => {
    setDate(toLocalDateKey(now()));
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    // +50 ms: o timer nunca deve disparar antes da virada.
    const timer = setTimeout(refresh, msUntilNextLocalMidnight(now()) + 50);
    return () => clearTimeout(timer);
  }, [date, tick, refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  return date;
}
