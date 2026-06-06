import NextAuth, { type DefaultSession } from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import { authConfig } from "./auth.config"

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT { id?: string }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  events: {
    // Claim all pre-auth positions the first time the owner account is created
    async createUser({ user }) {
      if (user.email === process.env.OWNER_EMAIL) {
        await prisma.position.updateMany({
          where: { userId: null },
          data: { userId: user.id },
        })
      }
    },
  },
})
