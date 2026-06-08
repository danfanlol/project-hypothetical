import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import Link from "next/link"
import { SettingsProvider } from "@/components/SettingsProvider"
import { SettingsDropdown } from "@/components/SettingsDropdown"
import { auth, signOut } from "@/auth"
import "./globals.css"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Chess Lines",
  description: "Practice your chess openings line by line",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        <SettingsProvider>
          <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <nav className="max-w-5xl mx-auto px-4 h-12 flex items-center gap-6">
              <Link href="/practice" className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
                ♟ Chess Lines
              </Link>
              <div className="flex gap-4 text-sm text-zinc-500 dark:text-zinc-400">
                <Link href="/practice" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  Practice
                </Link>
                <Link href="/create" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  Add Position
                </Link>
                <Link href="/positions" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  All Positions
                </Link>
                <Link href="/search" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  Search
                </Link>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <SettingsDropdown />
                {session?.user && (
                  <div className="flex items-center gap-2">
                    {session.user.image ? (
                      <img
                        src={session.user.image}
                        alt={session.user.name ?? ""}
                        className="w-7 h-7 rounded-full"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-600 dark:text-zinc-300">
                        {(session.user.name ?? session.user.email ?? "?")[0].toUpperCase()}
                      </div>
                    )}
                    <form
                      action={async () => {
                        "use server"
                        await signOut({ redirectTo: "/login" })
                      }}
                    >
                      <button
                        type="submit"
                        className="text-xs text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                      >
                        Sign out
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </nav>
          </header>
          <main className="flex flex-col flex-1">{children}</main>
        </SettingsProvider>
      </body>
    </html>
  )
}
