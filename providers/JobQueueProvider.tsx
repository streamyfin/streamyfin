import { useJobProcessor } from "@/utils/atoms/queue";
import type React from "react";
import { createContext } from "react";

const JobQueueContext = createContext(null);

export const JobQueueProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  useJobProcessor();

  return (
    <JobQueueContext.Provider value={null}>{children}</JobQueueContext.Provider>
  );
};
