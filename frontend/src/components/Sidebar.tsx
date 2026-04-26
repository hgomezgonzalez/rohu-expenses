"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Home, FileText, Wallet, BarChart3, Receipt, UserCircle,
  Settings, Users, LogOut, MoreHorizontal, X,
} from "lucide-react";
import VersionBadge from "@/components/VersionBadge";
import { getDashboardFull } from "@/lib/api";

const baseNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/dashboard/templates", label: "Plantillas", icon: FileText },
  { href: "/dashboard/income", label: "Ingresos", icon: Wallet },
  { href: "/dashboard/payments", label: "Historial", icon: Receipt },
  { href: "/dashboard/reports", label: "Reportes", icon: BarChart3 },
  { href: "/dashboard/profile", label: "Mi Perfil", icon: UserCircle },
];

const adminNavItem = { href: "/dashboard/admin", label: "Usuarios", icon: Users };
const configNavItem = { href: "/dashboard/settings", label: "Config", icon: Settings };

// Mobile bottom nav: 4 main items + "Más"
const mobileMainItems = [
  baseNavItems[0], // Dashboard
  baseNavItems[1], // Plantillas
  baseNavItems[3], // Historial
  baseNavItems[4], // Reportes
];

// Items inside "Más" panel
const mobileMoreItems = [
  baseNavItems[2], // Ingresos
  baseNavItems[5], // Mi Perfil
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [counts, setCounts] = useState<{ overdue: number; pending: number; paid: number }>({ overdue: 0, pending: 0, paid: 0 });
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    setIsAdmin(localStorage.getItem("user_role") === "admin");
    const now = new Date();
    getDashboardFull(now.getFullYear(), now.getMonth() + 1)
      .then((data) => {
        setCounts({
          overdue: data.summary.count_overdue,
          pending: data.summary.count_pending + data.summary.count_due_soon,
          paid: data.summary.count_paid,
        });
      })
      .catch(() => {});
  }, []);

  // Close "Más" panel on navigation
  useEffect(() => { setShowMore(false); }, [pathname]);

  const navItems = [
    ...baseNavItems,
    ...(isAdmin ? [adminNavItem, configNavItem] : []),
  ];

  const moreItems = [
    ...mobileMoreItems,
    ...(isAdmin ? [adminNavItem, configNavItem] : []),
  ];

  // Check if current page is inside "Más"
  const isMoreActive = moreItems.some((item) => pathname === item.href);

  function handleLogout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_role");
    router.push("/");
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-56 bg-rohu-primary min-h-screen fixed left-0 top-0 z-30">
        <div className="flex items-center justify-center px-4 py-3 border-b border-white/10">
          <div className="bg-white rounded-xl px-3 py-2">
            <Image src="/logo-rohu.webp" alt="ROHU PayControl" width={120} height={45} className="object-contain" />
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? "text-white" : "text-white/60"}`} />
                <span className="flex-1">{item.label}</span>
                {item.href === "/dashboard" && counts.overdue > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full min-w-[20px] text-center">{counts.overdue}</span>
                )}
                {item.href === "/dashboard/payments" && counts.paid > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-white/20 text-white/80 rounded-full min-w-[20px] text-center">{counts.paid}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-white/10 space-y-2">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white w-full transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Cerrar sesión
          </button>
          <div className="text-white/40">
            <VersionBadge />
          </div>
        </div>
      </aside>

      {/* Mobile: "Más" panel overlay */}
      {showMore && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowMore(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl pb-[env(safe-area-inset-bottom)] animate-slide-up">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold text-lg">Más opciones</h3>
              <button onClick={() => setShowMore(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="px-3 py-2 space-y-1">
              {moreItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMore(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? "bg-rohu-primary/10 text-rohu-primary" : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </Link>
                );
              })}
              <button
                onClick={() => { setShowMore(false); handleLogout(); }}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 w-full transition-colors"
              >
                <LogOut className="w-5 h-5" />
                Cerrar sesión
              </button>
            </nav>
            <div className="px-5 py-3 border-t text-gray-400">
              <VersionBadge />
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-rohu-primary z-40 px-1 pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-around py-1.5">
          {mobileMainItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 min-w-[44px] min-h-[44px] justify-center rounded-lg text-[10px] transition-colors ${
                  isActive ? "text-white" : "text-white/50"
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
                {item.href === "/dashboard" && counts.overdue > 0 && (
                  <span className="absolute -top-1 -right-1 px-1 text-[8px] font-bold bg-red-500 text-white rounded-full">{counts.overdue}</span>
                )}
              </Link>
            );
          })}
          {/* "Más" button */}
          <button
            onClick={() => setShowMore(!showMore)}
            className={`flex flex-col items-center gap-0.5 min-w-[44px] min-h-[44px] justify-center rounded-lg text-[10px] transition-colors ${
              isMoreActive || showMore ? "text-white" : "text-white/50"
            }`}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span>Más</span>
          </button>
        </div>
      </nav>
    </>
  );
}
