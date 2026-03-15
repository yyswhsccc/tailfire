'use client'

import { useState } from 'react'
import { Loader2, X, Plus, Mail } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { SettingsTabsLayout } from '../_components/settings-tabs-layout'
import { useAgencySettings, useUpdateAgencySettings } from '@/hooks/use-agency-settings'
import { useMyProfile } from '@/hooks/use-user-profile'

export default function EmailSettingsPage() {
  const { data: profile } = useMyProfile()
  const agencyId = profile?.agencyId
  const { data: settings, isLoading } = useAgencySettings(agencyId || null)
  const updateSettings = useUpdateAgencySettings(agencyId || '')

  const [domains, setDomains] = useState<string[]>([])
  const [newDomain, setNewDomain] = useState('')
  const [footer, setFooter] = useState('')
  const [initialized, setInitialized] = useState(false)

  // Initialize from server data once
  if (settings && !initialized) {
    setDomains(settings.emailAllowedDomains ?? [])
    setFooter(settings.emailComplianceFooter ?? '')
    setInitialized(true)
  }

  const handleAddDomain = () => {
    const domain = newDomain.trim().toLowerCase()
    if (domain && !domains.includes(domain)) {
      setDomains([...domains, domain])
      setNewDomain('')
    }
  }

  const handleRemoveDomain = (domain: string) => {
    setDomains(domains.filter((d) => d !== domain))
  }

  const handleSave = async () => {
    await updateSettings.mutateAsync({
      emailAllowedDomains: domains,
      emailComplianceFooter: footer || null,
    })
  }

  if (isLoading) {
    return (
      <SettingsTabsLayout activeTab="email">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </SettingsTabsLayout>
    )
  }

  return (
    <SettingsTabsLayout activeTab="email">
      <div className="space-y-6">
        {/* Allowed Domains */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Allowed Email Domains
            </CardTitle>
            <CardDescription>
              Restrict which email domains agents can connect. Leave empty to allow all domains.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="e.g., company.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddDomain()
                  }
                }}
              />
              <Button variant="outline" onClick={handleAddDomain}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>

            {domains.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {domains.map((domain) => (
                  <Badge key={domain} variant="secondary" className="gap-1 py-1 px-3">
                    {domain}
                    <button
                      onClick={() => handleRemoveDomain(domain)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No domain restrictions — agents can connect any email domain.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Compliance Footer */}
        <Card>
          <CardHeader>
            <CardTitle>Email Compliance Footer</CardTitle>
            <CardDescription>
              HTML footer appended to all outbound emails sent through the CRM. Use for legal
              disclaimers, unsubscribe links, or company information.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="footer">Footer HTML</Label>
              <Textarea
                id="footer"
                rows={6}
                placeholder="<p>This email was sent by {{agency_name}}. If you received this in error, please disregard.</p>"
                value={footer}
                onChange={(e) => setFooter(e.target.value)}
              />
            </div>

            {footer && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div
                  className="rounded-lg border p-4 text-sm text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: footer }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={updateSettings.isPending}>
            {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Email Settings
          </Button>
        </div>
      </div>
    </SettingsTabsLayout>
  )
}
