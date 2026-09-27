/** Tiny headless test harness: `test(name, fn)`, assertions, and a summary from tests/run.ts. */
type Fn = () => void | Promise<void>;
const tests: { name: string; fn: Fn; file: string }[] = [];
let currentFile = '';
export const setFile = (f: string): void => {
  currentFile = f;
};
export function test(name: string, fn: Fn): void {
  tests.push({ name, fn, file: currentFile });
}
export class AssertError extends Error {}
export function ok(cond: unknown, msg = 'expected truthy'): asserts cond {
  if (!cond) throw new AssertError(msg);
}
export function eq<T>(a: T, b: T, msg = ''): void {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) throw new AssertError(`${msg} expected ${sb}, got ${sa}`);
}
export function near(a: number, b: number, tol: number, msg = ''): void {
  if (!(Math.abs(a - b) <= tol)) throw new AssertError(`${msg} expected ${b} ± ${tol}, got ${a}`);
}
export async function runAll(filter?: string): Promise<number> {
  let fail = 0;
  let pass = 0;
  for (const t of tests) {
    if (filter && !`${t.file} ${t.name}`.includes(filter)) continue;
    const t0 = Date.now();
    try {
      await t.fn();
      pass++;
      console.log(`  ok   ${t.file} › ${t.name} (${Date.now() - t0} ms)`);
    } catch (e) {
      fail++;
      console.log(`  FAIL ${t.file} › ${t.name}\n       ${(e as Error).message}`);
      if (!(e instanceof AssertError)) console.log((e as Error).stack);
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  return fail;
}
