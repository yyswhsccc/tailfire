'use client'

import { useUser } from '@/hooks/use-user'
import { useToast } from '@/hooks/use-toast'
import {
  useCommissionDue,
  useCommissionChecks,
  useCommissionSummary,
  useClaimCommission,
  useAcceptCheck,
  useUpdateCheck,
} from '@/hooks/use-commission'
import { CommissionStats } from './_components/commission-stats'
import { AgentPayableTable } from './_components/agent-payable-table'
import { CommissionChecksTable } from './_components/commission-checks-table'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import { DollarSign, Plus } from 'lucide-react'
import { DashboardLayout } from '@/components/layout'

export default function CommissionPage() {
  const { isAdmin } = useUser()
  const { toast } = useToast()
  const { data: due } = useCommissionDue()
  const { data: summary } = useCommissionSummary()
  const { data: receivedChecks } = useCommissionChecks({ checkType: 'received' })
  const { data: paidChecks } = useCommissionChecks({ checkType: 'paid' })
  const claimCommission = useClaimCommission()
  const acceptCheck = useAcceptCheck()
  const updateCheck = useUpdateCheck()

  const handleClaim = async () => {
    try {
      await claimCommission.mutateAsync()
      toast({ title: 'Commission claimed', description: 'Your commission claim has been submitted for approval.' })
    } catch (error: any) {
      toast({ title: 'Claim failed', description: error?.message || 'An error occurred.', variant: 'destructive' })
    }
  }

  const myPayable = due?.find(() => true) // For agents, API returns only their own data

  return (
    <DashboardLayout>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Commission</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? 'Agency commission tracking and agent payouts' : 'Your commission earnings and claims'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button asChild>
              <Link href="/commission/receive">
                <Plus className="mr-2 h-4 w-4" />
                Receive Deposit
              </Link>
            </Button>
          )}
          {!isAdmin && myPayable && myPayable.totalDueCents > 0 && (
            <Button onClick={handleClaim} disabled={claimCommission.isPending}>
              <DollarSign className="mr-2 h-4 w-4" />
              {claimCommission.isPending ? 'Claiming...' : 'Claim Commission'}
            </Button>
          )}
        </div>
      </div>

      <CommissionStats isAdmin={isAdmin} due={due} summary={summary} />

      <Tabs defaultValue={isAdmin ? 'payable' : 'received'}>
        <TabsList>
          {isAdmin && <TabsTrigger value="payable">Payable by Agent</TabsTrigger>}
          <TabsTrigger value="received">Received Checks</TabsTrigger>
          <TabsTrigger value="claims">{isAdmin ? 'Agent Claims' : 'My Claims'}</TabsTrigger>
          {isAdmin && <TabsTrigger value="unreconciled">Unreconciled</TabsTrigger>}
        </TabsList>

        {isAdmin && (
          <TabsContent value="payable">
            <Card>
              <CardHeader>
                <CardTitle>Commission Due by Agent</CardTitle>
                <CardDescription>Agents with payable commission from departed trips</CardDescription>
              </CardHeader>
              <CardContent>
                <AgentPayableTable data={due || []} />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="received">
          <Card>
            <CardHeader>
              <CardTitle>Received from Suppliers</CardTitle>
              <CardDescription>Commission checks received and reconciled</CardDescription>
            </CardHeader>
            <CardContent>
              <CommissionChecksTable
                data={receivedChecks?.data || []}
                isAdmin={isAdmin}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="claims">
          <Card>
            <CardHeader>
              <CardTitle>{isAdmin ? 'Agent Payout Claims' : 'My Claims'}</CardTitle>
              <CardDescription>
                {isAdmin ? 'Review and approve agent commission claims' : 'Your submitted commission claims'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CommissionChecksTable
                data={paidChecks?.data || []}
                isAdmin={isAdmin}
                onAccept={isAdmin ? async (id) => {
                  try {
                    await acceptCheck.mutateAsync(id)
                    toast({ title: 'Claim accepted' })
                  } catch (e: any) {
                    toast({ title: 'Failed', description: e?.message, variant: 'destructive' })
                  }
                } : undefined}
                onReject={isAdmin ? async (id) => {
                  try {
                    await updateCheck.mutateAsync({ id, data: { status: 'cancelled' } })
                    toast({ title: 'Claim rejected' })
                  } catch (e: any) {
                    toast({ title: 'Failed', description: e?.message, variant: 'destructive' })
                  }
                } : undefined}
              />
            </CardContent>
          </Card>
        </TabsContent>
        {isAdmin && (
          <TabsContent value="unreconciled">
            <Card>
              <CardHeader>
                <CardTitle>Unreconciled Items</CardTitle>
                <CardDescription>Deposit line items that couldn&apos;t be matched to a booking</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Unreconciled items from finalized deposits will appear here.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
    </DashboardLayout>
  )
}
