'use client'

import { useUser } from '@/hooks/use-user'
import { useToast } from '@/hooks/use-toast'
import {
  useCommissionDue,
  useCommissionChecks,
  useCommissionSummary,
  useAcceptCheck,
  useUpdateCheck,
} from '@/hooks/use-commission'
import { CommissionStats } from './_components/commission-stats'
import { AgentPayableTable } from './_components/agent-payable-table'
import { CommissionChecksTable } from './_components/commission-checks-table'
import { AgentClaimsTab } from './_components/agent-claims-tab'
import { ReconcilePendingTable } from './_components/reconcile-pending-table'
import { ClaimBuilder } from './_components/claim-builder'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { DashboardLayout } from '@/components/layout'

export default function CommissionPage() {
  const { isAdmin } = useUser()
  const { toast } = useToast()
  const { data: due } = useCommissionDue()
  const { data: summary } = useCommissionSummary()
  const { data: receivedChecks } = useCommissionChecks({ checkType: 'received' })
  const { data: paidChecks } = useCommissionChecks({ checkType: 'paid' })
  const acceptCheck = useAcceptCheck()
  const updateCheck = useUpdateCheck()

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
          {!isAdmin && <ClaimBuilder />}
        </div>
      </div>

      <CommissionStats isAdmin={isAdmin} due={due} summary={summary} />

      <Tabs defaultValue={isAdmin ? 'payable' : 'received'}>
        <TabsList>
          {isAdmin && <TabsTrigger value="payable">Payable by Agent</TabsTrigger>}
          <TabsTrigger value="received">Received Checks</TabsTrigger>
          <TabsTrigger value="claims">{isAdmin ? 'Agent Claims' : 'My Claims'}</TabsTrigger>
          {isAdmin && <TabsTrigger value="disbursements">Disbursements</TabsTrigger>}
          {isAdmin && <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>}
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
          {/*
            AgentClaimsTab routes through NEXT_PUBLIC_IC_PAYOUTS_V2_ENABLED:
              • V2 on  → reads ic_invoices (admin/agent variants), uses IC approve/reject
              • V2 off → falls back to legacy commission_checks (paidChecks below)
            Per Codex audit: don't union the two feeds long-term — flag is the seam.
          */}
          <AgentClaimsTab
            isAdmin={isAdmin}
            legacyData={paidChecks?.data || []}
            legacyOnAccept={isAdmin ? async (id) => {
              try {
                await acceptCheck.mutateAsync(id)
                toast({ title: 'Claim accepted' })
              } catch (e: any) {
                toast({ title: 'Failed', description: e?.message, variant: 'destructive' })
              }
            } : undefined}
            legacyOnReject={isAdmin ? async (id) => {
              try {
                await updateCheck.mutateAsync({ id, data: { status: 'cancelled' } })
                toast({ title: 'Claim rejected' })
              } catch (e: any) {
                toast({ title: 'Failed', description: e?.message, variant: 'destructive' })
              }
            } : undefined}
          />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="disbursements">
            <Card>
              <CardHeader>
                <CardTitle>IC Commission Disbursements</CardTitle>
                <CardDescription>
                  Review IC commission invoices and manage manual disbursement sends.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-muted-foreground">
                  IC agents submit RCTI commission claims, which appear here for review. Once approved,
                  manage the payout (mark sent with reference + proof, or mark failed to reverse the reservation).
                </p>
                <Button asChild>
                  <Link href="/commission/disbursements">Open Disbursements Queue</Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="reconciliation">
            <Card>
              <CardHeader>
                <CardTitle>Pending reconciliation</CardTitle>
                <CardDescription>
                  Activities on departed/travelling trips waiting for an admin
                  reconciliation decision. Reconciled items become eligible for
                  agent payout via IC Payouts V2.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReconcilePendingTable />
              </CardContent>
            </Card>
          </TabsContent>
        )}
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
