import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BouncingBall } from "./BouncingBall";

describe("BouncingBall", () => {
  it("render_default_sizeIsMediumAndHiddenFromAssistiveTech", () => {
    const { container } = render(<BouncingBall />);
    const root = container.firstElementChild!;
    expect(root.className).toContain("bouncing-ball--md");
    expect(root.getAttribute("aria-hidden")).toBe("true");
  });

  it("render_sizeProp_appliesSizeModifier", () => {
    const { container } = render(<BouncingBall size="xl" />);
    expect(container.firstElementChild!.className).toContain("bouncing-ball--xl");
  });
});
