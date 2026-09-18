import { createContext, useContext } from "react";

/**
 * How much picture the machine can afford (Plan 113). `fast` drops the
 * expensive passes — torch shadows, ambient occlusion, depth of field, the
 * pixel ratio — for a machine that cannot hold the frame rate.
 */
export interface Quality {
  fast: boolean;
}

export const QualityContext = createContext<Quality>({ fast: false });

export function useQuality(): Quality {
  return useContext(QualityContext);
}
