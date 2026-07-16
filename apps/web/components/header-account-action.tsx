import { type PublicViewerContext, readPublicViewerContext } from "@/lib/server/public-viewer";

export function HeaderAccountActionLink({ viewer }: { readonly viewer: PublicViewerContext }) {
  const href = viewer.authenticated ? viewer.accountHref : viewer.signInHref;

  return (
    <a
      aria-label={viewer.authenticated ? "Open your workspace" : "Sign in to your account"}
      className="site-nav__account"
      href={href}
    >
      {viewer.authenticated ? "Workspace" : "Sign in"}
    </a>
  );
}

export async function HeaderAccountAction() {
  return <HeaderAccountActionLink viewer={await readPublicViewerContext()} />;
}
