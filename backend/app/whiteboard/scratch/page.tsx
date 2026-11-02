import type { Metadata } from "next";
import { WhiteboardClient } from "../../../components/canvas/WhiteboardClient";

export const metadata: Metadata = { title: "Scratch board · 101 Codecrafts" };

/** Local-only board (saved in this browser). No account required. */
export default function ScratchBoardPage() {
  return <WhiteboardClient boardId={null} title="Scratch board" />;
}
