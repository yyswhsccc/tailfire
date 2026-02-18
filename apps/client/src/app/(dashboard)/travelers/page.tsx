"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@tailfire/ui-public"
import { PassengerInfoForm } from "@/components/travelers/PassengerInfoForm"

export default function TravelersPage() {
  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2 mb-8">
        <Link href="/">
          <Button
            variant="ghost"
            size="icon"
            className="text-phoenix-text-muted hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="sr-only">Back to Dashboard</span>
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">My Profile</h1>
          <p className="text-phoenix-text-muted mt-1">
            Manage your personal and travel document information
          </p>
        </div>
      </div>

      <PassengerInfoForm />
    </>
  )
}
