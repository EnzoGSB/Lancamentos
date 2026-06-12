'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Building2,
  LayoutDashboard,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Trash2,
} from 'lucide-react'
import { AssistenteProvider, useAssistente } from '@/components/assistente-provider'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const SIDEBAR_KEY = 'tabeloes-sidebar-collapsed'
const SIDEBAR_WIDTH = 260

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  collapsed,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  active: boolean
  collapsed: boolean
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        collapsed && 'justify-center px-2'
      )}
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  )
}

function SidebarContent({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const {
    conversas,
    activeId,
    novaConversa,
    abrirConversa,
    removerConversa,
  } = useAssistente()

  const isPesquisa = pathname === '/'
  const conversaParam = searchParams.get('c')

  useEffect(() => {
    if (isPesquisa && conversaParam && conversas.some(c => c.id === conversaParam)) {
      abrirConversa(conversaParam)
    }
  }, [isPesquisa, conversaParam, conversas, abrirConversa])

  const handleNovaPesquisa = useCallback(() => {
    novaConversa()
    router.push('/')
  }, [novaConversa, router])

  const handleAbrirConversa = useCallback((id: string) => {
    abrirConversa(id)
    router.push(`/?c=${id}`)
  }, [abrirConversa, router])

  const handleRemover = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    removerConversa(id)
    if (activeId === id) router.push('/')
  }, [removerConversa, activeId, router])

  return (
    <>
      <div className={cn('flex items-center h-12 shrink-0 border-b border-sidebar-border', collapsed ? 'justify-center px-2' : 'justify-between px-3')}>
        {!collapsed && (
          <Link href="/" className="font-bold text-sm text-sidebar-foreground truncate">
            Tabelões
          </Link>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="p-1.5 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
          title={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      <div className={cn('p-2 shrink-0', collapsed && 'px-1.5')}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleNovaPesquisa}
          className={cn(
            'w-full justify-start gap-2 border-sidebar-border bg-transparent hover:bg-sidebar-accent',
            collapsed && 'justify-center px-0'
          )}
          title={collapsed ? 'Nova pesquisa' : undefined}
        >
          <MessageSquarePlus className="size-4 shrink-0" />
          {!collapsed && 'Nova pesquisa'}
        </Button>
      </div>

      {!collapsed && (
        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
          <p className="px-3 py-1.5 text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wide">
            Histórico
          </p>
          {conversas.length === 0 ? (
            <p className="px-3 py-2 text-xs text-sidebar-foreground/50">
              Suas pesquisas aparecerão aqui
            </p>
          ) : (
            <ul className="space-y-0.5">
              {conversas.map(conversa => (
                <li key={conversa.id}>
                  <button
                    type="button"
                    onClick={() => handleAbrirConversa(conversa.id)}
                    className={cn(
                      'group w-full flex items-center gap-1 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      isPesquisa && activeId === conversa.id
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    )}
                  >
                    <span className="truncate flex-1">{conversa.titulo}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={e => handleRemover(e, conversa.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') handleRemover(e as unknown as React.MouseEvent, conversa.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 hover:text-red-600 transition-opacity shrink-0"
                      title="Apagar pesquisa"
                    >
                      <Trash2 className="size-3.5" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className={cn('shrink-0 border-t border-sidebar-border p-2 space-y-0.5', collapsed && 'px-1.5')}>
        <NavItem href="/" icon={Search} label="Pesquisa" active={isPesquisa} collapsed={collapsed} />
        <NavItem href="/dashboard" icon={LayoutDashboard} label="Dashboard" active={pathname === '/dashboard' || pathname.startsWith('/upload')} collapsed={collapsed} />
        <NavItem href="/imoveis" icon={Building2} label="Imóveis" active={pathname === '/imoveis'} collapsed={collapsed} />
      </div>
    </>
  )
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY)
    if (stored === 'true') setCollapsed(true)
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem(SIDEBAR_KEY, String(next))
      return next
    })
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const isPesquisa = pathname === '/'
  const sidebarWidth = collapsed ? 52 : SIDEBAR_WIDTH

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Fechar menu"
        />
      )}

      <aside
        style={{ width: sidebarWidth }}
        className={cn(
          'shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border transition-[width] duration-200 z-50',
          'fixed md:relative inset-y-0 left-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        <SidebarContent collapsed={collapsed} onToggle={toggleCollapsed} />
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="h-12 shrink-0 border-b bg-white flex items-center px-3 gap-2 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100"
            aria-label="Abrir menu"
          >
            <PanelLeftOpen className="size-5" />
          </button>
          <span className="font-semibold text-sm text-gray-900">Tabelões</span>
        </header>

        <main
          className={cn(
            'flex-1 min-h-0 overflow-auto',
            isPesquisa ? 'flex flex-col' : 'p-4 md:p-6'
          )}
        >
          {children}
        </main>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AssistenteProvider>
      <AppShellInner>{children}</AppShellInner>
    </AssistenteProvider>
  )
}
