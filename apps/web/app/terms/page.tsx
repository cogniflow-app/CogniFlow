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
          These terms cover the features that are actually enabled on this deployment. Study-set
          publishing and live game rooms are not part of the current identity phase, and nothing on
          this page promises access to an unfinished feature.
        </p>
      }
      summary={`These rules keep ${brandConfig.name} useful, secure, and respectful while the platform grows.`}
      title="Clear rules for a shared learning space."
    >
      <section aria-labelledby="terms-acceptance" id="acceptance">
        <h2 id="terms-acceptance">Using the service</h2>
        <p>
          By creating an account or using this deployment, you agree to these terms and its privacy
          notice. If you use the service for an organization, you must have authority to accept the
          terms for that organization. If you do not agree, do not use the service.
        </p>
        <p>
          Features may differ by deployment capability and account state. An interface hidden by a
          capability flag is not permission to bypass the same restriction at the server or database
          boundary.
        </p>
      </section>

      <section aria-labelledby="terms-eligibility" id="eligibility">
        <h2 id="terms-eligibility">Eligibility and accounts</h2>
        <p>
          The Vercel beta is for people age 13 or older. Under-13 learners may use only a
          guardian-managed profile on a deployment where the operator has enabled that capability
          after completing the required consent and provider reviews. A child may not create an
          independent account or supply a child email through a profile flow.
        </p>
        <p>
          Keep credentials private, provide accurate age-band and account information, and tell the
          deployment operator promptly if you believe an account has been compromised. You are
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
            use a nickname, handle, or future shared content to expose private or sensitive
            information.
          </li>
        </ul>
      </section>

      <section aria-labelledby="terms-content" id="content">
        <h2 id="terms-content">Your content and product materials</h2>
        <p>
          You retain rights you already hold in content you are authorized to provide. When content
          features are enabled, you grant the deployment operator only the permissions needed to
          host, process, back up, display according to your chosen visibility, and export that
          content. You remain responsible for having the necessary rights and for selecting an
          appropriate audience.
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
          A future valid game room may permit an ephemeral guest with a filtered nickname and an
          expiring reconnect credential. Guest access does not create persistent progress, XP, or
          ownership rights. A learner profile is a bounded study identity, not a separate account,
          and does not receive the account holder&apos;s private settings or administrative access.
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
          use after an effective change means the updated terms apply. A deployment owner must add
          its governing-law, operator identity, and support details before treating these terms as
          launch-complete legal terms.
        </p>
      </section>
    </PublicInformationPage>
  );
}
