import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { supabase } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { authConfig } from './auth.config';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const { data: user } = await supabase
            .from('users')
            .select('id, email, password_hash, full_name')
            .eq('email', credentials.email as string)
            .maybeSingle();

          if (!user) return null;

          const valid = await bcrypt.compare(credentials.password as string, user.password_hash);
          if (!valid) return null;

          return { id: user.id, email: user.email, name: user.full_name };
        } catch (err) {
          console.error('authorize error:', err);
          return null;
        }
      },
    }),
  ],
});
