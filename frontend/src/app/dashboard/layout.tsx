"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import BiometricPromptBanner from "@/components/BiometricPromptBanner";
import HelpFab from "@/components/HelpFab";
import { refreshSession } from "@/lib/api";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("access_token")) {
      router.push("/");
    } else {
      setReady(true);
    }
  }, [router]);

  // Refresh the access token whenever the PWA returns to foreground (mobile
  // browsers often suspend the tab and the access token expires while away).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      if (!localStorage.getItem("refresh_token")) return;
      const ok = await refreshSession();
      if (!ok) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        router.push("/?session=expired");
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-rohu-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      {/* Main content - offset for sidebar on desktop, bottom padding for mobile nav */}
      <main className="md:ml-56 pb-20 md:pb-0 min-h-screen">
        <BiometricPromptBanner />
        {children}
      </main>
      <HelpFab />
    </div>
  );
}
