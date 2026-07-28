import { useState, type FormEvent } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BoardCommentComposer, BoardCommentText } from "./BoardCommentUi";

describe("BoardCommentUi", () => {
  it("accepts multiple lines in the design-system textarea", async () => {
    const submit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault());

    function Harness() {
      const [value, setValue] = useState("");
      return (
        <BoardCommentComposer
          value={value}
          onChange={setValue}
          onSubmit={submit}
          submitting={false}
          placeholder="댓글을 남겨주세요"
          submitLabel="등록"
        />
      );
    }

    render(<Harness />);
    const textbox = screen.getByRole("textbox", { name: "댓글을 남겨주세요" });
    await userEvent.type(textbox, "첫 줄{enter}둘째 줄");

    expect(textbox).toBeInstanceOf(HTMLTextAreaElement);
    expect(textbox).toHaveValue("첫 줄\n둘째 줄");
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    expect(submit).toHaveBeenCalledOnce();
  });

  it("renders stored newlines without collapsing long content", () => {
    render(<BoardCommentText>첫 줄{"\n"}둘째 줄</BoardCommentText>);

    const text = screen.getByText(/첫 줄/);
    expect(text).toHaveTextContent("첫 줄 둘째 줄");
    expect(text).toHaveClass("whitespace-pre-wrap", "break-words");
  });
});
