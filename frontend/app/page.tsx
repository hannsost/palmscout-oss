"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/auth";
import { PUBLIC_REGISTRATION_ENABLED } from "@/lib/release-flags";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (auth.isLoggedIn()) {
      const user = auth.getUser();
      const home = user?.role === "admin" && !user.tenant_id ? "/admin"
        : user?.role === "admin" || user?.role === "recruiter" ? "/dashboard"
        : user?.role === "worker" ? "/worker"
        : user?.role === "support" ? "/support" : "/profile";
      router.replace(home);
    } else {
      router.replace(PUBLIC_REGISTRATION_ENABLED ? "/landing" : "/login");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

  return null;
}
