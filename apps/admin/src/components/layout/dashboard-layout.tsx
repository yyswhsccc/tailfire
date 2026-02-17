import { TopNav } from './top-nav'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-ash-50">
      <TopNav />
      <main className="mx-auto max-w-[1600px] px-4 py-6">
        {children}
      </main>
    </div>
  )
}
