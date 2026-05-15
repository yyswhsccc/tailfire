import type { Metadata } from "next";

import { ContentPage } from "@/components/layout/content-page";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Terms of Service | Phoenix Voyages",
  description:
    "Terms of Service for Phoenix Voyages — TICO-registered travel agency operating under Ontario Regulation 26/05.",
};

const LAST_UPDATED = "May 15, 2026";
const TICO_REG = "50017089";

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
      <p className="text-sm text-[#666]">Last updated: {LAST_UPDATED}</p>

      <Section title="About these terms">
        <p>
          These Terms of Service govern your use of the Phoenix Voyages website and the
          booking services we provide. Phoenix Voyages is registered with the Travel Industry
          Council of Ontario (TICO Registration #{TICO_REG}) and operates under Ontario
          Regulation 26/05 of the <em>Travel Industry Act, 2002</em>.
        </p>
        <p>
          By making a booking with us, you agree to these Terms in addition to the supplier
          conditions specific to your travel arrangements. Please read them carefully before
          completing a booking.
        </p>
      </Section>

      <Separator />

      <Section title="Phoenix Voyages as your travel agent">
        <p>
          Phoenix Voyages acts as a <strong>travel retailer and agent</strong> for the cruise
          lines, airlines, hotels, tour operators, transfer providers, insurance underwriters,
          and other suppliers (collectively, &quot;<strong>Suppliers</strong>&quot;) that
          actually provide the travel services you book. Each Supplier&apos;s own terms,
          conditions, fares, and tariffs apply to your booking and form part of your contract
          for those services.
        </p>
        <p>
          We exercise reasonable care in selecting Suppliers and arranging your travel, but
          Phoenix Voyages does not own or operate any cruise ship, aircraft, hotel, motorcoach,
          or other conveyance. We are not responsible for changes, cancellations, schedule
          adjustments, denied boarding, lost baggage, injuries, or other service failures on
          the part of any Supplier.
        </p>
      </Section>

      <Separator />

      <Section title="Booking, pricing, and currency">
        <p>
          Quotes are valid only when confirmed in writing by your Travel Advisor and remain
          subject to availability, Supplier confirmation, and receipt of any required deposit.
          All prices are quoted in Canadian dollars (CAD) unless otherwise stated, and exclude
          applicable taxes, levies, fuel surcharges, port fees, and other government charges
          unless explicitly itemized.
        </p>
        <p>
          Errors in published prices or descriptions, whether on our website or in any printed
          material, do not bind Phoenix Voyages. We reserve the right to correct any error and
          to re-quote or cancel the booking if a corrected price is not accepted.
        </p>
      </Section>

      <Separator />

      <Section title="Price increases (Ontario Reg. 26/05 §41)">
        <p>
          Once full payment for travel services has been received, the price of those services
          will not be increased. Before full payment is received, Phoenix Voyages and the
          Supplier may pass on increases attributable to:
        </p>
        <ul className="ml-5 list-disc space-y-2">
          <li>Government taxes or fees,</li>
          <li>Currency fluctuations,</li>
          <li>Fuel surcharges imposed by transportation providers,</li>
          <li>Supplier tariff adjustments.</li>
        </ul>
        <p>
          If a cumulative price increase exceeds <strong>seven percent (7%)</strong> of the
          original quoted price (excluding taxes and fees), you may, in accordance with Ontario
          Reg. 26/05, cancel the affected booking and receive a full refund of all amounts
          paid, provided you do so within the timeframe specified in your booking confirmation.
        </p>
      </Section>

      <Separator />

      <Section title="Payment, deposits, and final payment">
        <p>
          A non-refundable deposit is typically required at the time of booking. The deposit
          amount, currency, and final-payment deadline are specified at checkout and in your
          booking confirmation. Failure to meet the final-payment deadline may result in
          automatic cancellation by the Supplier and forfeiture of the deposit and any other
          amounts subject to penalty.
        </p>
        <p>
          We accept Visa, Mastercard, and American Express through our secure payment
          processor. Phoenix Voyages does not store full credit-card numbers on our systems.
        </p>
      </Section>

      <Separator />

      <Section title="Cancellation, refunds, and non-refundable amounts">
        <p>
          Cancellation fees vary by Supplier and are detailed in your booking confirmation and
          in each Supplier&apos;s own cancellation policy. Many fares (e.g., promotional cruise
          fares, basic-economy airfares, last-minute packages) are <strong>non-refundable from
          the time of booking</strong>. We will disclose the applicable cancellation terms
          before you confirm a booking.
        </p>
        <p>
          Requests to cancel or modify a booking must be submitted in writing to your Travel
          Advisor and take effect only once acknowledged by Phoenix Voyages during normal
          business hours. Cancellation fees are applied per the relevant Supplier&apos;s policy
          in effect on the date the cancellation request is received.
        </p>
        <p>
          Refunds, when applicable, are processed back to the original payment method and may
          take several billing cycles to appear on your statement, depending on your card
          issuer.
        </p>
      </Section>

      <Separator />

      <Section title="Travel insurance">
        <p>
          <strong>Travel insurance is strongly recommended</strong> and may be required by some
          Suppliers or destinations. Phoenix Voyages offers comprehensive travel insurance
          through licensed Canadian underwriters covering medical, trip cancellation, trip
          interruption, baggage, and accidental death and dismemberment.
        </p>
        <p>
          If you decline travel insurance, we will document your declination in writing. You
          acknowledge that, without insurance, you assume full financial responsibility for any
          covered losses, including but not limited to cancellation penalties, medical
          expenses incurred abroad, and emergency evacuation costs.
        </p>
      </Section>

      <Separator />

      <Section title="Travel documents (passports, visas, entry requirements)">
        <p>
          You are solely responsible for ensuring that you and every traveller in your booking
          hold the correct travel documents for your itinerary, including:
        </p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            A <strong>valid passport</strong> with at least six (6) months of validity beyond
            your scheduled return date, and the number of blank pages required by your
            destination(s);
          </li>
          <li>
            Any <strong>visas</strong>, electronic travel authorizations (e.g., U.S. ESTA,
            Canadian eTA, Australian ETA, UK ETA, etc.), or entry permits required for the
            countries you will visit or transit;
          </li>
          <li>
            Any <strong>vaccination certificates</strong> or health-screening documentation
            required by destination governments;
          </li>
          <li>
            For minors travelling without one or both legal guardians: a notarized parental
            consent letter, where required.
          </li>
        </ul>
        <p>
          Phoenix Voyages will provide general document guidance, but the responsibility to
          obtain and present correct documentation rests with the traveller. We are not
          responsible for losses or expenses arising from inadequate documentation, denied
          boarding, or refused entry.
        </p>
      </Section>

      <Separator />

      <Section title="Force majeure">
        <p>
          Phoenix Voyages is not liable for failure to perform, or delay in performance, caused
          by circumstances beyond our reasonable control, including but not limited to acts of
          God, war, terrorism, civil unrest, government action, pandemic, epidemic, quarantine,
          strikes, labour disputes, mechanical breakdowns, severe weather, natural disasters,
          or any other force majeure event. In such circumstances, Supplier policies govern
          your entitlement to refunds, credits, or rebookings.
        </p>
      </Section>

      <Separator />

      <Section title="Limitation of liability">
        <p>
          To the maximum extent permitted by law, Phoenix Voyages&apos; liability under or in
          connection with any booking is limited to the amount we received as commission on
          that booking. We shall not be liable for any indirect, incidental, consequential,
          punitive, or exemplary damages, including lost profits or lost enjoyment of travel,
          arising out of or in connection with the use of our services.
        </p>
        <p>
          Nothing in these Terms limits or excludes any liability that cannot be limited or
          excluded under applicable Canadian law, including the <em>Travel Industry Act, 2002</em>{" "}
          and the <em>Consumer Protection Act, 2002</em>.
        </p>
      </Section>

      <Separator />

      <Section title="TICO compensation fund">
        <p>
          Phoenix Voyages is required to participate in the Ontario Travel Industry
          Compensation Fund administered by TICO. The Fund provides limited reimbursement to
          eligible Ontario consumers who have paid for travel services that were not delivered
          because of a Supplier&apos;s or retailer&apos;s financial failure. Claims and
          eligibility are governed by Ontario Reg. 26/05. For full details, visit{" "}
          <a
            href="https://www.tico.ca"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[#C59746] underline-offset-4 hover:underline"
          >
            www.tico.ca
          </a>
          .
        </p>
      </Section>

      <Separator />

      <Section title="Dispute resolution and TICO complaints">
        <p>
          If you have a complaint about services we provided, please contact your Travel
          Advisor first; we aim to resolve issues directly and quickly. If you remain
          dissatisfied, you may contact TICO at <a href="https://www.tico.ca" target="_blank" rel="noopener noreferrer" className="font-medium text-[#C59746] underline-offset-4 hover:underline">www.tico.ca</a>{" "}
          or by phone at 1-888-451-TICO (8426) to escalate the complaint.
        </p>
      </Section>

      <Separator />

      <Section title="Governing law and jurisdiction">
        <p>
          These Terms are governed by the laws of the Province of Ontario and the federal laws
          of Canada applicable therein. Any dispute arising under or in connection with these
          Terms shall be brought in the courts of the Province of Ontario, which shall have
          exclusive jurisdiction, subject to any mandatory consumer-protection statute that
          provides otherwise.
        </p>
      </Section>

      <Separator />

      <Section title="Changes to these Terms">
        <p>
          We may amend these Terms from time to time. The &quot;Last updated&quot; date at the
          top of this page reflects the latest revision. The Terms in effect at the time you
          made your booking govern that booking.
        </p>
      </Section>

      <Separator />

      <Section title="Contact us">
        <p>
          Phoenix Voyages — TICO Registration #{TICO_REG}
          <br />
          Email:{" "}
          <a
            href="mailto:info@phoenixvoyages.ca"
            className="font-medium text-[#C59746] underline-offset-4 hover:underline"
          >
            info@phoenixvoyages.ca
          </a>
        </p>
      </Section>
    </ContentPage>
  );
}
