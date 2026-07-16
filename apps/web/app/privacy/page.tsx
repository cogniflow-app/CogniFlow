import { brandConfig } from "@lumen/config/brand";
import type { Metadata } from "next";

import { PublicInformationPage } from "@/components/public-information-page";

export const metadata: Metadata = {
  alternates: { canonical: "/privacy" },
  description: `How ${brandConfig.name} handles account, learner, guest, and privacy-request data.`,
  title: "Privacy",
};

export default function PrivacyPage() {
  return (
    <PublicInformationPage
      currentPath="/privacy"
      eyebrow="Privacy notice"
      notice={
        <p>
          This notice covers the identity and account features available in the current beta. A
          deployment owner must publish its legal identity and contact channel, and complete its
          provider and legal reviews, before enabling under-13 access.
        </p>
      }
      summary={`${brandConfig.name} is designed to collect the minimum information needed for secure access, learner boundaries, and user-directed privacy controls.`}
      title="Your data should serve your learning."
    >
      <section aria-labelledby="privacy-scope" id="scope">
        <h2 id="privacy-scope">What this notice covers</h2>
        <p>
          It applies to public visitors, account holders, learner profiles, and short-lived game
          guests on this deployment. The current phase does not publish study sets, creator
          profiles, or live game rooms. This notice must be updated before later features collect
          new categories of learning or sharing data.
        </p>
      </section>

      <section aria-labelledby="privacy-collect" id="information-we-collect">
        <h2 id="privacy-collect">Information we collect</h2>
        <ul>
          <li>
            <strong>Account access:</strong> email address, authentication provider identifiers,
            verification state, and the security events needed to operate sign-in and recovery.
          </li>
          <li>
            <strong>Profile choices:</strong> display name, handle, locale, time zone, age band,
            optional learning goals, and accessibility or appearance preferences.
          </li>
          <li>
            <strong>Security context:</strong> device and session records, expiry times, rate-limit
            counters, and audit records for sensitive account changes. Secret tokens and profile
            PINs are stored only as one-way hashes.
          </li>
          <li>
            <strong>Privacy requests:</strong> the type and status of export or deletion requests,
            including a cancellation grace period where configured.
          </li>
          <li>
            <strong>Ephemeral guests:</strong> a safe nickname, room reference, expiry, and hashed
            reconnect token when a valid game room is available. Guests do not receive persistent XP
            or an account unless they later choose to sign up.
          </li>
        </ul>
        <p>
          We do not ask for an exact birthday by default. A guardian-managed child profile does not
          require a child email, address, phone number, or exact school.
        </p>
      </section>

      <section aria-labelledby="privacy-use" id="how-we-use-data">
        <h2 id="privacy-use">How information is used</h2>
        <p>
          Information is used to authenticate accounts, maintain the selected learner context, apply
          preferences, prevent abuse, investigate security events, and carry out privacy requests.
          Authorization-critical permissions come from server-controlled records, not editable
          profile metadata.
        </p>
        <p>
          The default product position is no advertising and no sale of learner data. Analytics,
          when enabled by a deployment, must be first-party, respect the account preference, and be
          minimized on child surfaces. Session replay and cross-site tracking are not part of the
          child experience.
        </p>
      </section>

      <section aria-labelledby="privacy-sharing" id="sharing">
        <h2 id="privacy-sharing">Service providers and disclosure</h2>
        <p>
          A deployment may use infrastructure providers for authentication, database hosting, email
          delivery, storage, and security operations. Those providers receive only the information
          needed to provide their service. Information may also be disclosed when required by law,
          to protect users or the service, or as part of a properly notified change of operator.
        </p>
        <p>
          Connecting an optional sign-in provider sends that provider the information required for
          authentication under its own terms. Provider buttons are shown only when the deployment
          has configured them.
        </p>
      </section>

      <section aria-labelledby="privacy-children" id="children">
        <h2 id="privacy-children">Age bands and child profiles</h2>
        <p>
          The Vercel beta is limited to people age 13 and older. Selecting the under-13 age band
          cannot create an independent account. Managed child profiles are disabled in every
          production runtime until the child-facing browser has an independent identity boundary and
          the consent, provider, retention, incident response, and legal gates are complete.
        </p>
        <p>
          Where the capability is enabled for authorized testing, a guardian creates a pseudonymous
          learner profile, access is explicit and revocable, and child analytics are minimized. A
          child profile cannot enter the guardian&apos;s account settings or inherit the
          guardian&apos;s email and administrative controls.
        </p>
      </section>

      <section aria-labelledby="privacy-retention" id="retention">
        <h2 id="privacy-retention">Retention, export, and deletion</h2>
        <p>
          Account and learner records are kept while they are needed to operate the account.
          Short-lived sessions and guest records expire. Security, consent, and audit records may be
          retained longer when needed to demonstrate a request, prevent abuse, or meet an
          operator&apos;s legal obligations. The signed-in privacy area shows the deployment&apos;s
          configured retention and request states.
        </p>
        <p>
          Signed-in users can request an account export and track its job status. Full downloadable
          archive generation belongs to the portability phase; the current interface identifies that
          boundary rather than claiming a file is ready. Account deletion requires recent
          re-authentication and may be cancelled during the configured grace period.
        </p>
      </section>

      <section aria-labelledby="privacy-choices" id="choices">
        <h2 id="privacy-choices">Your choices</h2>
        <ul>
          <li>Review and update profile and privacy preferences after signing in.</li>
          <li>Disconnect an optional sign-in provider when another safe sign-in method remains.</li>
          <li>Revoke devices, profile sessions, and guardian access you control.</li>
          <li>Request an export or deletion and review the real request status.</li>
          <li>Use the service without advertising or sale of learner data.</li>
        </ul>
        <p>
          If you cannot use the signed-in controls, contact the support channel published by the
          operator of your deployment. Do not send passwords, PINs, recovery links, or session
          tokens in a support request.
        </p>
      </section>

      <section aria-labelledby="privacy-security" id="security">
        <h2 id="privacy-security">Security and local preferences</h2>
        <p>
          The service uses access controls, row-level database policies, short-lived sessions,
          hashed sensitive tokens, mutation validation, rate limits, and audit events. No system can
          promise perfect security. Appearance choices may be stored on the device so the public
          site can honor theme, reduced-motion, and serious-mode settings without creating an
          account.
        </p>
      </section>
    </PublicInformationPage>
  );
}
