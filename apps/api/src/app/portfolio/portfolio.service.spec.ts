import { normalizeEmergencyFundValue } from './portfolio.service';

describe('PortfolioService emergency fund normalization', () => {
  it.each([
    { expected: 0, input: undefined },
    { expected: 0, input: null },
    { expected: 0, input: '' },
    { expected: 0, input: '   ' },
    { expected: 0, input: 'abc' },
    { expected: 0, input: Number.NaN },
    { expected: 1500, input: 1500 },
    { expected: 2500.5, input: '2500.5' },
    { expected: -42.75, input: '-42.75' }
  ])('normalizes $input to $expected', ({ expected, input }) => {
    expect(normalizeEmergencyFundValue(input)).toBe(expected);
  });
});
