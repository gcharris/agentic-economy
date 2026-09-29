// DESIGN §2b.3: one rim dye per street, from a muted set, assigned by street id. It names a district; it orders
// nothing (no dye ranks one street against another).

export const STREET_DYES = ['#8c3b2e', '#b0802c', '#3f4a63', '#5d6b3a'] as const; // madder, ochre, indigo-grey, moss
export const dyeFor = (streetId: number): string => STREET_DYES[Number(BigInt(streetId) % BigInt(STREET_DYES.length))];
