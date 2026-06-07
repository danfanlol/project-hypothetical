import type { NextAuthConfig } from "next-auth"
import Google from "next-auth/providers/google"
import GitHub from "next-auth/providers/github"

// Edge-compatible config — no Prisma, no Node.js-only imports.
// Used by middleware to verify JWTs without touching the database.
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" as const },
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user
    },
    jwt({ token, user }) {
      if (user?.id) token.id = user.id
      return token
    },
    session({ session, token }) {
      if (typeof token.id === "string") session.user.id = token.id
      return session
    },
  },
  providers: [
    Google({ allowDangerousEmailAccountLinking: true }),
    GitHub({ allowDangerousEmailAccountLinking: true }),
  ],
} satisfies NextAuthConfig
