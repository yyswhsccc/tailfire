'use client'

import { DashboardLayout } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function DestinationsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Destinations</h2>
          <p className="text-muted-foreground">
            Browse and manage travel destinations
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Coming Soon</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Destination management will be available in a future update.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
