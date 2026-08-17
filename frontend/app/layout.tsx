"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import "./globals.css";

const API = "https://polymarket-trader-backend.onrender.com";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (pathname === "/login") return;
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }

    fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => {
      if (!r.ok) {
        localStorage.removeItem("token");
        localStorage.removeItem("username");
        router.push("/login");
      }
    }).catch(() => {});
  }, [pathname]);

  if (!mounted) return (
    <html lang="en">
      <body style={{ background: "#0D1117" }} />
    </html>
  );

  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
