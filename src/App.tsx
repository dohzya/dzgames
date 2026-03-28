import type React from "react";
import { useState, useEffect } from "react";
import GameList from "./pages/GameList";
import { HexStackGame } from "./games/hex-stack";
import { readRoute } from "./routing";

type Route = { readonly page: "list" } | { readonly page: "game"; readonly gameId: string };

export default function App(): React.ReactElement {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    function onHashChange() {
      setRoute(readRoute());
    }
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  function navigateTo(gameId: string) {
    window.location.hash = gameId;
    // hashchange will fire and update state
  }

  function navigateBack() {
    window.location.hash = "";
  }

  if (route.page === "game" && route.gameId === "hex-stack") {
    return <HexStackGame onBack={navigateBack} />;
  }
  return <GameList onSelect={navigateTo} />;
}
