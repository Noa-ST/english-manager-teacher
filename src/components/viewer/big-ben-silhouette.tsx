import * as React from "react";

/**
 * Architectural line art silhouette of Elizabeth Tower (Big Ben),
 * reflecting the British Academic Editorial heritage of English Manager.
 */
export function BigBenSilhouette({
  className = "w-44 text-[#D9AE54]",
  opacity = 0.22,
}: {
  className?: string;
  opacity?: number;
}) {
  return (
    <svg
      viewBox="0 0 160 480"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ opacity }}
      aria-hidden="true"
    >
      {/* Central Spire Finial & Cross */}
      <line x1="80" y1="10" x2="80" y2="45" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="74" y1="22" x2="86" y2="22" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="80" cy="30" r="2.5" fill="currentColor" />

      {/* Spire Roof Pyramid */}
      <path d="M80 45L64 125H96L80 45Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="80" y1="45" x2="80" y2="125" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
      {/* Spire Lucarne Windows */}
      <path d="M76 80L80 72L84 80H76Z" fill="currentColor" />
      <path d="M74 105L80 94L86 105H74Z" fill="currentColor" />

      {/* Corner Spirelets (Pinnacles) */}
      <path d="M58 135L52 95L56 135" stroke="currentColor" strokeWidth="1.2" />
      <path d="M102 135L108 95L104 135" stroke="currentColor" strokeWidth="1.2" />

      {/* Belfry & Clock Cornice Stage */}
      <rect x="56" y="125" width="48" height="18" stroke="currentColor" strokeWidth="1.5" />
      <line x1="56" y1="131" x2="104" y2="131" stroke="currentColor" strokeWidth="1" />
      <line x1="56" y1="137" x2="104" y2="137" stroke="currentColor" strokeWidth="1" />

      {/* Clock Face Chamber */}
      <rect x="52" y="143" width="56" height="56" stroke="currentColor" strokeWidth="1.8" />
      {/* Corner Turrets */}
      <rect x="46" y="139" width="6" height="64" stroke="currentColor" strokeWidth="1.2" />
      <rect x="108" y="139" width="6" height="64" stroke="currentColor" strokeWidth="1.2" />
      <line x1="49" y1="139" x2="49" y2="125" stroke="currentColor" strokeWidth="1.2" />
      <line x1="111" y1="139" x2="111" y2="125" stroke="currentColor" strokeWidth="1.2" />

      {/* Ornate Circular Clock Dial */}
      <circle cx="80" cy="171" r="23" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="80" cy="171" r="20" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 2" />
      <circle cx="80" cy="171" r="3" fill="currentColor" />
      {/* Clock Hands pointing to ~10:10 */}
      <line x1="80" y1="171" x2="72" y2="161" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="80" y1="171" x2="92" y2="164" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      {/* Hour markers */}
      <line x1="80" y1="150" x2="80" y2="153" stroke="currentColor" strokeWidth="1.5" />
      <line x1="80" y1="189" x2="80" y2="192" stroke="currentColor" strokeWidth="1.5" />
      <line x1="59" y1="171" x2="62" y2="171" stroke="currentColor" strokeWidth="1.5" />
      <line x1="98" y1="171" x2="101" y2="171" stroke="currentColor" strokeWidth="1.5" />

      {/* Intermediate Balcony Stage */}
      <rect x="50" y="199" width="60" height="16" stroke="currentColor" strokeWidth="1.4" />
      {/* Arched Belfry Arcades */}
      <path d="M58 215V203C58 200 62 200 62 203V215" stroke="currentColor" strokeWidth="1" />
      <path d="M68 215V203C68 200 72 200 72 203V215" stroke="currentColor" strokeWidth="1" />
      <path d="M78 215V203C78 200 82 200 82 203V215" stroke="currentColor" strokeWidth="1" />
      <path d="M88 215V203C88 200 92 200 92 203V215" stroke="currentColor" strokeWidth="1" />
      <path d="M98 215V203C98 200 102 200 102 203V215" stroke="currentColor" strokeWidth="1" />

      {/* Main Tower Shaft */}
      <rect x="52" y="215" width="56" height="260" stroke="currentColor" strokeWidth="1.6" />
      {/* Vertical Gothic Mullions */}
      <line x1="62" y1="215" x2="62" y2="475" stroke="currentColor" strokeWidth="1" />
      <line x1="71" y1="215" x2="71" y2="475" stroke="currentColor" strokeWidth="1" />
      <line x1="80" y1="215" x2="80" y2="475" stroke="currentColor" strokeWidth="1" />
      <line x1="89" y1="215" x2="89" y2="475" stroke="currentColor" strokeWidth="1" />
      <line x1="98" y1="215" x2="98" y2="475" stroke="currentColor" strokeWidth="1" />

      {/* Horizontal Dividing Courses / Tracery */}
      <line x1="52" y1="260" x2="108" y2="260" stroke="currentColor" strokeWidth="1.2" />
      <line x1="52" y1="310" x2="108" y2="310" stroke="currentColor" strokeWidth="1.2" />
      <line x1="52" y1="365" x2="108" y2="365" stroke="currentColor" strokeWidth="1.2" />
      <line x1="52" y1="420" x2="108" y2="420" stroke="currentColor" strokeWidth="1.2" />

      {/* Lancet Louvres & Windows in Shaft */}
      <path d="M64 250V230C64 227 69 227 69 230V250" stroke="currentColor" strokeWidth="0.8" />
      <path d="M73 250V230C73 227 78 227 78 230V250" stroke="currentColor" strokeWidth="0.8" />
      <path d="M82 250V230C82 227 87 227 87 230V250" stroke="currentColor" strokeWidth="0.8" />
      <path d="M91 250V230C91 227 96 227 96 230V250" stroke="currentColor" strokeWidth="0.8" />

      <path d="M64 300V280C64 277 69 277 69 280V300" stroke="currentColor" strokeWidth="0.8" />
      <path d="M73 300V280C73 277 78 277 78 280V300" stroke="currentColor" strokeWidth="0.8" />
      <path d="M82 300V280C82 277 87 277 87 280V300" stroke="currentColor" strokeWidth="0.8" />
      <path d="M91 300V280C91 277 96 277 96 280V300" stroke="currentColor" strokeWidth="0.8" />

      <path d="M64 355V335C64 332 69 332 69 335V355" stroke="currentColor" strokeWidth="0.8" />
      <path d="M73 355V335C73 332 78 332 78 335V355" stroke="currentColor" strokeWidth="0.8" />
      <path d="M82 355V335C82 332 87 332 87 335V355" stroke="currentColor" strokeWidth="0.8" />
      <path d="M91 355V335C91 332 96 332 96 335V355" stroke="currentColor" strokeWidth="0.8" />

      {/* Decorative Outer Buttresses */}
      <rect x="46" y="215" width="6" height="260" stroke="currentColor" strokeWidth="1" />
      <rect x="108" y="215" width="6" height="260" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

