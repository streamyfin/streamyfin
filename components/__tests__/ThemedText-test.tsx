import { render, screen } from "@testing-library/react-native";

import { ThemedText } from "../ThemedText";

describe("ThemedText", () => {
  it("always applies white color", () => {
    render(<ThemedText>Text</ThemedText>);
    const text = screen.getByText("Text");
    expect(text).toHaveStyle({ color: "white" });
  });

  it("applies default styles by default", () => {
    render(<ThemedText>Text</ThemedText>);
    const text = screen.getByText("Text");
    expect(text).toHaveStyle({ fontSize: 16, lineHeight: 24 });
  });

  it("applies title styles", () => {
    render(<ThemedText type='title'>Text</ThemedText>);
    const text = screen.getByText("Text");
    expect(text).toHaveStyle({
      fontSize: 32,
      fontWeight: "bold",
      lineHeight: 32,
    });
  });

  it("applies defaultSemiBold styles", () => {
    render(<ThemedText type='defaultSemiBold'>Text</ThemedText>);
    const text = screen.getByText("Text");
    expect(text).toHaveStyle({
      fontSize: 16,
      lineHeight: 24,
      fontWeight: "600",
    });
  });

  it("applies subtitle styles", () => {
    render(<ThemedText type='subtitle'>Text</ThemedText>);
    const text = screen.getByText("Text");
    expect(text).toHaveStyle({ fontSize: 20, fontWeight: "bold" });
  });

  it("applies link styles with custom color", () => {
    render(<ThemedText type='link'>Text</ThemedText>);
    const text = screen.getByText("Text");
    expect(text).toHaveStyle({
      fontSize: 16,
      lineHeight: 30,
      color: "#0a7ea4",
    });
  });

  it("merges custom style prop", () => {
    render(<ThemedText style={{ marginTop: 10 }}>Text</ThemedText>);
    const text = screen.getByText("Text");
    expect(text).toHaveStyle({ marginTop: 10, color: "white" });
  });

  it("passes through additional TextProps", () => {
    render(<ThemedText numberOfLines={1}>Text</ThemedText>);
    const text = screen.getByText("Text");
    expect(text.props.numberOfLines).toBe(1);
  });
});
