import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/lib/firebase/auth-context'
import './globals.css'

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Buisness Flow — AI-powered conversational analytics',
  description:
    'Ask your data questions in plain English. Get instant answers as text, tables, or charts.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={plusJakarta.className}>
        <AuthProvider>{children}</AuthProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'hsl(220, 20%, 9%)',
              border: '1px solid hsl(220, 20%, 18%)',
              color: 'hsl(215, 25%, 90%)',
            },
          }}
        />
      </body>
    </html>
  )
}
