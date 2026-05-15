import type { Metadata } from "next";

import { ContentPage } from "@/components/layout/content-page";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Privacy Policy | Phoenix Voyages",
  description:
    "Privacy Policy for Phoenix Voyages — how we collect, use, and protect your personal information under PIPEDA.",
};

const LAST_UPDATED = "May 15, 2026";

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

export default function PrivacyPage() {
  return (
    <ContentPage title="Privacy Policy">
      <p className="text-sm text-[#666]">Last updated: {LAST_UPDATED}</p>

      <Section title="About this policy">
        <p>
          Phoenix Voyages (&quot;<strong>we</strong>,&quot; &quot;<strong>us</strong>,&quot; or
          &quot;<strong>our</strong>&quot;) is a travel agency. This Privacy Policy describes how
          we collect, use, disclose, and safeguard your personal information in accordance with
          Canada&apos;s <em>Personal Information Protection and Electronic Documents Act</em>{" "}
          (PIPEDA) and applicable provincial privacy legislation. We are registered with the
          Travel Industry Council of Ontario (TICO Registration #50017089).
        </p>
        <p>
          By using our website, services, or making a booking, you consent to the practices
          described in this Policy.
        </p>
      </Section>

      <Separator />

      <Section title="Information we collect">
        <p>We collect personal information in the following ways:</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>Information you provide:</strong> name, date of birth, email address, phone
            number, mailing address, passport details, citizenship, traveller preferences,
            payment card information, emergency contact details, and any special-needs
            information you choose to share for the purpose of arranging travel.
          </li>
          <li>
            <strong>Information we collect automatically:</strong> IP address, browser type,
            device identifiers, pages visited, referring URLs, and similar technical
            information collected via cookies and analytics tools.
          </li>
          <li>
            <strong>Information from third parties:</strong> we may receive information from
            travel suppliers (cruise lines, airlines, hotels, tour operators) and from our
            payment processors when they confirm transactions on our behalf.
          </li>
        </ul>
      </Section>

      <Separator />

      <Section title="How we use your information">
        <p>We use the personal information we collect to:</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>Process bookings, payments, and refunds;</li>
          <li>
            Communicate with you about your travel arrangements, itinerary changes, and
            documentation requirements;
          </li>
          <li>
            Provide customer service before, during, and after your trip;
          </li>
          <li>
            Send you marketing communications and special offers, where you have opted in (you
            can unsubscribe at any time using the link in any of our emails);
          </li>
          <li>
            Comply with legal and regulatory obligations under TICO, PIPEDA, the Canada Revenue
            Agency, and similar authorities;
          </li>
          <li>
            Operate, secure, and improve our website and services, including fraud prevention.
          </li>
        </ul>
      </Section>

      <Separator />

      <Section title="When we share information">
        <p>
          We do <strong>not</strong> sell your personal information to anyone. We share
          information only when necessary, as follows:
        </p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>Travel suppliers</strong> (cruise lines, airlines, hotels, tour operators,
            transfer providers, insurance providers) require traveller information to issue
            bookings, tickets, and travel documents.
          </li>
          <li>
            <strong>Payment processors</strong> (e.g., Stripe) process card payments. We do not
            store full card numbers on our systems.
          </li>
          <li>
            <strong>Service providers</strong> (e.g., email delivery, cloud hosting, customer
            support tooling) operate under written confidentiality terms and use your data only
            to provide services on our behalf.
          </li>
          <li>
            <strong>Government authorities</strong> when required by law, court order, or to
            cooperate with TICO compliance reviews.
          </li>
          <li>
            <strong>Successors in interest</strong> in the event of a corporate reorganization,
            merger, or sale of all or substantially all of our assets.
          </li>
        </ul>
      </Section>

      <Separator />

      <Section title="International data transfers">
        <p>
          Some of our service providers operate outside Canada. Personal information processed
          on our behalf may be transferred to, stored in, or accessed from the United States,
          the European Union, and other jurisdictions. While transferred data remains subject
          to this Policy and our written agreements with those providers, it may also be
          subject to access requests by foreign governments, courts, and law-enforcement or
          national-security authorities under their applicable laws.
        </p>
      </Section>

      <Separator />

      <Section title="How long we keep your information">
        <p>
          We retain personal information only for as long as necessary to fulfill the purposes
          for which it was collected, to comply with our legal, accounting, and regulatory
          obligations (including TICO record-keeping requirements, typically <strong>six (6)
          years</strong> for booking records), and to enforce our agreements. When information
          is no longer required, we securely destroy or de-identify it.
        </p>
      </Section>

      <Separator />

      <Section title="Cookies and similar technologies">
        <p>
          Our website uses cookies, pixels, and similar technologies for site functionality,
          analytics, and marketing. Necessary cookies (e.g., session management, CSRF protection,
          load balancing) cannot be disabled. You can manage your preferences for analytics and
          marketing cookies via the cookie banner shown on your first visit, or by clearing
          cookies through your browser settings. Disabling cookies may affect site
          functionality.
        </p>
      </Section>

      <Separator />

      <Section title="Your rights under PIPEDA">
        <p>You have the right to:</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>Access</strong> the personal information we hold about you;
          </li>
          <li>
            <strong>Request correction</strong> of inaccurate or incomplete information;
          </li>
          <li>
            <strong>Withdraw consent</strong> for non-essential uses (e.g., marketing
            communications) at any time, subject to legal and contractual obligations;
          </li>
          <li>
            <strong>Request deletion</strong> of your personal information, subject to our
            obligation to retain certain records (e.g., TICO compliance records);
          </li>
          <li>
            <strong>Lodge a complaint</strong> with the Office of the Privacy Commissioner of
            Canada (<a href="https://www.priv.gc.ca" className="font-medium text-[#C59746] underline-offset-4 hover:underline" target="_blank" rel="noopener noreferrer">www.priv.gc.ca</a>) if you believe your rights have been violated.
          </li>
        </ul>
        <p>
          To exercise any of these rights, contact our Privacy Officer at the address below.
          We will respond within <strong>thirty (30) days</strong>.
        </p>
      </Section>

      <Separator />

      <Section title="Security">
        <p>
          We use reasonable administrative, technical, and physical safeguards designed to
          protect your personal information from loss, theft, and unauthorized access. These
          include encryption in transit, access controls, and staff training. No method of
          transmission or storage is perfectly secure; we cannot guarantee absolute security.
        </p>
      </Section>

      <Separator />

      <Section title="Breach notification">
        <p>
          In the event of a breach of security safeguards involving your personal information
          that creates a real risk of significant harm, we will notify you and the Office of
          the Privacy Commissioner of Canada as required by PIPEDA, and maintain records of all
          breaches for at least 24 months.
        </p>
      </Section>

      <Separator />

      <Section title="Children&apos;s privacy">
        <p>
          Our website and services are not directed to children under the age of 13, and we do
          not knowingly collect personal information from children under 13 without parental
          consent. Travel bookings involving minors must be made by a parent or legal guardian.
        </p>
      </Section>

      <Separator />

      <Section title="Changes to this Policy">
        <p>
          We may update this Policy from time to time. The &quot;Last updated&quot; date at the
          top of this page reflects the latest revision. Material changes will be communicated
          via email to active customers or via a prominent notice on our website.
        </p>
      </Section>

      <Separator />

      <Section title="Contact our Privacy Officer">
        <p>
          For privacy-related inquiries, to exercise your rights, or to file a complaint:
        </p>
        <p>
          Phoenix Voyages
          <br />
          Privacy Officer
          <br />
          Email:{" "}
          <a
            href="mailto:privacy@phoenixvoyages.ca"
            className="font-medium text-[#C59746] underline-offset-4 hover:underline"
          >
            privacy@phoenixvoyages.ca
          </a>
          <br />
          Phone: contact your Travel Advisor or use the form on our Contact page.
        </p>
        <p className="text-sm text-[#666]">
          Phoenix Voyages is registered with the Travel Industry Council of Ontario (TICO).
        </p>
      </Section>
    </ContentPage>
  );
}
