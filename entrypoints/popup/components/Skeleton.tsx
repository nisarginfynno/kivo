import "./Skeleton.css";

// ---------------------------------------------------------------------------
// Primitive — a single shimmer block
// ---------------------------------------------------------------------------
interface BlockProps {
  height?: number | string;
  width?: string;
  borderRadius?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export function SkeletonBlock({
  height = 16,
  width = "100%",
  borderRadius = 4,
  className = "",
  style,
}: BlockProps) {
  return (
    <div
      className={`sk-block ${className}`}
      style={{
        height: typeof height === "number" ? `${height}px` : height,
        width,
        borderRadius:
          typeof borderRadius === "number" ? `${borderRadius}px` : borderRadius,
        ...style,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Shared: date / week navigator bar  (header in every tab)
// ---------------------------------------------------------------------------
export function SkeletonDateHeader() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#fff",
        borderRadius: 6,
        border: "1px solid #e5e7eb",
        padding: "4px 8px",
        marginBottom: 16,
        height: 42,
        boxSizing: "border-box",
      }}
    >
      {/* left chevron placeholder */}
      <SkeletonBlock width="28px" height={28} borderRadius={6} />
      {/* label */}
      <SkeletonBlock width="80px" height={14} borderRadius={4} />
      {/* right chevron placeholder */}
      <SkeletonBlock width="28px" height={28} borderRadius={6} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Today tab skeleton
// ---------------------------------------------------------------------------
export function TodaySkeleton() {
  return (
    <>
      {/* metrics row — 3 cards */}
      <div className="metrics-row" style={{ marginBottom: 12 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="metric-card"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              alignItems: "center",
            }}
          >
            <SkeletonBlock width="60px" height={10} borderRadius={3} />
            <SkeletonBlock width="80px" height={22} borderRadius={4} />
          </div>
        ))}
      </div>

      {/* leave cards row — 2 cards */}
      <div className="leave-info" style={{ marginBottom: 12 }}>
        <div className="leave-cards-row">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="leave-card"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 5,
                alignItems: "center",
              }}
            >
              <SkeletonBlock width="70px" height={10} borderRadius={3} />
              <SkeletonBlock width="40px" height={9} borderRadius={3} />
              <SkeletonBlock width="60px" height={22} borderRadius={4} />
            </div>
          ))}
        </div>
      </div>

      {/* time entries toggle button */}
      <div className="attendance-list">
        <div
          className="details-toggle"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <SkeletonBlock width="80px" height={12} borderRadius={3} />
          <SkeletonBlock width="50px" height={12} borderRadius={3} />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Weekly tab skeleton
// ---------------------------------------------------------------------------
export function WeeklySkeleton() {
  return (
    <div className="monthly-overview">
      <div className="monthly-content">
        {/* row 1 — 2 cards */}
        <div className="monthly-cards-row">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="monthly-card"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                alignItems: "center",
              }}
            >
              <SkeletonBlock width="65px" height={9} borderRadius={3} />
              <SkeletonBlock width="72px" height={24} borderRadius={4} />
            </div>
          ))}
        </div>

        {/* row 2 — 2 cards */}
        <div className="monthly-cards-row">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="monthly-card"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                alignItems: "center",
              }}
            >
              <SkeletonBlock width="65px" height={9} borderRadius={3} />
              <SkeletonBlock width="72px" height={24} borderRadius={4} />
            </div>
          ))}
        </div>

        {/* row 3 — 2 cards */}
        <div className="monthly-cards-row">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="monthly-card"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                alignItems: "center",
              }}
            >
              <SkeletonBlock width="65px" height={9} borderRadius={3} />
              <SkeletonBlock width="72px" height={24} borderRadius={4} />
            </div>
          ))}
        </div>

        {/* info row pill */}
        <div
          className="holidays-info"
          style={{ display: "flex", justifyContent: "center" }}
        >
          <SkeletonBlock width="160px" height={14} borderRadius={4} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monthly tab skeleton
// ---------------------------------------------------------------------------
export function MonthlySkeleton() {
  return (
    <div className="monthly-overview">
      <div className="monthly-content">
        {/* row 1 — 3 cards */}
        <div className="monthly-cards-row">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="monthly-card"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                alignItems: "center",
              }}
            >
              <SkeletonBlock width="55px" height={9} borderRadius={3} />
              <SkeletonBlock width="36px" height={24} borderRadius={4} />
            </div>
          ))}
        </div>

        {/* row 2 — 2 cards */}
        <div className="monthly-cards-row">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="monthly-card"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                alignItems: "center",
              }}
            >
              <SkeletonBlock width="72px" height={9} borderRadius={3} />
              <SkeletonBlock width="64px" height={24} borderRadius={4} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App-config (initial load) skeleton — mirrors Today layout but without header
// nav (we don't know the view yet)
// ---------------------------------------------------------------------------
export function AppLoadingSkeleton() {
  return (
    <div className="monthly-overview">
      <SkeletonDateHeader />

      <div className="metrics-row" style={{ marginBottom: 12 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="metric-card"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              alignItems: "center",
            }}
          >
            <SkeletonBlock width="60px" height={10} borderRadius={3} />
            <SkeletonBlock width="80px" height={22} borderRadius={4} />
          </div>
        ))}
      </div>

      <div className="leave-info" style={{ marginBottom: 12 }}>
        <div className="leave-cards-row">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="leave-card"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 5,
                alignItems: "center",
              }}
            >
              <SkeletonBlock width="70px" height={10} borderRadius={3} />
              <SkeletonBlock width="40px" height={9} borderRadius={3} />
              <SkeletonBlock width="60px" height={22} borderRadius={4} />
            </div>
          ))}
        </div>
      </div>

      <div className="attendance-list">
        <div
          className="details-toggle"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <SkeletonBlock width="80px" height={12} borderRadius={3} />
          <SkeletonBlock width="50px" height={12} borderRadius={3} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings skeleton
// ---------------------------------------------------------------------------
function SettingsSection({ rows }: { rows: number }) {
  return (
    <div className="settings-section">
      <SkeletonBlock
        width="80px"
        height={10}
        borderRadius={3}
        style={{ marginBottom: 12 }}
      />
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="settings-row"
          style={{
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ flex: 1, marginRight: 12 }}>
            <SkeletonBlock
              width="120px"
              height={13}
              borderRadius={3}
              style={{ marginBottom: 6 }}
            />
            <SkeletonBlock width="160px" height={10} borderRadius={3} />
          </div>
          <SkeletonBlock
            width="36px"
            height={20}
            borderRadius={10}
            style={{ flexShrink: 0 }}
          />
        </div>
      ))}
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="settings-view popup-container">
      <SettingsSection rows={3} />
      <SettingsSection rows={4} />
      <SettingsSection rows={1} />
    </div>
  );
}
