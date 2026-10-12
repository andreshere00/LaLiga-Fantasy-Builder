import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { NumberPagination } from "./NumberPagination";

afterEach(cleanup);

function Host({ total = 8 }: { total?: number }) {
  const [page, setPage] = useState(1);
  return <NumberPagination page={page} totalPages={total} onPageChange={setPage} />;
}

describe("NumberPagination", () => {
  it("reaches the final page while retaining focus inside the sliding window", () => {
    render(<Host />);
    for (let number = 3; number <= 8; number++) {
      const button = screen.getByRole("button", { name: "Page " + number });
      button.focus();
      fireEvent.click(button);
      expect(screen.getByText("Page " + number + " of 8")).toBeTruthy();
      expect(document.activeElement?.closest("nav")).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "Page 8" }).getAttribute("aria-current")).toBe("page");
  });

  it("clamps a selected page when the number of pages shrinks", () => {
    const { rerender } = render(<NumberPagination page={8} totalPages={8} onPageChange={() => {}} />);
    rerender(<NumberPagination page={8} totalPages={2} onPageChange={() => {}} />);
    expect(screen.getByText("Page 2 of 2")).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("hides navigation for a single page", () => {
    render(<Host total={1} />);
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
