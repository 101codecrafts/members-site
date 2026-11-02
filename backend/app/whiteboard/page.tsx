import type { Metadata } from "next";
import { BoardList } from "../../components/canvas/BoardList";

export const metadata: Metadata = {
  title: "Whiteboard · 101 Codecrafts",
  description: "Collaborative whiteboards for 101 Codecrafts teams, with AI that explains your sketches.",
};

export default function WhiteboardsPage() {
  return <BoardList />;
}
