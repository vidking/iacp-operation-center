// Shared browser scheduler: single flight, visibility pause and bounded read backoff.
const flights = new Map<string, Promise<unknown>>();
export function singleFlight<T>(
  key: string,
  run: () => Promise<T>,
): Promise<T> {
  const previous = flights.get(key);
  if (previous) return previous as Promise<T>;
  const promise = run();
  flights.set(key, promise);
  void promise
    .finally(() => {
      if (flights.get(key) === promise) flights.delete(key);
    })
    .catch(() => {});
  return promise;
}
export function scheduleReads(options: {
  key: string;
  enabled: () => boolean;
  interval: () => number;
  read: () => Promise<boolean>;
  visible?: () => boolean;
}) {
  let stopped = false,
    failures = 0,
    timer: ReturnType<typeof setTimeout>;
  const tick = () => {
    if (stopped) return;
    timer = setTimeout(
      async () => {
        if (stopped) return;
        if (
          options.enabled() &&
          (options.visible?.() ?? document.visibilityState === "visible")
        ) {
          try {
            const success = await singleFlight(options.key, options.read);
            failures = success ? 0 : Math.min(failures + 1, 5);
          } catch {
            failures = Math.min(failures + 1, 5);
          }
        }
        tick();
      },
      Math.min(60000, options.interval() * 2 ** failures),
    );
  };
  tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
