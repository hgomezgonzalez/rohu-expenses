"use client";

const VERSION = "v0.3.0";
const BUILD_DATE = process.env.NEXT_PUBLIC_BUILD_DATE || "";

export default function VersionBadge() {
  return (
    <div className="text-[10px] text-center leading-tight opacity-60">
      <span className="font-medium">{VERSION}</span>
      <br />
      {BUILD_DATE}
    </div>
  );
}
