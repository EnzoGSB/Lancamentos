'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Building2,
  Database,
  LayoutDashboard,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { AssistenteProvider, useAssistente } from '@/components/assistente-provider'
import { FilaProcessamentoProvider } from '@/components/fila-processamento-provider'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const SIDEBAR_KEY = 'tabeloes-sidebar-collapsed'
const SIDEBAR_WIDTH = 300
const MOBILE_SIDEBAR_WIDTH = 280

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  collapsed,
  onNavigate,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  active: boolean
  collapsed: boolean
  onNavigate?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-base transition-colors touch-manipulation min-h-[44px]',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        collapsed && 'justify-center px-2'
      )}
    >
      <Icon className="size-5 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  )
}

function SidebarContent({
  collapsed,
  isMobile,
  onToggle,
  onCloseMobile,
}: {
  collapsed: boolean
  isMobile: boolean
  onToggle: () => void
  onCloseMobile: () => void
}) {
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
  const effectiveCollapsed = isMobile ? false : collapsed

  useEffect(() => {
    if (isPesquisa && conversaParam && conversas.some(c => c.id === conversaParam)) {
      abrirConversa(conversaParam)
    }
  }, [isPesquisa, conversaParam, conversas, abrirConversa])

  const handleNovaPesquisa = useCallback(() => {
    novaConversa()
    router.push('/')
    onCloseMobile()
  }, [novaConversa, router, onCloseMobile])

  const handleAbrirConversa = useCallback((id: string) => {
    abrirConversa(id)
    router.push(`/?c=${id}`)
    onCloseMobile()
  }, [abrirConversa, router, onCloseMobile])

  const handleRemover = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    removerConversa(id)
    if (activeId === id) router.push('/')
  }, [removerConversa, activeId, router])

  return (
    <>
      <div className={cn(
        'flex items-center h-14 shrink-0 border-b border-sidebar-border',
        effectiveCollapsed ? 'justify-center px-2' : 'justify-between px-4'
      )}>
        {!effectiveCollapsed && (
          <Link href="/" onClick={onCloseMobile} className="font-bold text-lg text-sidebar-foreground truncate">
            BuscaImob
          </Link>
        )}
        {isMobile ? (
          <button
            type="button"
            onClick={onCloseMobile}
            className="p-2 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors touch-manipulation"
            aria-label="Fechar menu"
          >
            <X className="size-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            className="p-1.5 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors touch-manipulation"
            title={effectiveCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
          >
            {effectiveCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        )}
      </div>

      <div className={cn('p-3 shrink-0', effectiveCollapsed && 'px-1.5')}>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={handleNovaPesquisa}
          className={cn(
            'w-full justify-start gap-2 text-base border-sidebar-border bg-transparent hover:bg-sidebar-accent min-h-[44px]',
            effectiveCollapsed && 'justify-center px-0'
          )}
          title={effectiveCollapsed ? 'Nova pesquisa' : undefined}
        >
          <MessageSquarePlus className="size-5 shrink-0" />
          {!effectiveCollapsed && 'Nova pesquisa'}
        </Button>
      </div>

      {!effectiveCollapsed && (
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 overscroll-contain">
          <p className="px-3 py-2 text-sm font-medium text-sidebar-foreground/50 uppercase tracking-wide">
            Histórico
          </p>
          {conversas.length === 0 ? (
            <p className="px-3 py-2 text-sm text-sidebar-foreground/50 leading-relaxed">
              Suas pesquisas aparecerão aqui
            </p>
          ) : (
            <ul className="space-y-1">
              {conversas.map(conversa => (
                <li key={conversa.id}>
                  <button
                    type="button"
                    onClick={() => handleAbrirConversa(conversa.id)}
                    className={cn(
                      'group w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-base transition-colors touch-manipulation min-h-[44px]',
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
                      className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1.5 rounded hover:bg-red-100 hover:text-red-600 transition-opacity shrink-0 touch-manipulation"
                      title="Apagar pesquisa"
                    >
                      <Trash2 className="size-4" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className={cn(
        'shrink-0 border-t border-sidebar-border p-3 space-y-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        effectiveCollapsed && 'px-1.5'
      )}>
        <NavItem href="/" icon={Search} label="Pesquisa" active={isPesquisa} collapsed={effectiveCollapsed} onNavigate={onCloseMobile} />
        <NavItem href="/dashboard" icon={LayoutDashboard} label="Dashboard" active={pathname === '/dashboard' || pathname.startsWith('/upload')} collapsed={effectiveCollapsed} onNavigate={onCloseMobile} />
        <NavItem href="/imoveis" icon={Building2} label="Imóveis" active={pathname === '/imoveis'} collapsed={effectiveCollapsed} onNavigate={onCloseMobile} />
        <NavItem href="/migracao" icon={Database} label="Migração" active={pathname === '/migracao'} collapsed={effectiveCollapsed} onNavigate={onCloseMobile} />
      </div>
    </>
  )
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY)
    if (stored === 'true') setCollapsed(true)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem(SIDEBAR_KEY, String(next))
      return next
    })
  }, [])

  const closeMobile = useCallback(() => setMobileOpen(false), [])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const isPesquisa = pathname === '/'
  const sidebarWidth = isMobile ? MOBILE_SIDEBAR_WIDTH : (collapsed ? 52 : SIDEBAR_WIDTH)

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-gray-50">
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 md:hidden touch-manipulation"
          onClick={closeMobile}
          aria-label="Fechar menu"
        />
      )}

      <aside
        style={{ width: sidebarWidth }}
        className={cn(
          'shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border transition-[width,transform] duration-200 z-50',
          'fixed md:relative inset-y-0 left-0 h-[100dvh]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        <SidebarContent
          collapsed={collapsed}
          isMobile={isMobile}
          onToggle={toggleCollapsed}
          onCloseMobile={closeMobile}
        />
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0 w-full">
        <header className="h-14 shrink-0 border-b bg-white flex items-center px-3 gap-2 md:hidden pt-[env(safe-area-inset-top)]">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-md text-gray-600 hover:bg-gray-100 touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Abrir menu"
          >
            <PanelLeftOpen className="size-6" />
          </button>
          <span className="font-semibold text-lg text-gray-900 truncate flex-1">BuscaImob</span>
        </header>

        <main
          className={cn(
            'flex-1 min-h-0 overflow-auto overscroll-contain',
            isPesquisa ? 'flex flex-col' : 'p-3 sm:p-5 md:p-8'
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
      <FilaProcessamentoProvider>
        <AppShellInner>{children}</AppShellInner>
      </FilaProcessamentoProvider>
    </AssistenteProvider>
  )
}
