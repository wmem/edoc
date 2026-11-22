// 有限等差区间的精确重叠判定：使用 floor-sum，不枚举数组实例。
const floor = (a: bigint, b: bigint) => a >= 0n ? a / b : -((-a + b - 1n) / b);
const ceil = (a: bigint, b: bigint) => -floor(-a, b);
function floorSum(n: bigint, m: bigint, a: bigint, b: bigint) {
  let answer = 0n;
  for (;;) {
    if (a >= m) {
      answer += (n - 1n) * n * (a / m) / 2n;
      a %= m;
    }
    if (b >= m) {
      answer += n * (b / m);
      b %= m;
    }
    const y = a * n + b;
    if (y < m) return answer;
    n = y / m;
    b = y % m;
    [m, a] = [a, m];
  }
}
export type RepeatedInterval = {
  start: bigint;
  span: bigint;
  count: bigint;
  stride: bigint;
};
export function intervalsOverlap(a: RepeatedInterval, b: RepeatedInterval) {
  if (a.span === 0n || b.span === 0n) return false;
  const pairs = (threshold: bigint) => {
    const step = a.count === 1n ? 1n : a.stride,
      m = b.count === 1n ? 1n : b.stride,
      c = threshold + a.start - b.start;
    const clamp = (n: bigint) => n < 0n ? 0n : n > a.count ? a.count : n;
    const lo = clamp(ceil(-c, step)),
      hi = clamp(ceil((b.count - 1n) * m - c, step));
    const middle = hi > lo ? floorSum(hi - lo, m, step, c + lo * step) + (hi - lo) : 0n;
    return middle + (a.count - hi) * b.count;
  };
  return pairs(a.span - 1n) > pairs(-b.span);
}
