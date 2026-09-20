import { useState, useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, Plus, Copy, Check } from "lucide-react";
import { DurakProvider, useDurak } from "./DurakContext";
import DurakTable from "./DurakTable";
import AvatarImg from "../components/AvatarImg";
import { unlockDurakSounds } from "./sounds";
import "./durak.css";
import ClubShell, { Wordmark } from "../components/ui/ClubShell";
import Sheet from "../components/ui/Sheet";

const TOAST_STYLES = {
  error: {
    bg: "linear-gradient(180deg, #a03428, #284b41)",
    color: "#f5f2e9",
    icon: "💥",
  },
  warning: {
    bg: "linear-gradient(180deg, #d5b982, #bea06b)",
    color: "#2b1a08",
    icon: "⚠️",
  },
  info: {
    bg: "linear-gradient(180deg, #fdf6e5, #f0e2c4)",
    color: "#eeeae1",
    icon: "🃏",
  },
};

/**
 * Game announcements. Centered under the opponents' row (above the table
 * cards) so they never cover the chat / score-sheet / exit buttons.
 */
function DurakToasts() {
  const { toasts } = useDurak();
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none"
      style={{ top: "27%", maxWidth: "90vw" }}
    >
      {toasts.map((t) => {
        const s = TOAST_STYLES[t.type] ?? TOAST_STYLES.info;
        return (
          <div
            key={t.id}
            className="durak-toast-pop inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold"
            style={{
              background: s.bg,
              color: s.color,
              border: "2px solid rgba(255,255,255,0.5)",
              boxShadow:
                "0 6px 22px rgba(20,12,8,0.4), inset 0 1px 0 rgba(255,255,255,0.35)",
            }}
          >
            <span className="text-base leading-none">{s.icon}</span>
            {t.message}
          </div>
        );
      })}
    </div>
  );
}

/** Small banner while the socket is re-establishing mid-game. */
function ReconnectBanner() {
  const { connected, phase } = useDurak();
  if (connected || phase !== "room") return null;
  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-typewriter font-bold"
      style={{
        background: "rgba(111,31,26,0.95)",
        color: "#f5f2e9",
        border: "1px solid rgba(255,226,190,0.45)",
      }}
    >
      <span className="w-2 h-2 rounded-full bg-red-300 animate-pulse" />
      კავშირი აღდგება…
    </div>
  );
}

function DurakLobby({ onExit }) {
  const { connected, profile, createRoom, joinRoom, publicRoom, sitPublic } =
    useDurak();
  const [target, setTarget] = useState("301");
  const [code, setCode] = useState("");
  const [dialog, setDialog] = useState(null);
  const ready = connected && !!profile?.name;
  return (
    <ClubShell
      page="durak"
      onHome={onExit}
      title="ჩეხური დურაკა"
      connected={connected}
    >
      <section className="k-ranking-heading k-durak-intro">
        <div>
          <span className="k-eyebrow">A CHANGE OF PACE / DURAK</span>
          <h1>
            ბოლო კარტი.
            <br />
            <em>ახალი დასაწყისი.</em>
          </h1>
          <p>
            36 კარტი. 2–6 მოთამაშე. ერთი გამარჯვებული.
            <br />
            მოიშორე კარტები და დარჩი თამაშში.
          </p>
        </div>
        <span className="k-durak-symbol" aria-hidden="true">
          ♣
        </span>
      </section>
      <section className="k-durak-match">
        <div>
          <span className="k-eyebrow">01 / THE OPEN TABLE</span>
          <h2>
            შემოუერთდი
            <br />
            თამაშს.
          </h2>
          <p>
            {publicRoom.roomCode
              ? `მაგიდა ${publicRoom.roomCode} · ლიმიტი ${publicRoom.targetScore}`
              : "ახალი კომპანია უკვე ერთი სვლით ახლოსაა."}
          </p>
          <button className="k-button" disabled={!ready} onClick={sitPublic}>
            {publicRoom.roomCode
              ? "დაჯექი მაგიდასთან"
              : "გახსენი საჯარო მაგიდა"}
            <ArrowRight size={18} />
          </button>
          {!profile?.name && (
            <button className="k-link" onClick={onExit}>
              ჯერ აირჩიე პროფილი <ArrowRight size={16} />
            </button>
          )}
        </div>
        <div className="k-six-seats">
          {Array.from({ length: 6 }, (_, i) => {
            const p = publicRoom.players[i];
            return (
              <div key={i}>
                {p ? (
                  <AvatarImg avatar={p.avatar} size={52} />
                ) : (
                  <span>
                    <Plus size={20} />
                  </span>
                )}
                <strong>{p?.name || "ღია ადგილი"}</strong>
                <small>SEAT / 0{i + 1}</small>
              </div>
            );
          })}
        </div>
      </section>
      <div className="k-durak-options">
        <button onClick={() => setDialog("create")}>
          <span className="k-eyebrow">02 / YOUR RULES</span>
          <h3>
            შენი მაგიდა.
            <br />
            შენი კომპანია.
          </h3>
          <span className="k-circle-arrow">
            <Plus size={23} />
          </span>
          <small>შექმენი პირადი ოთახი</small>
        </button>
        <button onClick={() => setDialog("join")}>
          <span className="k-eyebrow">03 / YOU'RE INVITED</span>
          <h3>
            მეგობრები
            <br />
            გელოდებიან?
          </h3>
          <span className="k-circle-arrow">
            <ArrowRight size={23} />
          </span>
          <small>შემოდი მოწვევის კოდით</small>
        </button>
      </div>
      {dialog && (
        <Sheet
          title={
            dialog === "create" ? "შენი თამაშის წესები." : "მოწვევა მიღებულია."
          }
          onClose={() => setDialog(null)}
        >
          <form
            className="k-profile-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready)
                dialog === "create"
                  ? createRoom(
                      Math.max(50, Math.min(5000, Number(target) || 301)),
                    )
                  : code.trim() && joinRoom(code.trim().toUpperCase());
            }}
          >
            {dialog === "create" ? (
              <label className="k-form-field">
                <span>ქულების ლიმიტი</span>
                <input
                  type="number"
                  min={50}
                  max={5000}
                  required
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
                <small>
                  ვინც ლიმიტს მიაღწევს, თამაშს ტოვებს. ბოლო დარჩენილი იგებს.
                </small>
              </label>
            ) : (
              <label className="k-form-field">
                <span>ოთახის კოდი</span>
                <input
                  required
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="DXXXXX"
                />
              </label>
            )}
            <button
              className="k-button"
              disabled={!ready || (dialog === "join" && !code.trim())}
            >
              {dialog === "create" ? "შექმენი მაგიდა" : "შეუერთდი თამაშს"}
              <ArrowRight size={18} />
            </button>
            {!profile?.name && (
              <button type="button" className="k-link" onClick={onExit}>
                აირჩიე პროფილი
              </button>
            )}
          </form>
        </Sheet>
      )}
    </ClubShell>
  );
}

function DurakWaiting({ onExit }) {
  const { room, mySeat, startMatch, leaveRoom, setTargetScore, connected } =
    useDurak();
  const [copied, setCopied] = useState(false);
  const [target, setTarget] = useState(room.targetScore);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => setTarget(room.targetScore), [room.targetScore]);
  const isCreator = mySeat === room.creatorSeat;
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.roomCode);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  const applyTarget = () => {
    const n = Math.max(50, Math.min(5000, Math.round(Number(target) || 301)));
    setTarget(n);
    if (n !== room.targetScore) setTargetScore(n);
  };
  return (
    <div className="k-wait-page">
      <header className="k-wait-nav">
        <Wordmark />
        <button className="k-link" onClick={leaveRoom}>
          <ArrowLeft size={17} />
          მაგიდის დატოვება
        </button>
        <span>DURAK / {room.isPublic ? "OPEN TABLE" : "PRIVATE"}</span>
      </header>
      <main className="k-wait-layout">
        <section className="k-wait-copy">
          <span className="k-eyebrow">GOOD COMPANY. GREAT GAME.</span>
          <h1>
            შენი მაგიდა
            <br />
            <em>გელოდება.</em>
          </h1>
          <p>
            თამაში იწყება ორი მოთამაშით.
            <br />
            მოიწვიე კიდევ ოთხი მეგობარი.
          </p>
          <div className="k-invite-ticket">
            <span>მოწვევის კოდი</span>
            <div>
              <strong>{room.roomCode}</strong>
              <button
                className="k-icon-button"
                onClick={copyCode}
                aria-label="კოდის კოპირება"
              >
                {copied ? <Check size={20} /> : <Copy size={20} />}
              </button>
            </div>
            <small role="status">
              {copied ? "კოდი დაკოპირდა." : "გაუზიარე კოდი მეგობრებს."}
            </small>
          </div>
          <label className="k-stack-field">
            ქულების ლიმიტი
            {isCreator ? (
              <input
                className="k-input"
                type="number"
                min={50}
                max={5000}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                onBlur={applyTarget}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              />
            ) : (
              <strong>{room.targetScore}</strong>
            )}
          </label>
          <button
            className="k-button"
            disabled={!connected || !isCreator || room.players.length < 2}
            onClick={startMatch}
          >
            {isCreator
              ? room.players.length < 2
                ? "ველოდებით მეორე მოთამაშეს"
                : "დავიწყოთ თამაში"
              : "წამყვანი დაიწყებს თამაშს"}
            <ArrowRight size={18} />
          </button>
          <button className="k-link" onClick={onExit}>
            კინგზე დაბრუნება · ადგილი შენარჩუნდება
          </button>
        </section>
        <section className="k-durak-wait">
          <span className="k-eyebrow">
            YOUR COMPANY / {room.players.length} OF 6
          </span>
          <span className="k-durak-wait-suit" aria-hidden="true">
            ♣
          </span>
          <div className="k-six-seats">
            {Array.from({ length: 6 }, (_, i) => {
              const p = room.players[i];
              return (
                <div key={i}>
                  {p ? (
                    <AvatarImg avatar={p.avatar} size={64} />
                  ) : (
                    <span>
                      <Plus size={24} />
                    </span>
                  )}
                  <strong>{p?.name || "ღია ადგილი"}</strong>
                  <small>
                    {p
                      ? p.connected === false
                        ? "კავშირი წყდება…"
                        : p.seat === mySeat
                          ? "შენი ადგილი"
                          : p.seat === room.creatorSeat
                            ? "წამყვანი"
                            : "მზადაა"
                      : "მოიწვიე მეგობარი"}
                  </small>
                </div>
              );
            })}
          </div>
        </section>
      </main>
      <footer className="k-wait-footer">
        THE LAST CARD IS A NEW BEGINNING.
      </footer>
    </div>
  );
}

function DurakInner({ onExit }) {
  const { phase, room } = useDurak();

  if (phase !== "room" || !room)
    return (
      <>
        <DurakToasts />
        <ReconnectBanner />
        <DurakLobby onExit={onExit} />
      </>
    );
  if (room.status === "waiting")
    return (
      <>
        <DurakToasts />
        <ReconnectBanner />
        <DurakWaiting onExit={onExit} />
      </>
    );
  return (
    <>
      <DurakToasts />
      <ReconnectBanner />
      <DurakTable onExit={onExit} />
    </>
  );
}

/**
 * ჩეხური დურაკა — standalone section mounted from the King lobby. `profile`
 * is the King profile currently locked in (may be null when returning to a
 * live game after refresh — rejoin runs on the stored name).
 */
export default function DurakApp({ profile, onExit }) {
  // Prime the sound elements on the first tap/click inside the durak
  // section — required by browser autoplay policies.
  useEffect(() => {
    const unlock = () => {
      unlockDurakSounds();
    };
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, []);

  return (
    <DurakProvider profile={profile}>
      <DurakInner onExit={onExit} />
    </DurakProvider>
  );
}
