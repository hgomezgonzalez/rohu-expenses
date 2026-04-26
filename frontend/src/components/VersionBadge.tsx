"use client";

const VERSION = "v0.2.0";
const BUILD_DATE = process.env.NEXT_PUBLIC_BUILD_DATE || new Date().toISOString().slice(0, 16).replace("T", " ");

export default function VersionBadge() {
  return (
    <div className="text-[10px] text-center leading-tight opacity-60">
      <span className="font-medium">{VERSION}</span>
      <br />
      {BUILD_DATE}
    </div>
  );
}
