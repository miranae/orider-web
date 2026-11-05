/** Bound a read without altering its authorization or underlying write semantics. */
export function withReadDeadline<T>(read: Promise<T>, message: string, timeoutMs = 15_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    read.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
