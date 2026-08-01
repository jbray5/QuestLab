import { useRef } from "react";

import { ROOMS, type Room } from "./templeContent";

/**
 * TempleCanvas (Plan 58) — the cutaway.
 *
 * The scene is the DM's own static blueprint SVG
 * (`campaigns/session-05-temple-blueprint.html`) transcribed to JSX, minus
 * its legend panel (that content now lives in the drawer and the print
 * view). The blueprint's numbered markers become live pins, and a party
 * token rides the route.
 *
 * When the painted cutaway arrives, set `artUrl` — the art replaces the
 * drawn scene and every pin keeps its blueprint coordinates.
 */

export default function TempleCanvas({
  currentId,
  marker,
  artUrl,
  onPick,
  onMarkerMove,
}: {
  currentId: string;
  marker: { x: number; y: number };
  artUrl?: string | null;
  onPick: (room: Room) => void;
  onMarkerMove: (pt: { x: number; y: number }) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  /** Client point → viewBox point. */
  function toViewBox(e: { clientX: number; clientY: number }) {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * 1600,
      y: ((e.clientY - r.top) / r.height) * 1000,
    };
  }

  function dragTo(e: { clientX: number; clientY: number }) {
    const pt = toViewBox(e);
    if (!pt) return;
    onMarkerMove(pt);
  }

  return (
    <svg
      ref={svgRef}
      className="tc-canvas"
      viewBox="0 0 1600 1000"
      xmlns="http://www.w3.org/2000/svg"
      onPointerMove={(e) => dragging.current && dragTo(e)}
      onPointerUp={() => (dragging.current = false)}
      onPointerLeave={() => (dragging.current = false)}
    >
      <defs>
        <linearGradient id="tcSea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0e3d52" />
          <stop offset=".5" stopColor="#082635" />
          <stop offset="1" stopColor="#04121c" />
        </linearGradient>
        <linearGradient id="tcSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9d6d2" />
          <stop offset="1" stopColor="#8fb0b4" />
        </linearGradient>
        <linearGradient id="tcStone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1c2a30" />
          <stop offset="1" stopColor="#101a20" />
        </linearGradient>
        <radialGradient id="tcGlowT" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#7fd4c8" stopOpacity=".55" />
          <stop offset="1" stopColor="#7fd4c8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="tcGlowW" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#ffd98a" stopOpacity=".6" />
          <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
        </radialGradient>
      </defs>

      {artUrl ? (
        <image href={artUrl} x="0" y="0" width="1600" height="1000" preserveAspectRatio="xMidYMid slice" />
      ) : (
        <g className="tc-scene">
          {/* sky + sea */}
          <rect width="1600" height="120" fill="url(#tcSky)" />
          <rect y="120" width="1600" height="880" fill="url(#tcSea)" />
          <line x1="0" y1="120" x2="1600" y2="120" stroke="#e8f2ee" strokeWidth="3" opacity=".8" />

          {/* the ship */}
          <g transform="translate(430,96)" fill="#20262b">
            <path d="M-70,20 Q0,44 70,20 L52,6 L-52,6 Z" />
            <rect x="-4" y="-46" width="5" height="52" />
            <path d="M1,-44 q34,14 0,30 Z" fill="#2c343a" />
          </g>
          <text x="430" y="66" textAnchor="middle" fill="#dbe7e3" fontSize="17" fontStyle="italic">
            the ship waits · glass sea · dawn
          </text>

          {/* parted water walls + stair */}
          <path d="M360,120 C380,300 420,520 470,700" fill="none" stroke="#7fd4c8" strokeWidth="5" opacity=".55" />
          <path d="M520,120 C540,260 560,330 585,392" fill="none" stroke="#7fd4c8" strokeWidth="5" opacity=".55" />
          <text
            x="318"
            y="210"
            fill="#7fd4c8"
            fontSize="15"
            fontStyle="italic"
            transform="rotate(80 318 210)"
          >
            standing water · the sea holds its breath
          </text>
          <g stroke="#9fb4ae" strokeWidth="3">
            <line x1="430" y1="130" x2="452" y2="130" />
            <line x1="440" y1="152" x2="462" y2="152" />
            <line x1="450" y1="174" x2="472" y2="174" />
            <line x1="460" y1="196" x2="482" y2="196" />
            <line x1="470" y1="218" x2="492" y2="218" />
            <line x1="480" y1="240" x2="502" y2="240" />
            <line x1="490" y1="262" x2="512" y2="262" />
            <line x1="500" y1="284" x2="522" y2="284" />
          </g>

          {/* fish + the big shadow */}
          <g fill="#57808a" opacity=".8">
            <path d="M300,260 q10,-6 18,0 q-8,6 -18,0 Z" />
            <path d="M282,330 q9,-5 16,0 q-7,5 -16,0 Z" />
            <path d="M610,300 q10,-6 18,0 q-8,6 -18,0 Z" />
          </g>
          <path d="M120,520 q120,-46 260,-10 q-40,34 -140,40 q-80,4 -120,-30 Z" fill="#0c2230" opacity=".9" />
          <text x="150" y="575" fill="#3f6470" fontSize="14" fontStyle="italic">
            something large keeps its distance
          </text>

          {/* ① Tide Gate */}
          <g>
            <rect x="470" y="392" width="180" height="110" rx="10" fill="url(#tcStone)" stroke="#3d565c" strokeWidth="2.5" />
            <path d="M650,412 a34,40 0 0 1 0,72" fill="none" stroke="#7fd4c8" strokeWidth="7" opacity=".85" />
            <text x="676" y="392" fill="#7fd4c8" fontSize="14" fontStyle="italic">
              door of standing water · fish hang frozen inside it
            </text>
            <circle cx="512" cy="470" r="14" fill="url(#tcGlowT)" />
            <circle cx="512" cy="470" r="7" fill="#0f3a44" stroke="#7fd4c8" strokeWidth="2" />
            <text x="536" y="496" fill="#9fd4c8" fontSize="13" fontStyle="italic">
              silverfish pool (the hint)
            </text>
            <text x="560" y="430" fill="#e8d9a8" fontSize="15">
              ⬟ ● ▲ ✦
            </text>
          </g>

          {/* ② Nave */}
          <g>
            <rect x="650" y="400" width="240" height="120" rx="10" fill="url(#tcStone)" stroke="#3d565c" strokeWidth="2.5" />
            <g stroke="#31454c" strokeWidth="7">
              <line x1="700" y1="410" x2="700" y2="512" />
              <line x1="770" y1="410" x2="770" y2="512" />
              <line x1="840" y1="410" x2="840" y2="512" />
            </g>
            <rect x="726" y="446" width="46" height="58" rx="4" fill="#243b41" stroke="#5b7d84" strokeWidth="2" />
            <text x="749" y="480" textAnchor="middle" fill="#a8c6c0" fontSize="11">
              OATHS
            </text>
          </g>

          {/* Ⓣ Gallery corridor */}
          <g>
            <path d="M890,470 L1020,560 L1020,610 L890,520 Z" fill="url(#tcStone)" stroke="#3d565c" strokeWidth="2.5" />
            <g fill="#ffd98a">
              <circle cx="912" cy="497" r="4.5" />
              <circle cx="938" cy="512" r="4.5" />
              <circle cx="958" cy="530" r="4.5" />
              <circle cx="984" cy="544" r="4.5" />
              <circle cx="1004" cy="560" r="4.5" />
            </g>
            <text x="900" y="462" fill="#ffd98a" fontSize="13" fontStyle="italic">
              lamp-limpets — step the glow
            </text>
          </g>

          {/* ③ Bell Well */}
          <g>
            <rect x="1020" y="440" width="130" height="330" rx="12" fill="url(#tcStone)" stroke="#3d565c" strokeWidth="2.5" />
            <path
              d="M1035,470 q50,60 0,120 M1150,500 q-50,60 0,120 M1035,650 q50,50 0,100"
              fill="none"
              stroke="#31454c"
              strokeWidth="4"
            />
            <path d="M1058,560 q27,-24 54,0 l-8,44 q-19,10 -38,0 Z" fill="#33502f" stroke="#6d8f5a" strokeWidth="2.5" />
            <circle cx="1085" cy="616" r="4" fill="#6d8f5a" />
            <g fill="#5a4a56">
              <circle cx="1052" cy="552" r="6" />
              <circle cx="1122" cy="566" r="6" />
              <circle cx="1090" cy="528" r="6" />
            </g>
            <text x="1158" y="560" fill="#9a8aa0" fontSize="13" fontStyle="italic">
              3 reachers, dormant on the bell
            </text>
            <text x="1158" y="580" fill="#6d8f5a" fontSize="13" fontStyle="italic">
              the bell hums the refrain
            </text>
          </g>

          {/* ④ Keeper's Cell */}
          <g>
            <rect x="850" y="660" width="170" height="100" rx="10" fill="url(#tcStone)" stroke="#4a6e9c" strokeWidth="2.5" />
            <g stroke="#57808a" strokeWidth="1.5" opacity=".9">
              <line x1="866" y1="676" x2="866" y2="694" />
              <line x1="872" y1="676" x2="872" y2="694" />
              <line x1="878" y1="676" x2="878" y2="694" />
              <line x1="884" y1="676" x2="884" y2="694" />
              <line x1="862" y1="685" x2="888" y2="685" />
              <line x1="898" y1="676" x2="898" y2="694" />
              <line x1="904" y1="676" x2="904" y2="694" />
              <line x1="910" y1="676" x2="910" y2="694" />
              <line x1="916" y1="676" x2="916" y2="694" />
              <line x1="894" y1="685" x2="920" y2="685" />
            </g>
            <text x="866" y="716" fill="#8fb0c4" fontSize="12" fontStyle="italic">
              tallies past counting
            </text>
            <rect x="944" y="700" width="56" height="44" rx="6" fill="#16242c" stroke="#4a6e9c" strokeWidth="1.5" />
            <text x="972" y="726" textAnchor="middle" fill="#8fb0c4" fontSize="11">
              the alcove
            </text>
          </g>

          {/* ⑤ The Heart */}
          <g>
            <rect x="1020" y="770" width="420" height="180" rx="14" fill="url(#tcStone)" stroke="#6e4550" strokeWidth="3" />
            <circle cx="1330" cy="856" r="40" fill="url(#tcGlowW)" />
            <circle cx="1330" cy="856" r="24" fill="#241d16" stroke="#c9a25a" strokeWidth="3" />
            <path d="M1300,830 q30,52 60,0 M1300,882 q30,-52 60,0" fill="none" stroke="#0a0a0f" strokeWidth="7" />
            <text x="1330" y="920" textAnchor="middle" fill="#c9a25a" fontSize="13" fontStyle="italic">
              the sealed lantern · black chains
            </text>
            <g transform="translate(1230,828)">
              <rect x="-7" y="0" width="14" height="34" rx="6" fill="#3a4650" />
              <circle cx="0" cy="-9" r="8" fill="#3a4650" />
            </g>
            <text x="1230" y="886" textAnchor="middle" fill="#8fa4b0" fontSize="12">
              EDRIK · held
            </text>
            <g transform="translate(1100,840)">
              <path d="M0,-26 q16,10 10,34 q-10,16 -20,0 q-6,-24 10,-34 Z" fill="#153842" stroke="#7fd4c8" strokeWidth="2" />
              <path d="M-14,10 q-20,16 -30,2 M14,10 q20,16 30,2" fill="none" stroke="#101418" strokeWidth="6" />
            </g>
            <text x="1100" y="900" textAnchor="middle" fill="#7fd4c8" fontSize="12">
              NEREA / the thing
            </text>
          </g>
        </g>
      )}

      {/* route line */}
      <path
        d="M470,130 C520,300 540,380 560,447 L770,460 L940,510 L1085,530 L1085,700 L935,710 L935,760 L1120,820"
        fill="none"
        stroke="#e8d9a8"
        strokeWidth="2.5"
        strokeDasharray="7 7"
        opacity=".7"
      />

      {/* live pins */}
      {ROOMS.map((room) => {
        const on = room.id === currentId;
        return (
          <g
            key={room.id}
            className={`tc-pin${on ? " on" : ""}`}
            onClick={() => onPick(room)}
            role="button"
            tabIndex={0}
            aria-label={`${room.numeral} ${room.title}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onPick(room);
            }}
          >
            {on && <circle cx={room.x} cy={room.y} r="27" fill={room.color} opacity=".28" className="tc-pulse" />}
            <circle cx={room.x} cy={room.y} r="15" fill={room.color} stroke={on ? "#fff" : "none"} strokeWidth="2" />
            <text
              x={room.x}
              y={room.y + 6}
              textAnchor="middle"
              fontSize="17"
              fontWeight="bold"
              fill="#0c0f12"
              style={{ pointerEvents: "none" }}
            >
              {/* 1 2 T 3 4 5 — the blueprint's own marker labels. */}
              {room.key.toUpperCase()}
            </text>
            <title>{`${room.numeral} ${room.title} — press ${room.key.toUpperCase()}`}</title>
          </g>
        );
      })}

      {/* party marker */}
      <g
        className="tc-marker"
        transform={`translate(${marker.x},${marker.y})`}
        onPointerDown={(e) => {
          e.stopPropagation();
          dragging.current = true;
          (e.target as Element).setPointerCapture?.(e.pointerId);
        }}
      >
        <circle r="19" fill="#e8d9a8" opacity=".18" />
        <circle r="10" fill="#e8d9a8" stroke="#0c0f12" strokeWidth="2" />
        <text y="-26" textAnchor="middle" fontSize="12" fill="#e8d9a8" style={{ pointerEvents: "none" }}>
          PARTY
        </text>
        <title>Drag me, or use ← → to walk the route</title>
      </g>
    </svg>
  );
}
