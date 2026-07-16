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
          This notice covers the account and privacy features available in this private beta. The
          operator&apos;s legal identity and privacy contact details are not yet published, and
          under-13 access is unavailable.
        </p>
      }
      summary={`${brandConfig.name} is designed to collect the minimum information needed for secure access, learner boundaries, and user-directed privacy controls.`}
      title="Your data should serve your learning."
    >
      <section aria-labelledby="privacy-scope" id="scope">
        <h2 id="privacy-scope">What this notice covers</h2>
        <p>
          It applies to public visitors, account holders, learner profiles, and the room-code guest
          flow. This beta does not publish study sets or creator profiles, and it does not host
          public live game rooms. This notice will be revised before new categories of learning or
          sharing data are collected.
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
            counters, and audit records for sensitive account changes. Profile PINs, profile-session
            tokens, and guest reconnect tokens are stored only as one-way hashes.
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
          We ask for an age range instead of an exact birthday. Child accounts and guardian-managed
          child profiles are not available in this beta.
        </p>
      </section>

      <section aria-labelledby="privacy-use" id="how-we-use-data">
        <h2 id="privacy-use">How information is used</h2>
        <p>
          Information is used to authenticate accounts, maintain the selected learner context, apply
          preferences, prevent abuse, investigate security events, and carry out privacy requests.
          Access permissions are based on protected account records, not a display name, handle, or
          other editable profile details.
        </p>
        <p>
          The default product position is no advertising and no sale of learner data. Analytics, if
          enabled, must be first-party and respect the account preference. No external analytics
          provider, session replay, or cross-site tracking is active in this beta.
        </p>
      </section>

      <section aria-labelledby="privacy-sharing" id="sharing">
        <h2 id="privacy-sharing">Service providers and disclosure</h2>
        <p>
          The service may use infrastructure providers for authentication, database hosting, email
          delivery, storage, and security operations. Those providers receive only the information
          needed to provide their service. Information may also be disclosed when required by law,
          to protect users or the service, or as part of a properly notified change of operator.
        </p>
        <p>
          Connecting an optional sign-in provider sends that provider the information required for
          authentication under its own terms. Provider buttons are shown only when that sign-in
          option is available.
        </p>
      </section>

      <section aria-labelledby="privacy-children" id="children">
        <h2 id="privacy-children">Age bands and child profiles</h2>
        <p>
          This beta is limited to people age 13 and older. Selecting the under-13 age band cannot
          create an account, and guardian-managed child profiles are not currently available.
        </p>
      </section>

      <section aria-labelledby="privacy-retention" id="retention">
        <h2 id="privacy-retention">Retention, export, and deletion</h2>
        <p>
          Account and learner records are kept while they are needed to operate the account.
          Short-lived sessions and guest records expire. Security, consent, and audit records may be
          retained longer when needed to demonstrate a request, prevent abuse, or meet an
          operator&apos;s legal obligations. The signed-in privacy area shows the configured
          retention windows and request states.
        </p>
        <p>
          Signed-in users can submit an account export request and track its status. Downloadable
          archive assembly is not yet available, so a queued request does not mean a file is ready.
          Account deletion requires recent re-authentication and may be cancelled during the
          configured grace period.
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
          A support and privacy contact has not yet been published for this private beta. When one
          is available, do not send passwords, PINs, recovery links, or session tokens in a support
          request.
        </p>
      </section>

      <section aria-labelledby="privacy-security" id="security">
        <h2 id="privacy-security">Security and local preferences</h2>
        <p>
          The service uses account-level access controls, short-lived sessions, hashed sensitive
          tokens, request validation, rate limits, and security audit records. No system can promise
          perfect security. Appearance choices may be stored on the device so the public site can
          honor theme, reduced-motion, and serious-mode settings without creating an account.
        </p>
      </section>
    </PublicInformationPage>
  );
}
