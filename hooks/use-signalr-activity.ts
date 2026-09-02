import { useState, useEffect } from "react";
import type { HubConnection } from "@microsoft/signalr";
import type { ClassActivity } from "@/src/types";

export function useSignalRActivity(connection: HubConnection | null) {
  const [activeActivity, setActiveActivity] = useState<ClassActivity | null>(null);

  useEffect(() => {
    if (!connection) return;

    const handleStartActivity = (data: Record<string, unknown>) => {
      setActiveActivity({
        activityId: String(data.activityId || ""),
        activityType: (data.activityType as ClassActivity["activityType"]) || "MultipleChoice",
        questionText: (data.questionText as string) || (data.title as string) || undefined,
        options: (data.options as string[]) || ["A", "B", "C", "D"],
        isLive: true,
      });
    };

    const handleStopActivity = () => {
      setActiveActivity((prev) => (prev ? { ...prev, isLive: false } : null));
    };

    connection.on("SendStartActivity", handleStartActivity);
    connection.on("SendStopActivity", handleStopActivity);

    return () => {
      connection.off("SendStartActivity", handleStartActivity);
      connection.off("SendStopActivity", handleStopActivity);
    };
  }, [connection]);

  const submitAnswer = async (activityId: string, answer: string) => {
    if (!connection) throw new Error("No SignalR connection established");
    await connection.invoke("SubmitActivityResponse", {
      activityId,
      response: answer,
    });
  };

  return { activeActivity, submitAnswer };
}
