export function CredentialRecoveryHint({ returnTo }: { readonly returnTo: string }) {
  const recoveryHref = `/auth/forgot-password?returnTo=${encodeURIComponent(returnTo)}`;
  return (
    <p className="m-0 text-sm text-[var(--color-text-muted)]">
      Signed in with an email link or provider and do not have a password?{" "}
      <a className="font-semibold" href={recoveryHref}>
        Set one through verified email recovery
      </a>
      , then return to confirm this action.
    </p>
  );
}
