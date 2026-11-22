export type SlowInput = Readonly<{
  name: string
  n: number
  make: (n: number) => string
  nested: boolean
  referenceAtLargest: boolean
}>

const input = (
  name: string,
  n: number,
  make: (n: number) => string,
  options: Partial<Pick<SlowInput, 'nested' | 'referenceAtLargest'>> = {},
): SlowInput => ({
  name,
  n,
  make,
  nested: false,
  referenceAtLargest: true,
  ...options,
})

const repeated = (text: string, count: number): string => text.repeat(count)

export const slowInputs: ReadonlyArray<SlowInput> = [
  input('unclosed pointy destinations', 5_000, n => repeated('[a](<b', n)),
  input('unclosed comments after </', 5_000, n => `</${repeated('<!--', n)}`),
  input(
    'block quote markers on one line',
    1_250,
    n => `${repeated('>', n)} a\n`,
    { nested: true },
  ),
  input(
    'definitions, then a use of the first and the last',
    5_000,
    n =>
      `${Array.from({ length: n }, (_, index) => `[l${index}]: /u${index}`).join('\n')}\n\n[l0] [l${n - 1}]\n`,
  ),
  input(
    'a run of *, a letter, a run of *',
    1_250,
    n => `${repeated('*', n)}a${repeated('*', n)}`,
    { nested: true },
  ),
  input('backtick runs of growing length with no closer', 5_000, n =>
    Array.from(
      { length: n },
      (_, index) => `a${repeated('`', 1 + (index % 64))}`,
    ).join(''),
  ),
  input(
    'one run of n backticks, then a and one backtick',
    5_000,
    n => `${repeated('`', n)}a\``,
  ),
  input(
    'nested list markers, then blank lines',
    5_000,
    n => `${repeated('- ', Math.min(n, 2_000))}a\n${repeated('\n', n)}`,
    { nested: true },
  ),
  input(
    'nested brackets',
    5_000,
    n => `${repeated('[', n)}a${repeated(']', n)}`,
  ),
  input(
    'unclosed brackets before links',
    5_000,
    n => `${repeated('[', n)}${repeated('[a](b)', n)}`,
    { referenceAtLargest: false },
  ),
  input('alternating openers *a _b', 5_000, n => repeated('*a _b ', n)),
  input('unclosed quoted attribute values', 5_000, n => repeated('<a b="', n)),
  input(
    'links opened inside link destinations',
    5_000,
    n => `${repeated('[a](', n)}${repeated(')', n)}`,
  ),
  input('entity-like runs', 5_000, n => repeated('&a', n)),
  input(
    'a lazy line under deep quotes',
    5_000,
    n => `${repeated('>', Math.min(n, 2_000))} a\n${repeated('b\n', n)}`,
    { nested: true },
  ),
]
