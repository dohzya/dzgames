import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readRoute } from "../routing";

describe("readRoute", () => {
  beforeEach(() => {
    // jsdom allows setting window.location.hash directly
    window.location.hash = "";
  });

  afterEach(() => {
    window.location.hash = "";
  });

  it("returns { page: 'list' } for empty hash", () => {
    window.location.hash = "";
    expect(readRoute()).toEqual({ page: "list" });
  });

  it("returns { page: 'game', gameId: 'hex-stack' } for #hex-stack", () => {
    window.location.hash = "hex-stack";
    expect(readRoute()).toEqual({ page: "game", gameId: "hex-stack" });
  });

  it("returns { page: 'list' } for unknown hash", () => {
    window.location.hash = "unknown-game";
    expect(readRoute()).toEqual({ page: "list" });
  });
});
