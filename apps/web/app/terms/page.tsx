import { brandConfig } from "@lumen/config/brand";
import type { Metadata } from "next";

import { PublicInformationPage } from "@/components/public-information-page";

export const metadata: Metadata = {
  alternates: { canonical: "/terms" },
  description: `The beta terms that apply when using ${brandConfig.name}.`,
  title: "Terms",
};

export default function TermsPage() {
  return (
    <PublicInformationPage
      currentPath="/terms"
      eyebrow="Beta terms"
      notice={
        <p>
          These terms cover the account and privacy features currently available. Study-set
          publishing and public live game rooms are not available in this beta.
        </p>
      }
      summary={`These rules keep ${brandConfig.name} useful, secure, and respectful while the platform grows.`}
      title="Clear rules for using the service."
    >
      <section aria-labelledby="terms-acceptance" id="acceptance">
        <h2 id="terms-acceptance">Using the service</h2>
        <p>
          By creating an account or using this service, you agree to these terms and its privacy
          notice. If you use the service for an organization, you must have authority to accept the
          terms for that organization. If you do not agree, do not use the service.
        </p>
        <p>
          Use only the features and access made available to your account. Do not attempt to bypass
          restrictions or access controls.
        </p>
      </section>

      <section aria-labelledby="terms-eligibility" id="eligibility">
        <h2 id="terms-eligibility">Eligibility and accounts</h2>
        <p>
          This beta is for people age 13 or older. Under-13 learners cannot create an account, and
          guardian-managed child profiles are not currently available.
        </p>
        <p>
          Keep credentials private, provide accurate age-band and account information, and tell the
          service operator promptly if you believe an account has been compromised. You are
          responsible for activity performed through sessions you authorize until they are revoked.
        </p>
      </section>

      <section aria-labelledby="terms-conduct" id="acceptable-use">
        <h2 id="terms-conduct">Acceptable use</h2>
        <p>You may not use the service to:</p>
        <ul>
          <li>break the law or violate another person&apos;s rights;</li>
          <li>harass, exploit, groom, threaten, or endanger another person;</li>
          <li>upload malware, probe accounts, evade rate limits, or bypass access controls;</li>
          <li>
            scrape another service, automate third-party logins, or import content you lack
            permission to use;
          </li>
          <li>impersonate a person or misrepresent authority over a learner profile; or</li>
          <li>
            use a nickname, handle, or shared content to expose private or sensitive information.
          </li>
        </ul>
      </section>

      <section aria-labelledby="terms-content" id="content">
        <h2 id="terms-content">Your content and product materials</h2>
        <p>
          Study-content creation, import, and sharing are not available in this beta. Before the
          service accepts study material, these terms must explain how that content is hosted,
          displayed, exported, and removed. You will retain rights you already hold in material you
          are authorized to provide.
        </p>
        <p>
          The service software, design, and documentation remain the property of their respective
          owners and licensors. These terms do not grant permission to copy branding, bypass
          technical protections, or use proprietary materials outside the service.
        </p>
      </section>

      <section aria-labelledby="terms-guests" id="guests">
        <h2 id="terms-guests">Guests and learner profiles</h2>
        <p>
          Public live game rooms are not available in this beta. The room-code flow checks for an
          active guest-enabled room before creating any temporary guest identity. A learner profile
          is a bounded identity, not a separate account, and does not receive the account
          holder&apos;s private settings or administrative access.
        </p>
      </section>

      <section aria-labelledby="terms-enforcement" id="enforcement">
        <h2 id="terms-enforcement">Protection and enforcement</h2>
        <p>
          Access may be limited or suspended to protect learners, investigate abuse, comply with
          law, or maintain service integrity. Where appropriate, the operator should give notice and
          a reasonable opportunity to export account data. Serious safety or security risks may
          require immediate action.
        </p>
      </section>

      <section aria-labelledby="terms-availability" id="availability">
        <h2 id="terms-availability">Beta availability and changes</h2>
        <p>
          This is beta software. Features may change, and uninterrupted or error-free operation is
          not guaranteed. The service is provided as available, subject to rights and warranties
          that cannot lawfully be excluded. Do not rely on the service as the sole copy of critical
          information.
        </p>
        <p>
          Material term changes should be dated and communicated before they take effect. Continued
          use after an effective change means the updated terms apply. Operator identity, support
          details, and governing law are not yet published. These terms are therefore incomplete and
          should not be treated as final legal terms.
        </p>
      </section>
    </PublicInformationPage>
  );
}
