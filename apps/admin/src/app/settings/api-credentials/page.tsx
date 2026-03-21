'use client'

import { useState } from 'react'
import { ExternalLink, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { SettingsTabsLayout } from '../_components/settings-tabs-layout'
import { useToast } from '@/hooks/use-toast'
import {
  useApiHealthStatus,
  useApiHealthHistory,
  useTriggerHealthCheck,
  type ProviderStatus,
  type HealthCheckEntry,
} from '@/hooks/use-api-health'
import { formatDistanceToNow } from 'date-fns'

// ─── Status helpers ────────────────────────────────────────────────────────────

type HealthStatus = 'not-configured' | 'healthy' | 'degraded' | 'down'

function getStatus(provider: ProviderStatus): HealthStatus {
  if (!provider.configured) return 'not-configured'
  if (!provider.lastCheck) return 'not-configured'
  if (provider.lastCheck.success) return 'healthy'
  if (provider.consecutiveFailures >= 2) return 'down'
  return 'degraded'
}

function StatusDot({ status }: { status: HealthStatus }) {
  const classes: Record<HealthStatus, string> = {
    'not-configured': 'bg-gray-300',
    healthy: 'bg-green-500',
    degraded: 'bg-amber-400',
    down: 'bg-red-500',
  }
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 ${classes[status]}`}
    />
  )
}

function StatusLabel({ status }: { status: HealthStatus }) {
  const labels: Record<HealthStatus, string> = {
    'not-configured': 'Not Configured',
    healthy: 'Healthy',
    degraded: 'Degraded',
    down: 'Down',
  }
  const variants: Record<HealthStatus, 'secondary' | 'default' | 'outline' | 'destructive'> = {
    'not-configured': 'secondary',
    healthy: 'default',
    degraded: 'outline',
    down: 'destructive',
  }
  return (
    <Badge variant={variants[status]} className="text-xs">
      {labels[status]}
    </Badge>
  )
}

// ─── History panel ─────────────────────────────────────────────────────────────

function HistoryPanel({ provider }: { provider: string }) {
  const { data: history, isLoading } = useApiHealthHistory(provider)

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading history…
      </div>
    )
  }

  if (!history || history.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">No check history yet.</p>
  }

  return (
    <div className="mt-3 space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
        Recent checks
      </p>
      {history.slice(0, 10).map((entry: HealthCheckEntry) => (
        <div
          key={entry.id}
          className="flex items-center gap-3 text-xs py-1 border-b border-ash-100 last:border-0"
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full flex-shrink-0 ${
              entry.success ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="font-mono text-muted-foreground w-28 flex-shrink-0">
            {formatDistanceToNow(new Date(entry.checkedAt), { addSuffix: true })}
          </span>
          {entry.responseMs !== null ? (
            <span className="font-mono text-muted-foreground">{entry.responseMs}ms</span>
          ) : (
            <span className="font-mono text-muted-foreground">—</span>
          )}
          {entry.error && (
            <span className="text-red-600 truncate max-w-xs" title={entry.error}>
              {entry.error}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Provider card ─────────────────────────────────────────────────────────────

function ProviderCard({
  provider,
  onTest,
  isTesting,
}: {
  provider: ProviderStatus
  onTest: (p: string) => void
  isTesting: boolean
}) {
  const [open, setOpen] = useState(false)
  const status = getStatus(provider)

  const lastCheckedLabel = provider.lastCheck
    ? formatDistanceToNow(new Date(provider.lastCheck.checkedAt), { addSuffix: true })
    : null

  const responseMs = provider.lastCheck?.responseMs

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            {/* Expand toggle */}
            <CollapsibleTrigger asChild>
              <button
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                aria-label={open ? 'Collapse' : 'Expand'}
              >
                {open ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            </CollapsibleTrigger>

            {/* Status dot */}
            <StatusDot status={status} />

            {/* Provider name */}
            <span className="font-medium text-sm flex-1">{provider.name}</span>

            {/* Meta: last check + response time */}
            <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground font-mono">
              {lastCheckedLabel && <span>{lastCheckedLabel}</span>}
              {responseMs !== undefined && responseMs !== null && (
                <span>{responseMs}ms</span>
              )}
            </div>

            {/* Status badge */}
            <StatusLabel status={status} />

            {/* Test button */}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={isTesting || !provider.configured}
              onClick={(e) => {
                e.stopPropagation()
                onTest(provider.provider)
              }}
            >
              {isTesting ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  Testing
                </>
              ) : (
                'Test'
              )}
            </Button>
          </div>

          {/* Mobile: meta below */}
          {(lastCheckedLabel || responseMs !== undefined) && (
            <div className="sm:hidden flex gap-3 mt-2 ml-10 text-xs text-muted-foreground font-mono">
              {lastCheckedLabel && <span>{lastCheckedLabel}</span>}
              {responseMs !== undefined && responseMs !== null && (
                <span>{responseMs}ms</span>
              )}
            </div>
          )}
        </CardContent>

        <CollapsibleContent>
          <div className="px-4 pb-4 border-t border-ash-100 pt-3">
            <HistoryPanel provider={provider.provider} />
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

// ─── Category section ──────────────────────────────────────────────────────────

const CATEGORY_ORDER = ['Travel', 'Services', 'Storage', 'Infrastructure']
const CATEGORY_LABELS: Record<string, string> = {
  Travel: 'Travel APIs',
  Services: 'Services',
  Storage: 'Storage',
  Infrastructure: 'Infrastructure',
}

function groupByCategory(providers: ProviderStatus[]): Map<string, ProviderStatus[]> {
  const map = new Map<string, ProviderStatus[]>()
  for (const p of providers) {
    const cat = p.category || 'Other'
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat)!.push(p)
  }
  return map
}

// ─── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ providers }: { providers: ProviderStatus[] }) {
  const configured = providers.filter(p => p.configured)
  const healthy = configured.filter(p => {
    const s = getStatus(p)
    return s === 'healthy'
  })

  const allHealthy = healthy.length === configured.length && configured.length > 0
  const hasDown = providers.some(p => getStatus(p) === 'down')

  let overallStatus = 'All systems operational'
  let badgeVariant: 'default' | 'destructive' | 'outline' = 'default'

  if (hasDown) {
    overallStatus = 'One or more providers down'
    badgeVariant = 'destructive'
  } else if (!allHealthy && configured.length > 0) {
    overallStatus = 'Degraded'
    badgeVariant = 'outline'
  }

  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground font-mono">
          {healthy.length} of {configured.length}
        </span>{' '}
        configured providers healthy
      </p>
      <Badge variant={badgeVariant} className="text-xs">
        {overallStatus}
      </Badge>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ApiHealthPage() {
  const { data: providers, isLoading, error } = useApiHealthStatus()
  const triggerCheck = useTriggerHealthCheck()
  const { toast } = useToast()
  const [testingProviders, setTestingProviders] = useState<Set<string>>(new Set())

  const handleTest = async (provider: string) => {
    setTestingProviders(prev => new Set(prev).add(provider))
    try {
      await triggerCheck.mutateAsync(provider)
      toast({
        title: 'Check triggered',
        description: `Health check for ${provider} is running.`,
      })
    } catch {
      toast({
        title: 'Check failed',
        description: `Could not trigger health check for ${provider}.`,
        variant: 'destructive',
      })
    } finally {
      setTestingProviders(prev => {
        const next = new Set(prev)
        next.delete(provider)
        return next
      })
    }
  }

  const grouped = providers ? groupByCategory(providers) : new Map()

  return (
    <SettingsTabsLayout activeTab="api-credentials">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-xl font-semibold">API Health</h3>
        <p className="text-sm text-muted-foreground">
          Monitor external API connectivity and health status
        </p>
      </div>

      <div className="space-y-6">
        {/* Summary bar */}
        {providers && providers.length > 0 && (
          <SummaryBar providers={providers} />
        )}

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-14 rounded-lg bg-ash-100 animate-pulse" />
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Failed to load health status. The API may be unavailable.
          </div>
        )}

        {/* Provider groups */}
        {!isLoading && !error && providers && (
          <>
            {CATEGORY_ORDER.map(category => {
              const categoryProviders = grouped.get(category)
              if (!categoryProviders || categoryProviders.length === 0) return null
              return (
                <div key={category} className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    {CATEGORY_LABELS[category] ?? category}
                  </h4>
                  <div className="space-y-2">
                    {categoryProviders.map(provider => (
                      <ProviderCard
                        key={provider.provider}
                        provider={provider}
                        onTest={handleTest}
                        isTesting={testingProviders.has(provider.provider)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
            {/* Render any categories not in CATEGORY_ORDER */}
            {Array.from(grouped.entries())
              .filter(([cat]) => !CATEGORY_ORDER.includes(cat))
              .map(([category, categoryProviders]) => (
                <div key={category} className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">{category}</h4>
                  <div className="space-y-2">
                    {categoryProviders.map(provider => (
                      <ProviderCard
                        key={provider.provider}
                        provider={provider}
                        onTest={handleTest}
                        isTesting={testingProviders.has(provider.provider)}
                      />
                    ))}
                  </div>
                </div>
              ))}
          </>
        )}

        {/* Doppler note */}
        <div className="rounded-lg border bg-muted/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            API credentials are managed via{' '}
            <a
              href="https://dashboard.doppler.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              Doppler Dashboard
              <ExternalLink className="h-3 w-3" />
            </a>
            . To add or rotate credentials, update them in Doppler and redeploy the API.
          </p>
        </div>
      </div>
    </SettingsTabsLayout>
  )
}
