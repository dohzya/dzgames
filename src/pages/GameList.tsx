import type React from "react";
import { META } from "../games/hex-stack";

const GAMES = [META] as const;

type GameListProps = {
  readonly onSelect: (gameId: string) => void;
};

export default function GameList({ onSelect }: GameListProps): React.ReactElement {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #e8eeff 0%, #f5e8ff 50%, #e8f5ff 100%)",
        color: "#2a3050",
        fontFamily: "system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <h1
        style={{
          fontSize: 36,
          fontWeight: 900,
          letterSpacing: 5,
          marginBottom: 8,
          color: "#5060a0",
          textShadow: "0 2px 12px rgba(100,120,220,0.15)",
        }}
      >
        DZ GAMES
      </h1>
      <p style={{ color: "#8090c0", marginBottom: 40, fontSize: 14 }}>Sélectionne un jeu</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 16,
          width: "100%",
          maxWidth: 680,
        }}
      >
        {GAMES.map((game) => (
          <div
            key={game.id}
            style={{
              background: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(160,180,255,0.3)",
              borderRadius: 20,
              padding: "24px 28px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              boxShadow: "0 4px 24px rgba(100,120,220,0.08)",
              backdropFilter: "blur(8px)",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 800,
                color: "#4050a0",
                letterSpacing: 1,
              }}
            >
              {game.title}
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: "#7080b0",
                lineHeight: 1.6,
                flexGrow: 1,
              }}
            >
              {game.description}
            </p>
            <button
              onClick={() => {
                onSelect(game.id);
              }}
              style={{
                background: "linear-gradient(135deg, #a0b4ff 0%, #c0a8ff 100%)",
                border: "none",
                color: "#fff",
                borderRadius: 12,
                padding: "10px 0",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: 1.5,
                transition: "all 0.15s",
                boxShadow: "0 2px 8px rgba(120,100,220,0.25)",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.filter = "brightness(1.1)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.filter = "none";
              }}
            >
              JOUER
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
