import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { sql } from '@/lib/db';
import bcrypt from 'bcryptjs';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const rows = await sql<{ id: string; email: string; password_hash: string; full_name: string }>`
          SELECT id, email, password_hash, full_name FROM users WHERE email = ${credentials.email as string}
        `;
        const user = rows[0];
        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password as string, user.password_hash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.full_name };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      return session;
    },
  },
  pages: { signIn: '/login' },
});
