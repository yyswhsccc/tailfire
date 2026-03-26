import type { Metadata } from "next";

import { ContentPage } from "@/components/layout/content-page";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Terms of Service | Phoenix Voyages",
  description: "Terms of Service for Phoenix Voyages — TICO-registered travel agency.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-display text-base font-bold tracking-wide text-[#1A1A1A] md:text-lg">
        {title}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

export default function TermsPage() {
  return (
    <ContentPage title="Terms of Service">
      <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        This is placeholder content. Full terms pending legal review.
      </p>

      <Separator />

      <Section title="Booking Terms">
        <p>
          All bookings made through Phoenix Voyages are subject to the terms and conditions of
          the individual suppliers, including cruise lines, airlines, hotels, and tour
          operators. By completing a booking, you confirm that all traveler information
          provided is accurate and that you have read and agree to the relevant supplier
          conditions.
        </p>
        <p>
          Phoenix Voyages acts as an agent for licensed travel suppliers. We are not
          responsible for changes, cancellations, or service failures on the part of
          third-party suppliers.
        </p>
      </Section>

      <Separator />

      <Section title="Payment Policy">
        <p>
          Deposits are required at time of booking and vary by supplier. Final payment
          deadlines are specified at checkout and in your booking confirmation. Failure to
          meet final payment deadlines may result in automatic cancellation without refund of
          the deposit.
        </p>
        <p>
          All prices are quoted in Canadian dollars unless otherwise stated and are subject to
          change until a booking is confirmed and deposit received.
        </p>
      </Section>

      <Separator />

      <Section title="Cancellation Policy">
        <p>
          Cancellation fees vary by supplier and are detailed in your booking confirmation.
          Some fares and packages are non-refundable from time of booking. We strongly
          recommend the purchase of comprehensive travel insurance to protect your investment.
        </p>
        <p>
          Requests to cancel or modify a booking must be submitted in writing to your Travel
          Advisor. Cancellation fees will be applied as per the relevant supplier policy in
          effect at the time of cancellation.
        </p>
      </Section>

      <Separator />

      <Section title="Limitation of Liability">
        <p>
          Phoenix Voyages shall not be liable for any injury, damage, loss, accident, delay,
          or irregularity which may be occasioned either by reason of any defect in any
          vehicle, vessel, aircraft, or accommodation, or through the acts or default of any
          company or person engaged in conveying the passenger or in carrying out the
          arrangements of the tour.
        </p>
      </Section>

      <Separator />

      <Section title="Governing Law">
        <p>
          These terms are governed by the laws of the Province of Ontario and the federal laws
          of Canada applicable therein. Any disputes shall be resolved in the courts of
          Ontario. Phoenix Voyages is registered with the Travel Industry Council of Ontario
          (TICO).
        </p>
      </Section>
    </ContentPage>
  );
}
