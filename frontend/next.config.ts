import type { NextConfig } from "next";

// Generate build date in Bogota timezone (UTC-5)
const bogotaDate = new Date().toLocaleString("sv-SE", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_DATE: bogotaDate,
  },
};

export default nextConfig;
