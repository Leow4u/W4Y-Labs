/**
 * useAccountSurface — React view of the account vs worker routing decision.
 *
 * cloudReady = shell bridge present (desktop local-engine).
 * loggedIn = probeCloudLogin (cached via accountApi); null while probing.
 * surface = "account" when web OR (desktop + logged in); else "worker".
 */
import { useEffect, useState } from "react";

import {
  accountBridgeAvailable,
  shouldUseAccountCloud,
} from "@/lib/accountApi";
import { isLocalEngine } from "@/lib/projects";

export function useAccountSurface(): {
  surface: "account" | "worker";
  cloudReady: boolean;
  loggedIn: boolean | null;
} {
  const cloudReady = accountBridgeAvailable();
  const [loggedIn, setLoggedIn] = useState<boolean | null>(() =>
    isLocalEngine() ? null : true,
  );

  useEffect(() => {
    if (!isLocalEngine()) {
      setLoggedIn(true);
      return;
    }
    if (!cloudReady) {
      setLoggedIn(false);
      return;
    }
    let cancelled = false;
    void shouldUseAccountCloud().then((ok) => {
      if (!cancelled) setLoggedIn(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [cloudReady]);

  const surface: "account" | "worker" =
    !isLocalEngine() || loggedIn === true ? "account" : "worker";

  return { surface, cloudReady, loggedIn };
}
