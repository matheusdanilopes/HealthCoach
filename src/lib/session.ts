import { cache } from 'react';
import { auth } from '@/auth';
import { sql } from '@/lib/db';
import type { Profile } from '@/types';

// Memoized per request: the (app) layout and the page both need the session
// and the user row, so they share one JWT decode and one DB round-trip.
export const getSession = cache(() => auth());

export const getUserRow = cache(async (userId: string) => {
  const [row] = await sql`SELECT * FROM users WHERE id = ${userId}`;
  return (row as (Profile & { id: string }) | undefined) ?? null;
});
