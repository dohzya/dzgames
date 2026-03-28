type Route = { readonly page: "list" } | { readonly page: "game"; readonly gameId: string };

export function readRoute(): Route {
  const hash = window.location.hash.slice(1); // remove leading #
  if (hash === "hex-stack") return { page: "game", gameId: "hex-stack" };
  return { page: "list" };
}
