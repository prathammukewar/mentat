import { describe, expect, it } from 'vitest';
import { isProvisional, rate } from '../../core/glicko2.ts';

describe('Glicko-2', () => {
  it("reproduces Glickman's worked example", () => {
    const next = rate({ rating: 1500, rd: 200, volatility: 0.06 }, [
      { opponent: { rating: 1400, rd: 30 }, score: 1 },
      { opponent: { rating: 1550, rd: 100 }, score: 0 },
      { opponent: { rating: 1700, rd: 300 }, score: 0 },
    ]);
    // The paper rounds its intermediate values and prints 1464.06 and
    // 151.52. Exact arithmetic gives 1464.0507 and 151.5165.
    expect(Math.abs(next.rating - 1464.06)).toBeLessThan(0.01);
    expect(Math.abs(next.rd - 151.52)).toBeLessThan(0.01);
    expect(Math.abs(next.volatility - 0.05999)).toBeLessThan(0.00001);
  });

  it('grows RD when no games are played, capped at 350', () => {
    const next = rate({ rating: 1700, rd: 100, volatility: 0.06 }, []);
    expect(next.rating).toBe(1700);
    expect(next.rd).toBeGreaterThan(100);
    expect(rate({ rating: 1500, rd: 349, volatility: 0.5 }, []).rd).toBe(350);
  });

  it('moves a new player a lot and an established one a little', () => {
    const win = [{ opponent: { rating: 1500, rd: 60 }, score: 1 }];
    const fresh = rate({ rating: 1500, rd: 350, volatility: 0.06 }, win);
    const settled = rate({ rating: 1500, rd: 50, volatility: 0.06 }, win);
    expect(fresh.rating - 1500).toBeGreaterThan(150);
    expect(settled.rating - 1500).toBeLessThan(15);
  });

  it('counts a high-RD opponent for less', () => {
    const me = { rating: 1500, rd: 80, volatility: 0.06 };
    const vsSure = rate(me, [{ opponent: { rating: 1500, rd: 50 }, score: 1 }]);
    const vsGhost = rate(me, [{ opponent: { rating: 1500, rd: 200 }, score: 1 }]);
    expect(vsGhost.rating - 1500).toBeLessThan(vsSure.rating - 1500);
    expect((vsGhost.rating - 1500) / (vsSure.rating - 1500)).toBeGreaterThan(0.6);
  });

  it('marks RD above 110 as provisional', () => {
    expect(isProvisional({ rd: 111 })).toBe(true);
    expect(isProvisional({ rd: 110 })).toBe(false);
  });
});
