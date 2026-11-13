import type { LayerId } from "./layers";

/** The element id of one group's row in a layer's grid. */
export const groupAnchor = (layer: LayerId, g: string) => `g-${layer}-${g}`;
