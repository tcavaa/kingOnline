import { ACHIEVEMENT_DEFS } from "../utils/achievements";
const GENERATED = new Set([
  "PERFECT_PLUS",
  "PLUS_PERFECTIONIST",
  "UNTOUCHABLE",
  "NEVER_BELOW_ZERO",
  "UNDERDOG",
]);
function Emblem({ code, def }) {
  if (GENERATED.has(code))
    return (
      <img
        src={`/art/achievements/${code}.webp`}
        width="80"
        height="80"
        loading="lazy"
        decoding="async"
        alt=""
      />
    );
  const Icon = def.Icon;
  return (
    <span className="k-vector-emblem">
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <path
          d="M40 4 69 21 69 59 40 76 11 59 11 21Z"
          fill="#252b24"
          stroke="#7e8975"
        />
        <path
          d="m40 10 24 14v32L40 70 16 56V24Z"
          fill="none"
          stroke="#cad1b9"
          strokeWidth=".5"
        />
        <path d="M28 66h24" stroke="#d7fa52" strokeWidth="2" />
      </svg>
      <Icon size={28} strokeWidth={1.2} />
    </span>
  );
}
export default function AchievementBadges({
  achievements,
  variant = "full",
  size,
}) {
  const entries = Object.entries(achievements || {}).filter(
    ([code, n]) => n > 0 && ACHIEVEMENT_DEFS[code],
  );
  if (!entries.length) return null;
  return (
    <div
      className={`k-achievements ${variant === "inline" ? "is-inline" : ""}`}
    >
      {entries.map(([code, count]) => {
        const def = ACHIEVEMENT_DEFS[code];
        return (
          <div
            key={code}
            className="k-achievement"
            title={`${def.label}: ${def.desc}${count > 1 ? ` (×${count})` : ""}`}
          >
            <div
              className="k-achievement-art"
              style={
                variant === "inline"
                  ? {
                      width: Math.max(24, size || 24),
                      height: Math.max(24, size || 24),
                    }
                  : undefined
              }
            >
              <Emblem code={code} def={def} />
            </div>
            {variant === "inline" ? (
              <span className="sr-only">{def.label}</span>
            ) : (
              <div>
                <strong>{def.label}</strong>
                <p>{def.desc}</p>
              </div>
            )}
            {count > 1 && (
              <small className="k-achievement-count">×{count}</small>
            )}
          </div>
        );
      })}
    </div>
  );
}
