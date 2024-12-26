/* global describe, test, expect */

const yahe = require('./yahe');

const hintCharData = [
  ['abcdefghijklmnopqrstuvwxyz'],
  ['bziureqko'],
  ['fdjkghslrueicnxmowabzpt'],
];

describe.each(hintCharData)('HintIdGenerator: %s', (hintChars) => {
  const hig = new yahe.HintIdGenerator(hintChars);

  const allGeneratedHints = (() => {
    const generator = hig.start();
    return Array(hintChars.length * hintChars.length)
      .fill(0)
      .map(() => generator());
  })();

  test(`generates the first ${hintChars.length} characters in expected order`, () => {
    expect(allGeneratedHints.slice(0, hintChars.length)).toEqual([
      ...hintChars,
    ]);
  });

  test.each(
    [...Array(hintChars.length).keys()]
      .slice(1)
      .map((n) => [
        n,
        hintChars[n - 1],
        allGeneratedHints.slice(
          hintChars.length * n,
          (hintChars.length + 1) * n,
        ),
      ]),
  )('Generation %d has letter "%s" as the prefix', (n, prefix, hints) => {
    hints.forEach((hint) => {
      expect(hint.startsWith(prefix)).toBe(true);
    });
  });
});
