import type { Metadata } from "next";
import { CodeCanvas } from "../../../components/canvas/CodeCanvas";

export const metadata: Metadata = {
  title: "Code canvas playground · 101 Codecrafts",
  description: "Learn creative coding with JavaScript and Canvas 2D — run, tweak and export generative art.",
};

export default function PlaygroundPage() {
  return <CodeCanvas />;
}
