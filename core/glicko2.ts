// Glicko-2, following Glickman's "Example of the Glicko-2 system" (2013).
// Ratings are on the familiar 1500 scale outside this module.

export interface Rating {
  rating: number;
  rd: number;
  volatility: number;
}

export interface GameResult {
  opponent: { rating: number; rd: number };
  /** 1 win, 0.5 draw, 0 loss. */
  score: number;
}

export const SCALE = 173.7178;
export const DEFAULT_RATING: Readonly<Rating> = { rating: 1500, rd: 350, volatility: 0.06 };
export const DEFAULT_TAU = 0.5;
export const MAX_RD = 350;
/** Ratings with an RD above this are shown as provisional, like Lichess. */
export const PROVISIONAL_RD = 110;

const EPSILON = 0.000001;

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expected(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

/** One rating period. With no games, only the RD grows. */
export function rate(player: Rating, games: GameResult[], tau = DEFAULT_TAU): Rating {
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.rd / SCALE;
  const sigma = player.volatility;

  if (games.length === 0) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return { rating: player.rating, rd: Math.min(phiStar * SCALE, MAX_RD), volatility: sigma };
  }

  let vInv = 0;
  let deltaSum = 0;
  for (const game of games) {
    const muJ = (game.opponent.rating - 1500) / SCALE;
    const phiJ = game.opponent.rd / SCALE;
    const gJ = g(phiJ);
    const e = expected(mu, muJ, phiJ);
    vInv += gJ * gJ * e * (1 - e);
    deltaSum += gJ * (game.score - e);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;

  // New volatility by the Illinois algorithm (step 5 of the paper).
  const a = Math.log(sigma * sigma);
  const phi2 = phi * phi;
  const f = (x: number) => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi2 - v - ex);
    const den = 2 * (phi2 + v + ex) * (phi2 + v + ex);
    return num / den - (x - a) / (tau * tau);
  };
  let A = a;
  let B: number;
  if (delta * delta > phi2 + v) {
    B = Math.log(delta * delta - phi2 - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
  }
  const newSigma = Math.exp(A / 2);

  const phiStar = Math.sqrt(phi2 + newSigma * newSigma);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * deltaSum;

  return {
    rating: newMu * SCALE + 1500,
    rd: Math.min(newPhi * SCALE, MAX_RD),
    volatility: newSigma,
  };
}

export function isProvisional(r: Pick<Rating, 'rd'>): boolean {
  return r.rd > PROVISIONAL_RD;
}
